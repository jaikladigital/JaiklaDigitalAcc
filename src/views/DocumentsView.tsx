import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarClock,
  CheckCircle2,
  CopyPlus,
  Eye,
  FileCheck2,
  FileText,
  History,
  Layers,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountingDocument,
  CompanyProfile,
  Customer,
  DocumentCopyType,
  DocumentIssueMode,
  DocumentItem,
  DocumentStatus,
  DocumentType,
  FIELD_LIMITS,
  PaymentMethod,
  Project,
  UserProfile,
  clampString,
} from '../types/accounting';
import {
  buildRevisionDocNumber,
  formatShortDate,
  formatTHB,
  generateDocNumber,
  getDatePresetISO,
  getTodayISO,
} from '../utils/formatters';
import { bahtText } from '../utils/thaiBaht';
import { confirmDelete, toastError, toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { auditDocumentWht, validateThaiTaxId } from '../utils/whtCompliance';
import { A4DocumentPreview } from '../components/A4DocumentPreview';
import { ResponsiveA4Frame } from '../components/ResponsiveA4Frame';
import { ThaiDatePickerField } from '../components/ThaiDatePickerField';
import { ThaiText } from '../components/ThaiText';
import { EntityLegalType } from '../types/accounting';

interface DocumentsViewProps {
  documents: AccountingDocument[];
  customers: Customer[];
  projects: Project[];
  company: CompanyProfile;
  teamUids: string[];
  currentUserProfile: UserProfile | null;
  preselectedCustomer: Customer | null;
  onClearPreselectedCustomer: () => void;
}

const DEFAULT_TERMS_QT =
  '1. ใบเสนอราคานี้มีผลบังคับใช้ 30 วัน นับจากวันที่ออกเอกสาร\n2. การชำระเงินแบ่งเป็น 2 งวด: มัดจำ 50% เมื่อตกลงจ้าง และส่วนที่เหลือ 50% เมื่อส่งมอบงานเรียบร้อย\n3. ผู้ว่าจ้างตกลงให้ บริษัท ใจกล้า ดิจิตอล จำกัด ดำเนินการตามขอบเขตงานที่ระบุข้างต้น';

const DEFAULT_RED_NOTE =
  'หมายเหตุ: ราคานี้ยังไม่รวมค่าใช้จ่ายนอกเหนือจากขอบเขตงานที่ระบุ หากมีการเปลี่ยนแปลงเพิ่มเติมจะแจ้งให้ทราบล่วงหน้า';

function buildBlankDoc(
  type: DocumentType,
  existingDocs: AccountingDocument[],
  company: CompanyProfile,
  customer?: Customer | null
): AccountingDocument {
  const uid = auth.currentUser?.uid || 'draft';
  const vatRate = company.defaultVatRate ?? 7;
  const whtRate = company.defaultWhtRate ?? 3;
  const items: DocumentItem[] = [
    {
      description: 'ค่าบริการผลิตสื่อดิจิทัล / บริหารจัดการโครงการ (ตามรายละเอียดแนบ)',
      qty: 1,
      unit: 'งาน',
      unitPrice: 0,
      discount: 0,
      total: 0,
    },
  ];

  return {
    id: '',
    type,
    docNumber: generateDocNumber(type, existingDocs),
    docDate: getTodayISO(),
    dueDate: getTodayISO(),
    copyType: 'original',
    refDocId: '',
    refDocNumber: '',
    installmentInfo: {
      isInstallment: false,
      currentPeriod: 1,
      totalPeriods: 1,
      percentage: 100,
      label: '',
    },
    projectId: '',
    eventName: '',
    durationText: '',
    customerId: customer?.id || '',
    customerEntityType: (() => {
      const check = validateThaiTaxId(customer?.taxId);
      return check.detectedEntityType === 'individual' ? 'individual' : 'corporate';
    })(),
    customerSnapshot: {
      companyName: customer?.companyName || '',
      taxId: customer?.taxId || '',
      branch: customer?.branch || 'สำนักงานใหญ่',
      address: customer?.address || '',
      contactName: customer?.contactName || '',
      phone: customer?.phone || '',
      email: customer?.email || '',
    },
    items,
    subtotal: 0,
    vatEnabled: true,
    vatRate,
    vatAmount: 0,
    whtEnabled: true,
    whtRate,
    whtAmount: 0,
    grandTotal: 0,
    netPayable: 0,
    thaiBahtText: 'ศูนย์บาทถ้วน',
    notesRed: type === 'QT' ? DEFAULT_RED_NOTE : '',
    termsText: type === 'QT' ? DEFAULT_TERMS_QT : '',
    paymentMethod: 'transfer',
    paymentBank: company.bankName || 'ธนาคารไทยพาณิชย์ (SCB)',
    paymentChequeNo: '',
    paymentDate: getTodayISO(),
    watermarkConfig: {
      enabled: false,
      mode: 'text',
      text: company.companyNameEn || 'JAIKLA DIGITAL CO., LTD.',
      opacity: 0.08,
      angle: -32,
    },
    showStamp: true,
    showSignature: true,
    status: 'draft',
    issueMode: 'normal',
    specialDeliveryDate: '',
    revisionNumber: 0,
    specialCaseReason: '',
    showSpecialNoteOnPdf: false,
    lastEditedBy: '',
    createdBy: uid,
    teamUids: [uid],
  };
}

function recalculateDoc(d: AccountingDocument): AccountingDocument {
  const items = d.items.map((it) => {
    const qty = Math.max(0, Number(it.qty) || 0);
    const unitPrice = Math.max(0, Number(it.unitPrice) || 0);
    const discount = Math.max(0, Number(it.discount) || 0);
    const total = Math.max(0, Number((qty * unitPrice - discount).toFixed(2)));
    return { ...it, qty, unitPrice, discount, total };
  });

  const subtotal = Number(items.reduce((acc, it) => acc + it.total, 0).toFixed(2));
  const vatRate = Math.max(0, Number(d.vatRate) || 0);
  const whtRate = Math.max(0, Number(d.whtRate) || 0);
  const vatAmount = d.vatEnabled ? Number(((subtotal * vatRate) / 100).toFixed(2)) : 0;
  const grandTotal = Number((subtotal + vatAmount).toFixed(2));
  const whtAmount = d.whtEnabled ? Number(((subtotal * whtRate) / 100).toFixed(2)) : 0;
  const netPayable = Number(Math.max(0, grandTotal - whtAmount).toFixed(2));

  return {
    ...d,
    items,
    subtotal,
    vatAmount,
    grandTotal,
    whtAmount,
    netPayable,
    thaiBahtText: bahtText(grandTotal),
  };
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  documents,
  customers,
  projects,
  company,
  teamUids,
  currentUserProfile,
  preselectedCustomer,
  onClearPreselectedCustomer,
}) => {
  const isAdmin =
    currentUserProfile?.role === 'admin' ||
    auth.currentUser?.email === 'jaikladigital@gmail.com';

  const [mode, setMode] = useState<'list' | 'editor' | 'preview'>('list');
  const [splitPreview, setSplitPreview] = useState<boolean>(true);
  const [previewPageCount, setPreviewPageCount] = useState<number>(1);
  const [typeFilter, setTypeFilter] = useState<'ALL' | DocumentType>('ALL');
  const [issueModeFilter, setIssueModeFilter] = useState<'ALL' | DocumentIssueMode>('ALL');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<AccountingDocument>(() =>
    recalculateDoc(buildBlankDoc('QT', documents, company))
  );
  const [specialRevisionModal, setSpecialRevisionModal] = useState<{
    sourceDoc: AccountingDocument;
    issueMode: DocumentIssueMode;
    docDate: string;
    specialDeliveryDate: string;
    reason: string;
  } | null>(null);

  // Open new quotation directly if coming from CustomersView
  useEffect(() => {
    if (preselectedCustomer) {
      const fresh = recalculateDoc(
        buildBlankDoc('QT', documents, company, preselectedCustomer)
      );
      setDraft(fresh);
      setMode('editor');
      onClearPreselectedCustomer();
    }
  }, [preselectedCustomer, documents, company, onClearPreselectedCustomer]);

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (typeFilter !== 'ALL' && d.type !== typeFilter) return false;
      if (issueModeFilter !== 'ALL' && (d.issueMode || 'normal') !== issueModeFilter) return false;
      if (!q) return true;
      return (
        d.docNumber.toLowerCase().includes(q) ||
        d.eventName.toLowerCase().includes(q) ||
        d.customerSnapshot.companyName.toLowerCase().includes(q) ||
        (d.specialCaseReason || '').toLowerCase().includes(q)
      );
    });
  }, [documents, typeFilter, issueModeFilter, search]);

  const startNewDocument = (type: DocumentType) => {
    if (customers.length === 0) {
      toastError(
        'กรุณาเพิ่มลูกค้าอย่างน้อย 1 รายก่อน',
        'ไปที่เมนู "ลูกค้า" เพื่อบันทึกข้อมูลลูกค้า แล้วระบบจะดึงข้อมูลมาให้อัตโนมัติ'
      );
      return;
    }
    const fresh = recalculateDoc(buildBlankDoc(type, documents, company, customers[0]));
    setDraft(fresh);
    setMode('editor');
  };

  const openEditor = (d: AccountingDocument) => {
    setDraft(recalculateDoc(JSON.parse(JSON.stringify(d))));
    setMode('editor');
  };

  const openPrintOnly = (d: AccountingDocument) => {
    setDraft(recalculateDoc(JSON.parse(JSON.stringify(d))));
    setMode('preview');
  };

  const handleSelectCustomer = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (!cust) return;
    const taxCheck = validateThaiTaxId(cust.taxId);
    const inferredType: EntityLegalType =
      taxCheck.detectedEntityType === 'individual' ? 'individual' : 'corporate';
    setDraft((prev) => ({
      ...prev,
      customerId: cust.id,
      customerEntityType: inferredType,
      customerSnapshot: {
        companyName: cust.companyName,
        taxId: cust.taxId || '',
        branch: cust.branch || 'สำนักงานใหญ่',
        address: cust.address,
        contactName: cust.contactName || '',
        phone: cust.phone || '',
        email: cust.email || '',
      },
    }));
  };

  const handleSelectProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) {
      setDraft((prev) => ({ ...prev, projectId: '' }));
      return;
    }
    const cust = customers.find((c) => c.id === proj.customerId);
    const custTaxCheck = validateThaiTaxId(cust?.taxId);
    setDraft((prev) => ({
      ...prev,
      projectId: proj.id,
      eventName: proj.eventName,
      durationText:
        proj.durationStart && proj.durationEnd
          ? `${formatShortDate(proj.durationStart)} - ${formatShortDate(proj.durationEnd)}`
          : prev.durationText,
      customerId: cust?.id || prev.customerId,
      customerEntityType: cust
        ? custTaxCheck.detectedEntityType === 'individual'
          ? 'individual'
          : 'corporate'
        : prev.customerEntityType,
      customerSnapshot: cust
        ? {
            companyName: cust.companyName,
            taxId: cust.taxId || '',
            branch: cust.branch || 'สำนักงานใหญ่',
            address: cust.address,
            contactName: cust.contactName || '',
            phone: cust.phone || '',
            email: cust.email || '',
          }
        : prev.customerSnapshot,
    }));
  };

  const updateItem = (idx: number, patch: Partial<DocumentItem>) => {
    setDraft((prev) => {
      const nextItems = prev.items.map((item, i) => (i === idx ? { ...item, ...patch } : item));
      return recalculateDoc({ ...prev, items: nextItems });
    });
  };

  const addItem = () => {
    if (draft.items.length >= FIELD_LIMITS.maxItems) {
      toastError('จำกัดสูงสุด 50 รายการต่อเอกสาร');
      return;
    }
    setDraft((prev) =>
      recalculateDoc({
        ...prev,
        items: [
          ...prev.items,
          { description: '', qty: 1, unit: 'งาน', unitPrice: 0, discount: 0, total: 0 },
        ],
      })
    );
  };

  const removeItem = (idx: number) => {
    if (draft.items.length <= 1) return;
    setDraft((prev) =>
      recalculateDoc({
        ...prev,
        items: prev.items.filter((_, i) => i !== idx),
      })
    );
  };

  const handleSaveDocument = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (!draft.customerId || !draft.eventName.trim()) {
      toastError('กรุณากรอกข้อมูลบังคับให้ครบ', 'ต้องเลือกลูกค้า และระบุ Event Name / กิจกรรม');
      return;
    }

    const clean = recalculateDoc(draft);
    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    // Ensure a linked project exists if user typed a new eventName manually without selecting one
    let resolvedProjectId = clean.projectId || '';
    if (!resolvedProjectId) {
      try {
        const projRef = await addDoc(collection(db, 'projects'), {
          eventName: clampString(clean.eventName, FIELD_LIMITS.eventName),
          durationStart: clean.docDate,
          durationEnd: clean.dueDate || clean.docDate,
          customerId: clean.customerId,
          customerName: clampString(clean.customerSnapshot.companyName, FIELD_LIMITS.companyName),
          status: 'active',
          budgetLimit: clean.subtotal,
          notes: `สร้างอัตโนมัติจากเอกสาร ${clean.docNumber}`,
          createdBy: uid,
          teamUids: activeTeam,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        resolvedProjectId = projRef.id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'projects');
      }
    }

    const payload = {
      type: clean.type,
      docNumber: clampString(clean.docNumber, 60),
      docDate: clean.docDate,
      dueDate: clean.dueDate || '',
      copyType: clean.copyType,
      refDocId: clean.refDocId || '',
      refDocNumber: clean.refDocNumber || '',
      installmentInfo: clean.installmentInfo || {
        isInstallment: false,
        currentPeriod: 1,
        totalPeriods: 1,
        percentage: 100,
        label: '',
      },
      projectId: resolvedProjectId,
      eventName: clampString(clean.eventName, FIELD_LIMITS.eventName),
      durationText: clampString(clean.durationText, 120),
      customerId: clean.customerId,
      customerEntityType: clean.customerEntityType || 'corporate',
      customerSnapshot: clean.customerSnapshot,
      items: clean.items,
      subtotal: clean.subtotal,
      vatEnabled: clean.vatEnabled,
      vatRate: clean.vatRate,
      vatAmount: clean.vatAmount,
      whtEnabled: clean.whtEnabled,
      whtRate: clean.whtRate,
      whtAmount: clean.whtAmount,
      grandTotal: clean.grandTotal,
      netPayable: clean.netPayable,
      thaiBahtText: clampString(clean.thaiBahtText, 400),
      notesRed: clampString(clean.notesRed, FIELD_LIMITS.notesRed),
      termsText: clampString(clean.termsText, FIELD_LIMITS.termsText),
      paymentMethod: clean.paymentMethod || 'transfer',
      paymentBank: clampString(clean.paymentBank, 150),
      paymentChequeNo: clampString(clean.paymentChequeNo, 100),
      paymentDate: clean.paymentDate || '',
      watermarkConfig: clean.watermarkConfig || {
        enabled: false,
        mode: 'text',
        text: 'JAIKLA DIGITAL CO., LTD.',
        opacity: 0.08,
        angle: -32,
      },
      showStamp: Boolean(clean.showStamp),
      showSignature: Boolean(clean.showSignature),
      status: clean.status,
      issueMode: clean.issueMode || 'normal',
      specialDeliveryDate: clean.specialDeliveryDate || '',
      revisionNumber: Math.min(99, Math.max(0, Number(clean.revisionNumber) || 0)),
      specialCaseReason: clampString(clean.specialCaseReason, FIELD_LIMITS.specialCaseReason),
      showSpecialNoteOnPdf: Boolean(clean.showSpecialNoteOnPdf),
      lastEditedBy: clampString(
        currentUserProfile?.displayName || auth.currentUser?.displayName || auth.currentUser?.email || uid,
        150
      ),
      teamUids: activeTeam,
      updatedAt: serverTimestamp(),
    };

    try {
      if (clean.id) {
        await updateDoc(doc(db, 'documents', clean.id), payload);
        setDraft({ ...clean, projectId: resolvedProjectId, lastEditedBy: payload.lastEditedBy });
        toastSuccess('บันทึกการแก้ไขเอกสารเรียบร้อย', clean.docNumber);
      } else {
        const refDoc = await addDoc(collection(db, 'documents'), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        setDraft({ ...clean, id: refDoc.id, projectId: resolvedProjectId, lastEditedBy: payload.lastEditedBy });
        toastSuccess('ออกเอกสารใหม่สำเร็จ', clean.docNumber);
      }
    } catch (error) {
      handleFirestoreError(error, clean.id ? OperationType.UPDATE : OperationType.CREATE, 'documents');
    }
  };

  /** Clone / Create Special Revision, Backdated, or Advance Document while preserving original */
  const handleCreateSpecialRevision = (sourceDoc: AccountingDocument) => {
    setSpecialRevisionModal({
      sourceDoc,
      issueMode: 'backdated',
      docDate: sourceDoc.docDate || getTodayISO(),
      specialDeliveryDate: sourceDoc.specialDeliveryDate || getTodayISO(),
      reason: '',
    });
  };

  const handleConfirmSpecialRevision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialRevisionModal) return;
    const { sourceDoc, issueMode, docDate, specialDeliveryDate, reason } = specialRevisionModal;

    const nextRev = (sourceDoc.revisionNumber ?? 0) + 1;
    const nextNumber =
      issueMode === 'advance'
        ? generateDocNumber(sourceDoc.type, documents, docDate)
        : buildRevisionDocNumber(sourceDoc.docNumber, nextRev);

    const cloned = recalculateDoc({
      ...JSON.parse(JSON.stringify(sourceDoc)),
      id: '',
      docNumber: nextNumber,
      docDate: docDate || sourceDoc.docDate,
      refDocId: sourceDoc.id,
      refDocNumber: sourceDoc.docNumber,
      issueMode,
      specialDeliveryDate: specialDeliveryDate || '',
      revisionNumber: nextRev,
      specialCaseReason: reason || '',
      showSpecialNoteOnPdf: false,
      status: 'draft' as DocumentStatus,
    });

    setSpecialRevisionModal(null);
    setDraft(cloned);
    setMode('editor');
    toastSuccess(
      'สร้างร่างเอกสารฉบับแก้ไข/พิเศษแล้ว',
      `ปรับแก้ข้อมูลที่ต้องการแล้วกด "บันทึกเอกสาร" (${nextNumber})`
    );
  };

  /** 1-Click Convert: QT -> INV (Supports Full Billing OR Installment Billing!) */
  const handleConvertQTtoINV = async (qtDoc: AccountingDocument) => {
    const { value: formValues } = await Swal.fire({
      title: 'สร้างใบแจ้งหนี้ / วางบิล จากใบเสนอราคา',
      html: `
        <div style="text-align:left;font-size:13.5px;color:#334155;">
          <p style="margin-bottom:10px;">อ้างอิง: <strong>${qtDoc.docNumber}</strong> · ยอดเต็ม ฿${formatTHB(qtDoc.subtotal)}</p>
          <label style="font-weight:600;display:block;margin-bottom:4px;">รูปแบบการวางบิล</label>
          <select id="swal-bill-mode" class="form-select mb-3">
            <option value="full">ออกบิลเต็มจำนวน (100%)</option>
            <option value="installment">แบ่งออกบิลเป็นงวด (Installment)</option>
          </select>
          <div id="swal-installment-fields" style="display:none;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
              <div>
                <label style="font-size:12px;font-weight:600;">งวดที่</label>
                <input id="swal-cur-period" type="number" min="1" value="1" class="form-control form-control-sm" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;">จากทั้งหมด (งวด)</label>
                <input id="swal-tot-period" type="number" min="1" value="2" class="form-control form-control-sm" />
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;">
              <div>
                <label style="font-size:12px;font-weight:600;">สัดส่วน (%)</label>
                <input id="swal-pct" type="number" min="1" max="100" value="50" class="form-control form-control-sm" />
              </div>
              <div>
                <label style="font-size:12px;font-weight:600;">คำอธิบายงวด</label>
                <input id="swal-label" type="text" value="มัดจำงวดที่ 1" class="form-control form-control-sm" />
              </div>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'สร้างใบแจ้งหนี้ (INV)',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#1d4ed8',
      customClass: { popup: 'jkd-swal-popup' },
      didOpen: () => {
        const sel = document.getElementById('swal-bill-mode') as HTMLSelectElement;
        const box = document.getElementById('swal-installment-fields') as HTMLDivElement;
        sel?.addEventListener('change', () => {
          box.style.display = sel.value === 'installment' ? 'block' : 'none';
        });
      },
      preConfirm: () => {
        const billMode = (document.getElementById('swal-bill-mode') as HTMLSelectElement).value;
        const cur = Number((document.getElementById('swal-cur-period') as HTMLInputElement).value) || 1;
        const tot = Number((document.getElementById('swal-tot-period') as HTMLInputElement).value) || 2;
        const pct = Number((document.getElementById('swal-pct') as HTMLInputElement).value) || 50;
        const label = (document.getElementById('swal-label') as HTMLInputElement).value || '';
        return { billMode, cur, tot, pct, label };
      },
    });

    if (!formValues) return;

    const isInst = formValues.billMode === 'installment';
    const ratio = isInst ? formValues.pct / 100 : 1;

    const scaledItems: DocumentItem[] = isInst
      ? [
          {
            description: `ชำระค่าบริการ ${qtDoc.eventName} (อ้างอิง ${qtDoc.docNumber}) — งวดที่ ${formValues.cur}/${formValues.tot} (${formValues.pct}% ${formValues.label})`,
            qty: 1,
            unit: 'งวด',
            unitPrice: Number((qtDoc.subtotal * ratio).toFixed(2)),
            discount: 0,
            total: Number((qtDoc.subtotal * ratio).toFixed(2)),
          },
        ]
      : JSON.parse(JSON.stringify(qtDoc.items));

    const newInv = recalculateDoc({
      ...JSON.parse(JSON.stringify(qtDoc)),
      id: '',
      type: 'INV' as DocumentType,
      docNumber: generateDocNumber('INV', documents),
      docDate: getTodayISO(),
      dueDate: getTodayISO(),
      refDocId: qtDoc.id,
      refDocNumber: qtDoc.docNumber,
      installmentInfo: {
        isInstallment: isInst,
        currentPeriod: isInst ? formValues.cur : 1,
        totalPeriods: isInst ? formValues.tot : 1,
        percentage: isInst ? formValues.pct : 100,
        label: isInst ? formValues.label : '',
      },
      items: scaledItems,
      notesRed: '',
      termsText: `กรุณาชำระเงินภายในกำหนด โดยโอนเข้าบัญชี ${company.bankName} เลขที่บัญชี ${company.bankAccountNo}`,
      status: 'issued' as DocumentStatus,
    });

    setDraft(newInv);
    setMode('editor');
    toastSuccess('เตรียมข้อมูลใบแจ้งหนี้แล้ว', 'ตรวจสอบข้อมูลและกด "บันทึกเอกสาร" เพื่อยืนยัน');
  };

  /** 1-Click Convert: INV -> REC */
  const handleConvertINVtoREC = async (invDoc: AccountingDocument) => {
    const newRec = recalculateDoc({
      ...JSON.parse(JSON.stringify(invDoc)),
      id: '',
      type: 'REC' as DocumentType,
      docNumber: generateDocNumber('REC', documents),
      docDate: getTodayISO(),
      dueDate: '',
      refDocId: invDoc.id,
      refDocNumber: invDoc.docNumber,
      paymentDate: getTodayISO(),
      watermarkConfig: {
        enabled: true,
        mode: 'text',
        text: 'ชำระแล้ว / PAID',
        opacity: 0.08,
        angle: -32,
      },
      termsText: 'ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ต่อเมื่อได้รับชำระเงินเรียบร้อยแล้วเท่านั้น',
      status: 'paid' as DocumentStatus,
    });

    // Also mark source INV as paid if not already
    if (invDoc.id && invDoc.status !== 'paid') {
      try {
        await updateDoc(doc(db, 'documents', invDoc.id), {
          status: 'paid',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `documents/${invDoc.id}`);
      }
    }

    setDraft(newRec);
    setMode('editor');
    toastSuccess('แปลงเป็นใบเสร็จรับเงินแล้ว', 'ตรวจสอบรายละเอียดการรับเงินและกด "บันทึกเอกสาร"');
  };

  const handleDeleteDoc = async (d: AccountingDocument) => {
    const ok = await confirmDelete(d.docNumber);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'documents', d.id));
      toastSuccess('ลบเอกสารเรียบร้อย');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `documents/${d.id}`);
    }
  };

  // ==================== FULL A4 PRINT PREVIEW MODE ====================
  if (mode === 'preview') {
    return (
      <div className="space-y-4 animate-figma-in">
        <div className="no-print figma-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('editor')}
              className="btn btn-sm btn-light border inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับไปแก้ไข
            </button>
            <span className="text-xs font-semibold text-slate-600 font-mono-num">
              {draft.docNumber} · {previewPageCount} หน้า A4
            </span>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="btn btn-sm btn-outline-secondary whitespace-nowrap"
            >
              กลับหน้ารายการ
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn btn-sm btn-primary inline-flex items-center justify-center gap-1.5 px-3 fw-semibold whitespace-nowrap"
            >
              <Printer className="w-4 h-4 shrink-0" />
              พิมพ์ / PDF ({previewPageCount} หน้า)
            </button>
          </div>
        </div>

        <div className="w-full max-w-[210mm] mx-auto pb-8">
          <ResponsiveA4Frame>
            <A4DocumentPreview
              docData={draft}
              company={company}
              onPageCountChange={setPreviewPageCount}
            />
          </ResponsiveA4Frame>
        </div>
      </div>
    );
  }

  // ==================== EDITOR + LIVE A4 SPLIT MODE ====================
  if (mode === 'editor') {
    return (
      <div className="space-y-4 animate-figma-in">
        {/* Sticky Editor Toolbar */}
        <div className="no-print figma-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 lg:sticky lg:top-2 z-20 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMode('list')}
              className="btn btn-sm btn-light border inline-flex items-center gap-1 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              รายการ
            </button>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 font-mono-num truncate">
                {draft.docNumber}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {draft.type === 'QT'
                  ? 'ใบเสนอราคา (Quotation)'
                  : draft.type === 'INV'
                    ? 'ใบแจ้งหนี้ / วางบิล / ส่งมอบ (Invoice)'
                    : 'ใบเสร็จรับเงิน (Receipt)'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="hidden sm:inline text-xs font-mono-num text-slate-500 px-2">
              {previewPageCount} หน้า A4
            </span>
            <button
              type="button"
              onClick={() => setSplitPreview(!splitPreview)}
              className="btn btn-sm btn-outline-secondary d-none d-xl-inline-flex align-items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              {splitPreview ? 'ซ่อนตัวอย่าง A4' : 'แสดงตัวอย่าง A4'}
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className="btn btn-sm btn-outline-primary inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              พิมพ์ A4 ({previewPageCount} หน้า)
            </button>
            <button
              type="button"
              onClick={handleSaveDocument}
              className="btn btn-sm btn-primary inline-flex items-center justify-center gap-1.5 px-3 fw-semibold whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              บันทึกเอกสาร
            </button>
          </div>
        </div>

        {/* Notice if staff opens a terminal (paid/cancelled) document */}
        {draft.id && !isAdmin && (draft.status === 'paid' || draft.status === 'cancelled') && (
          <div className="no-print p-3.5 rounded-xl border border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
            <span>
              <strong>เอกสารสถานะ {draft.status}:</strong> พนักงานทั่วไปไม่สามารถแก้ไขทับต้นฉบับที่ปิดยอดแล้วได้
              (สงวนสิทธิ์เฉพาะ Admin) — คุณสามารถสร้างเป็นฉบับแก้ไขใหม่ (Rev.) แทนได้ทันที
            </span>
            <button
              type="button"
              onClick={() => handleCreateSpecialRevision(draft)}
              className="btn btn-sm btn-warning fw-semibold inline-flex items-center gap-1"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              สร้างฉบับแก้ไข / ย้อนหลังใหม่
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Bootstrap 5 Document Builder Form */}
          <div className={`${splitPreview ? 'xl:col-span-6' : 'xl:col-span-12'} no-print space-y-4`}>
            {/* Section 1: Header & Type */}
            <div className="figma-card p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                1. ประเภทเอกสารและเลขที่อ้างอิง
              </h3>
              <div className="row g-3">
                <div className="col-12 col-sm-6">
                  <label className="form-label">ประเภทเอกสาร</label>
                  <select
                    className="form-select fw-semibold"
                    value={draft.type}
                    onChange={(e) => {
                      const nextType = e.target.value as DocumentType;
                      setDraft((prev) => ({
                        ...prev,
                        type: nextType,
                        docNumber: prev.id ? prev.docNumber : generateDocNumber(nextType, documents),
                      }));
                    }}
                  >
                    <option value="QT">ใบเสนอราคา (QT)</option>
                    <option value="INV">ใบแจ้งหนี้ / วางบิล / ส่งมอบ (INV)</option>
                    <option value="REC">ใบเสร็จรับเงิน (REC)</option>
                  </select>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">เลขที่เอกสาร</label>
                  <input
                    type="text"
                    className="form-control font-mono-num fw-bold"
                    value={draft.docNumber}
                    onChange={(e) => setDraft({ ...draft, docNumber: e.target.value })}
                  />
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">ฉบับเอกสาร</label>
                  <select
                    className="form-select"
                    value={draft.copyType}
                    onChange={(e) =>
                      setDraft({ ...draft, copyType: e.target.value as DocumentCopyType })
                    }
                  >
                    <option value="original">ต้นฉบับ / Original</option>
                    <option value="copy">สำเนา / Copy</option>
                  </select>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label">สถานะเอกสาร</label>
                  <select
                    className="form-select"
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({ ...draft, status: e.target.value as DocumentStatus })
                    }
                  >
                    <option value="draft">ร่าง (Draft)</option>
                    <option value="issued">ออกเอกสารแล้ว (Issued)</option>
                    <option value="approved">อนุมัติแล้ว (Approved)</option>
                    <option value="paid">ชำระเงินแล้ว (Paid)</option>
                    <option value="cancelled">ยกเลิก (Cancelled)</option>
                  </select>
                </div>
                <div className="col-12 col-lg-6">
                  <ThaiDatePickerField
                    label="วันที่เอกสาร (ว/ด/ป)"
                    value={draft.docDate}
                    onChange={(nextIso) => setDraft({ ...draft, docDate: nextIso })}
                  />
                </div>
                <div className="col-12 col-lg-6">
                  <ThaiDatePickerField
                    label={draft.type === 'QT' ? 'ยืนราคาถึงวันที่ (ว/ด/ป)' : 'วันครบกำหนด (ว/ด/ป)'}
                    value={draft.dueDate || ''}
                    onChange={(nextIso) => setDraft({ ...draft, dueDate: nextIso })}
                    allowEmpty
                  />
                </div>
              </div>

              {/* Special Timing: Backdated / Advance Delivery / Revision Control */}
              <div className="mt-4 pt-3 border-t border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <CalendarClock className="w-4 h-4 text-blue-700" />
                    การแก้ไขข้อมูลย้อนหลัง / ทำเอกสารล่วงหน้า / กรณีพิเศษ
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { key: 'normal', label: 'ปกติ' },
                        { key: 'backdated', label: 'ย้อนหลัง' },
                        { key: 'advance', label: 'ล่วงหน้า' },
                        { key: 'special', label: 'กรณีพิเศษ' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setDraft({ ...draft, issueMode: m.key })}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
                          (draft.issueMode || 'normal') === m.key
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-slate-50/80 border border-slate-200 rounded-lg space-y-2.5">
                  {/* Quick Backdate / Advance Date Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-semibold me-1">ตั้งวันที่ด่วน:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          issueMode: 'backdated',
                          docDate: getDatePresetISO('prevMonthSameDay'),
                        })
                      }
                      className="btn btn-outline-secondary btn-sm py-0.5 px-2 text-[11px]"
                    >
                      -1 เดือน
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          issueMode: 'backdated',
                          docDate: getDatePresetISO('prevMonthEnd'),
                        })
                      }
                      className="btn btn-outline-secondary btn-sm py-0.5 px-2 text-[11px]"
                    >
                      สิ้นเดือนก่อน
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          docDate: getTodayISO(),
                        })
                      }
                      className="btn btn-outline-secondary btn-sm py-0.5 px-2 text-[11px]"
                    >
                      วันนี้
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          issueMode: 'advance',
                          docDate: getDatePresetISO('nextMonthStart'),
                        })
                      }
                      className="btn btn-outline-secondary btn-sm py-0.5 px-2 text-[11px]"
                    >
                      ต้นเดือนหน้า
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          issueMode: 'advance',
                          docDate: getDatePresetISO('nextMonthSameDay'),
                        })
                      }
                      className="btn btn-outline-secondary btn-sm py-0.5 px-2 text-[11px]"
                    >
                      +1 เดือน
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          docNumber: generateDocNumber(prev.type, documents, prev.docDate),
                        }))
                      }
                      className="btn btn-outline-primary btn-sm py-0.5 px-2 text-[11px] ms-auto"
                    >
                      รันเลขเอกสารตามเดือนที่เลือก
                    </button>
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-lg-6">
                      <ThaiDatePickerField
                        label="วันที่ส่งมอบพิเศษ (Special Delivery)"
                        value={draft.specialDeliveryDate || ''}
                        onChange={(nextIso) =>
                          setDraft({ ...draft, specialDeliveryDate: nextIso })
                        }
                        allowEmpty
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label text-xs">ครั้งที่แก้ไข (Revision)</label>
                      <div className="input-group input-group-sm">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          className="form-control font-mono-num"
                          value={draft.revisionNumber ?? 0}
                          onChange={(e) =>
                            setDraft({ ...draft, revisionNumber: Number(e.target.value) || 0 })
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => {
                              const nextRev = (prev.revisionNumber ?? 0) + 1;
                              return {
                                ...prev,
                                revisionNumber: nextRev,
                                docNumber: buildRevisionDocNumber(prev.docNumber, nextRev),
                              };
                            })
                          }
                          className="btn btn-outline-secondary"
                          title="เพิ่มเลขแก้ไขต่อท้ายเลขเอกสาร (-R)"
                        >
                          +Rev
                        </button>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label text-xs">เลขที่เอกสารอ้างอิงเดิม (Ref.)</label>
                      <input
                        type="text"
                        className="form-control form-control-sm font-mono-num"
                        value={draft.refDocNumber || ''}
                        onChange={(e) => setDraft({ ...draft, refDocNumber: e.target.value })}
                        placeholder="เช่น QUO_JKD..."
                      />
                    </div>
                    <div className="col-12">
                      <label className="form-label text-xs">
                        เหตุผล / บันทึกกรณีพิเศษ (ย้อนหลัง / ล่วงหน้า / ปรับเงื่อนไข)
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={draft.specialCaseReason || ''}
                        onChange={(e) =>
                          setDraft({ ...draft, specialCaseReason: e.target.value })
                        }
                        placeholder="เช่น ลูกค้าขอออกใบวางบิลล่วงหน้าเพื่อปิดงบไตรมาส หรือแก้ไขรายการย้อนหลัง"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="form-check-input m-0"
                        checked={Boolean(draft.showSpecialNoteOnPdf)}
                        onChange={(e) =>
                          setDraft({ ...draft, showSpecialNoteOnPdf: e.target.checked })
                        }
                      />
                      แสดงหัวข้อกรณีพิเศษ / ครั้งที่แก้ไข / วันส่งมอบ บนหน้ากระดาษ PDF
                    </label>
                    {draft.lastEditedBy && (
                      <span className="text-[11px] text-slate-500">
                        แก้ไขล่าสุดโดย: {draft.lastEditedBy}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Auto-fill Customer & Mandatory Event/Duration */}
            <div className="figma-card p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                2. ข้อมูลลูกค้า (Auto-fill) และรายละเอียด Event / โครงการ
              </h3>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">ดึงข้อมูลลูกค้าเก่า *</label>
                  <select
                    className="form-select"
                    value={draft.customerId}
                    onChange={(e) => handleSelectCustomer(e.target.value)}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">เชื่อมโยงโปรเจกต์ที่มีอยู่ (ตัวเลือก)</label>
                  <select
                    className="form-select"
                    value={draft.projectId || ''}
                    onChange={(e) => handleSelectProject(e.target.value)}
                  >
                    <option value="">-- สร้างโปรเจกต์ใหม่อัตโนมัติจาก Event Name --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.eventName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-7">
                  <label className="form-label">Event Name / กิจกรรม *</label>
                  <input
                    type="text"
                    className="form-control fw-semibold"
                    required
                    value={draft.eventName}
                    onChange={(e) => setDraft({ ...draft, eventName: e.target.value })}
                    placeholder="เช่น แคมเปญโฆษณาออนไลน์ Q4"
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label">Duration / ระยะเวลาดำเนินงาน</label>
                  <input
                    type="text"
                    className="form-control"
                    value={draft.durationText || ''}
                    onChange={(e) => setDraft({ ...draft, durationText: e.target.value })}
                    placeholder="เช่น 1 - 30 พ.ย. 2569"
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">Tax ID ลูกค้า</label>
                  <input
                    type="text"
                    className="form-control font-mono-num"
                    value={draft.customerSnapshot.taxId}
                    onChange={(e) => {
                      const nextTaxId = e.target.value;
                      const taxCheck = validateThaiTaxId(nextTaxId);
                      setDraft({
                        ...draft,
                        customerEntityType:
                          taxCheck.detectedEntityType !== 'unknown'
                            ? taxCheck.detectedEntityType
                            : draft.customerEntityType,
                        customerSnapshot: { ...draft.customerSnapshot, taxId: nextTaxId },
                      });
                    }}
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label">สถานะทางกฎหมายลูกค้า</label>
                  <select
                    className="form-select"
                    value={draft.customerEntityType || 'corporate'}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        customerEntityType: e.target.value as EntityLegalType,
                      })
                    }
                  >
                    <option value="corporate">นิติบุคคล (หัก ภ.ง.ด. 53)</option>
                    <option value="individual">บุคคลธรรมดา (ไม่หัก ภ.ง.ด. 53)</option>
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label">ผู้ติดต่อ / เบอร์โทร</label>
                  <input
                    type="text"
                    className="form-control"
                    value={`${draft.customerSnapshot.contactName} (${draft.customerSnapshot.phone})`}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        customerSnapshot: {
                          ...draft.customerSnapshot,
                          contactName: e.target.value,
                        },
                      })
                    }
                  />
                </div>

                {/* Installment Settings for INV */}
                {draft.type === 'INV' && (
                  <div className="col-12 pt-2 border-t border-slate-200">
                    <div className="form-check form-switch mb-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="instSwitch"
                        checked={Boolean(draft.installmentInfo?.isInstallment)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            installmentInfo: {
                              ...(draft.installmentInfo || {
                                currentPeriod: 1,
                                totalPeriods: 2,
                                percentage: 50,
                                label: '',
                              }),
                              isInstallment: e.target.checked,
                            },
                          })
                        }
                      />
                      <label className="form-check-label fw-semibold text-sm" htmlFor="instSwitch">
                        แสดงข้อมูลแบ่งจ่ายเป็นงวด (Installment Billing)
                      </label>
                    </div>
                    {draft.installmentInfo?.isInstallment && (
                      <div className="row g-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div className="col-3">
                          <label className="form-label text-xs">งวดที่</label>
                          <input
                            type="number"
                            min="1"
                            className="form-control form-control-sm font-mono-num"
                            value={draft.installmentInfo.currentPeriod}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                installmentInfo: {
                                  ...draft.installmentInfo!,
                                  currentPeriod: Number(e.target.value) || 1,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-3">
                          <label className="form-label text-xs">จาก (งวด)</label>
                          <input
                            type="number"
                            min="1"
                            className="form-control form-control-sm font-mono-num"
                            value={draft.installmentInfo.totalPeriods}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                installmentInfo: {
                                  ...draft.installmentInfo!,
                                  totalPeriods: Number(e.target.value) || 1,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-2">
                          <label className="form-label text-xs">%</label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            className="form-control form-control-sm font-mono-num"
                            value={draft.installmentInfo.percentage}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                installmentInfo: {
                                  ...draft.installmentInfo!,
                                  percentage: Number(e.target.value) || 100,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="col-4">
                          <label className="form-label text-xs">รายละเอียดงวด</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={draft.installmentInfo.label}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                installmentInfo: {
                                  ...draft.installmentInfo!,
                                  label: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Section 3: Line Items Table */}
            <div className="figma-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 m-0">
                  3. รายการสินค้าและบริการ
                </h3>
                <button
                  type="button"
                  onClick={addItem}
                  className="btn btn-sm btn-outline-primary inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มรายการ
                </button>
              </div>

              <div className="space-y-3">
                {draft.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-500">รายการที่ {idx + 1}</span>
                      {draft.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          ลบรายการ
                        </button>
                      )}
                    </div>
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      placeholder="รายละเอียดสินค้า / บริการ..."
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                    <div className="row g-2">
                      <div className="col-6 col-sm-3">
                        <label className="form-label text-xs">จำนวน</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="form-control form-control-sm font-mono-num"
                          value={item.qty}
                          onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-6 col-sm-2">
                        <label className="form-label text-xs">หน่วย</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={item.unit}
                          onChange={(e) => updateItem(idx, { unit: e.target.value })}
                        />
                      </div>
                      <div className="col-6 col-sm-3">
                        <label className="form-label text-xs">ราคา/หน่วย</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control form-control-sm font-mono-num"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-6 col-sm-2">
                        <label className="form-label text-xs">ส่วนลด</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-control form-control-sm font-mono-num"
                          value={item.discount}
                          onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })}
                        />
                      </div>
                      <div className="col-12 col-sm-2 text-sm-end">
                        <label className="form-label text-xs">รวม</label>
                        <div className="font-mono-num font-bold text-sm pt-1">
                          {formatTHB(item.total)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 4: Flexible Tax Engine & Watermark */}
            <div className="figma-card p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                4. ระบบคำนวณภาษีและปรับแต่งลายน้ำ (Watermark &amp; Stamp)
              </h3>

              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <div className="p-3 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="form-check form-switch m-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="vatSwitch"
                          checked={draft.vatEnabled}
                          onChange={(e) =>
                            setDraft((prev) => recalculateDoc({ ...prev, vatEnabled: e.target.checked }))
                          }
                        />
                        <label className="form-check-label fw-bold text-sm" htmlFor="vatSwitch">
                          คิดภาษีมูลค่าเพิ่ม (VAT)
                        </label>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          step="0.5"
                          disabled={!draft.vatEnabled}
                          className="form-control form-control-sm font-mono-num text-end"
                          value={draft.vatRate}
                          onChange={(e) =>
                            setDraft((prev) =>
                              recalculateDoc({ ...prev, vatRate: Number(e.target.value) })
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono-num">
                      ยอด VAT: ฿{formatTHB(draft.vatAmount)}
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-3 border border-slate-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="form-check form-switch m-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="whtSwitch"
                          checked={draft.whtEnabled}
                          onChange={(e) =>
                            setDraft((prev) => recalculateDoc({ ...prev, whtEnabled: e.target.checked }))
                          }
                        />
                        <label className="form-check-label fw-bold text-sm" htmlFor="whtSwitch">
                          หัก ณ ที่จ่าย (WHT)
                        </label>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          min="0"
                          max="30"
                          step="0.5"
                          disabled={!draft.whtEnabled}
                          className="form-control form-control-sm font-mono-num text-end"
                          value={draft.whtRate}
                          onChange={(e) =>
                            setDraft((prev) =>
                              recalculateDoc({ ...prev, whtRate: Number(e.target.value) })
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 font-mono-num">
                      ยอดหัก ณ ที่จ่าย: -฿{formatTHB(draft.whtAmount)}
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const whtIssues = auditDocumentWht(draft);
                if (whtIssues.length === 0) return null;
                return (
                  <div className="mb-3 space-y-1.5">
                    {whtIssues.map((iss, idx) => (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                          iss.severity === 'error'
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        }`}
                      >
                        <span className="font-bold shrink-0">
                          {iss.severity === 'error' ? '⚠ เกณฑ์สรรพากร:' : 'คำแนะนำภาษี:'}
                        </span>
                        <span>{iss.message}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Payment Method (INV & REC) */}
              {(draft.type === 'INV' || draft.type === 'REC') && (
                <div className="row g-2 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="col-md-4">
                    <label className="form-label text-xs">วิธีชำระเงิน</label>
                    <select
                      className="form-select form-select-sm"
                      value={draft.paymentMethod || 'transfer'}
                      onChange={(e) =>
                        setDraft({ ...draft, paymentMethod: e.target.value as PaymentMethod })
                      }
                    >
                      <option value="transfer">โอนเงิน (Transfer)</option>
                      <option value="cheque">เช็คสั่งจ่าย (Cheque)</option>
                      <option value="cash">เงินสด (Cash)</option>
                      <option value="other">อื่นๆ</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-xs">ธนาคาร / เลขที่อ้างอิง</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={draft.paymentBank || ''}
                      onChange={(e) => setDraft({ ...draft, paymentBank: e.target.value })}
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label text-xs">วันที่รับชำระ / เลขเช็ค</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-mono-num"
                      value={draft.paymentChequeNo || draft.paymentDate || ''}
                      onChange={(e) => setDraft({ ...draft, paymentChequeNo: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Watermark & E-Stamp Studio */}
              <div className="p-3 border border-slate-200 rounded-lg space-y-3 bg-slate-50/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="form-check form-switch m-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="wmSwitch"
                      checked={Boolean(draft.watermarkConfig?.enabled)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          watermarkConfig: {
                            ...(draft.watermarkConfig || {
                              mode: 'text',
                              text: 'JAIKLA DIGITAL CO., LTD.',
                              opacity: 0.08,
                              angle: -32,
                            }),
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                    <label className="form-check-label fw-bold text-sm" htmlFor="wmSwitch">
                      เปิดใช้งานลายน้ำ (Watermark)
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        className="form-check-input m-0"
                        checked={Boolean(draft.showStamp)}
                        onChange={(e) => setDraft({ ...draft, showStamp: e.target.checked })}
                      />
                      ตราประทับบริษัท
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        className="form-check-input m-0"
                        checked={Boolean(draft.showSignature)}
                        onChange={(e) => setDraft({ ...draft, showSignature: e.target.checked })}
                      />
                      ลายเซ็นดิจิทัล
                    </label>
                  </div>
                </div>

                {draft.watermarkConfig?.enabled && (
                  <div className="row g-2">
                    <div className="col-md-3">
                      <label className="form-label text-xs">รูปแบบลายน้ำ</label>
                      <select
                        className="form-select form-select-sm"
                        value={draft.watermarkConfig.mode}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            watermarkConfig: {
                              ...draft.watermarkConfig!,
                              mode: e.target.value as 'text' | 'image',
                            },
                          })
                        }
                      >
                        <option value="text">ข้อความ</option>
                        <option value="image">รูปโลโก้บริษัท</option>
                      </select>
                    </div>
                    {draft.watermarkConfig.mode === 'text' && (
                      <div className="col-md-5">
                        <label className="form-label text-xs">ข้อความลายน้ำ</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={draft.watermarkConfig.text}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              watermarkConfig: { ...draft.watermarkConfig!, text: e.target.value },
                            })
                          }
                          placeholder="JAIKLA DIGITAL CO.,LTD."
                        />
                      </div>
                    )}
                    <div className="col-md-4">
                      <label className="form-label text-xs">
                        ความทึบ ({Math.round((draft.watermarkConfig.opacity ?? 0.08) * 100)}%)
                      </label>
                      <input
                        type="range"
                        min="0.03"
                        max="0.3"
                        step="0.01"
                        className="form-range"
                        value={draft.watermarkConfig.opacity}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            watermarkConfig: {
                              ...draft.watermarkConfig!,
                              opacity: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Red & Terms */}
              <div className="row g-3 mt-1">
                <div className="col-12">
                  <label className="form-label text-danger">หมายเหตุสำคัญ (แสดงกรอบสีแดง)</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={2}
                    value={draft.notesRed || ''}
                    onChange={(e) => setDraft({ ...draft, notesRed: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">เงื่อนไขและข้อตกลงสัญญา</label>
                  <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    value={draft.termsText || ''}
                    onChange={(e) => setDraft({ ...draft, termsText: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live A4 Split Preview (Viewport-Responsive Multi-Page PDF) */}
          {splitPreview && (
            <div className="xl:col-span-6 w-full">
              <ResponsiveA4Frame>
                <A4DocumentPreview
                  docData={draft}
                  company={company}
                  onPageCountChange={setPreviewPageCount}
                />
              </ResponsiveA4Frame>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== LIST MODE ====================
  return (
    <div className="space-y-5 animate-figma-in">
      <div className="flex flex-col items-center text-center gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            <ThaiText text="ระบบออกเอกสารบัญชี (QT · INV · REC)" />
          </h1>
          <p className="thai-subtitle mt-1.5 mb-0">
            <ThaiText text="ออกใบเสนอราคา ใบแจ้งหนี้ และใบเสร็จรับเงิน แปลงข้ามเอกสารในคลิกเดียว แบ่งงวดชำระ คำนวณภาษี และพิมพ์ A4 PDF" />
          </p>
        </div>

        <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => startNewDocument('QT')}
            className="col-span-2 sm:col-span-1 figma-btn !rounded-xl min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 whitespace-nowrap border-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>สร้างใบเสนอราคา (QT)</span>
          </button>
          <button
            type="button"
            onClick={() => startNewDocument('INV')}
            className="figma-btn !rounded-xl min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 border border-blue-200 hover:bg-blue-100 whitespace-nowrap"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>สร้าง INV</span>
          </button>
          <button
            type="button"
            onClick={() => startNewDocument('REC')}
            className="figma-btn !rounded-xl min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 whitespace-nowrap"
          >
            <FileCheck2 className="w-4 h-4 shrink-0" />
            <span>สร้าง REC</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="figma-card p-3.5 sm:p-4 space-y-3 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5">
          <div className="grid grid-cols-2 sm:inline-flex gap-1 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            {(
              [
                { key: 'ALL', label: `ทั้งหมด (${documents.length})` },
                { key: 'QT', label: 'ใบเสนอราคา (QT)' },
                { key: 'INV', label: 'แจ้งหนี้/วางบิล (INV)' },
                { key: 'REC', label: 'ใบเสร็จรับเงิน (REC)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTypeFilter(tab.key)}
                className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[12.5px] sm:text-xs font-semibold leading-snug !rounded-lg transition-colors whitespace-nowrap text-center border-0 ${
                  typeFilter === tab.key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'bg-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            className="form-select w-full sm:w-auto sm:min-w-[190px] text-xs font-medium"
            value={issueModeFilter}
            onChange={(e) => setIssueModeFilter(e.target.value as 'ALL' | DocumentIssueMode)}
            aria-label="กรองตามโหมดเอกสาร"
          >
            <option value="ALL">ทุกโหมดการออกเอกสาร</option>
            <option value="normal">เอกสารปกติ</option>
            <option value="backdated">แก้ไข / ย้อนหลัง</option>
            <option value="advance">ออกล่วงหน้า (Advance)</option>
            <option value="special">กรณีพิเศษ (Special)</option>
          </select>
        </div>

        <div className="relative w-full lg:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="form-control !pl-9 w-full"
            placeholder="ค้นหาเลขที่เอกสาร, Event, ลูกค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Mobile Document Cards (< md) */}
      <div className="md:hidden space-y-3">
        {filteredDocs.length === 0 ? (
          <div className="figma-card p-6 text-center space-y-3">
            <Layers className="w-9 h-9 mx-auto text-slate-300" />
            <div className="text-sm font-bold text-slate-800">
              ยังไม่มีเอกสารในหมวดนี้
            </div>
            <p className="thai-prose text-[13px] text-slate-500 m-0 max-w-xs mx-auto">
              <ThaiText text="แตะปุ่มด้านล่างเพื่อเริ่มต้นออกใบเสนอราคา ใบแจ้งหนี้ หรือใบเสร็จรับเงิน" />
            </p>
            <button
              type="button"
              onClick={() => startNewDocument('QT')}
              className="figma-btn !rounded-xl min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border-0"
            >
              <Plus className="w-4 h-4" />
              สร้างใบเสนอราคา (QT)
            </button>
          </div>
        ) : (
          filteredDocs.map((d) => (
            <div key={d.id} className="figma-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold font-mono-num text-sm text-slate-900">
                    {d.docNumber}
                    {(d.revisionNumber ?? 0) > 0 && (
                      <span className="text-xs font-semibold text-blue-700 ms-1.5">
                        · Rev.{d.revisionNumber}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono-num mt-0.5">
                    {formatShortDate(d.docDate)} · {d.type}
                    {d.refDocNumber ? ` · Ref: ${d.refDocNumber}` : ''}
                  </div>
                </div>
                <span
                  className={`text-[11px] font-bold uppercase shrink-0 ${
                    d.status === 'paid'
                      ? 'text-emerald-700'
                      : d.status === 'cancelled'
                        ? 'text-rose-600'
                        : d.status === 'issued' || d.status === 'approved'
                          ? 'text-blue-700'
                          : 'text-slate-500'
                  }`}
                >
                  {d.status}
                </span>
              </div>

              <div className="text-xs space-y-0.5">
                <div className="font-semibold text-slate-900">{d.customerSnapshot.companyName}</div>
                <div className="text-slate-500">
                  {d.eventName}
                  {d.installmentInfo?.isInstallment
                    ? ` · งวดที่ ${d.installmentInfo.currentPeriod}/${d.installmentInfo.totalPeriods}`
                    : ''}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs font-mono-num">
                <span className="text-slate-500">ยอดรวมสุทธิ</span>
                <div className="text-right">
                  <div className="font-bold text-sm text-slate-900">฿{formatTHB(d.grandTotal)}</div>
                  {d.whtEnabled && (
                    <div className="text-[11px] text-amber-700">
                      รับสุทธิ ฿{formatTHB(d.netPayable)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {d.type === 'QT' && (
                  <button
                    type="button"
                    onClick={() => handleConvertQTtoINV(d)}
                    className="btn btn-sm btn-outline-primary min-h-[38px] inline-flex items-center gap-1 whitespace-nowrap flex-1 justify-center"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    ออก INV
                  </button>
                )}
                {d.type === 'INV' && (
                  <button
                    type="button"
                    onClick={() => handleConvertINVtoREC(d)}
                    className="btn btn-sm btn-outline-success min-h-[38px] inline-flex items-center gap-1 whitespace-nowrap flex-1 justify-center"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ออกใบเสร็จ
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCreateSpecialRevision(d)}
                  className="btn btn-sm btn-outline-secondary min-h-[38px] inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <History className="w-3.5 h-3.5" />
                  ย้อนหลัง
                </button>
                <button
                  type="button"
                  onClick={() => openPrintOnly(d)}
                  className="btn btn-sm btn-light border min-h-[38px] min-w-[38px] inline-flex items-center justify-center"
                  title="ดู/พิมพ์ A4"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditor(d)}
                  className="btn btn-sm btn-light border min-h-[38px] min-w-[38px] inline-flex items-center justify-center"
                  title="แก้ไขเอกสาร"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteDoc(d)}
                  className="btn btn-sm btn-light border text-danger min-h-[38px] min-w-[38px] inline-flex items-center justify-center"
                  title="ลบ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tablet & Desktop Document Registry Table (>= md) */}
      <div className="hidden md:block figma-card overflow-hidden">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0 text-sm">
            <thead className="table-light">
              <tr>
                <th className="px-4 py-3">เลขที่เอกสาร / วันที่</th>
                <th className="px-4 py-3">ลูกค้าและ Event Name</th>
                <th className="px-4 py-3 text-end">ยอดก่อน VAT</th>
                <th className="px-4 py-3 text-end">รวมทั้งสิ้น / สุทธิ</th>
                <th className="px-4 py-3 text-center">สถานะ</th>
                <th className="px-4 py-3 text-end">แปลงเอกสารและจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-500">
                    <Layers className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    ยังไม่มีเอกสารในหมวดนี้ — คลิกปุ่ม &ldquo;สร้างใบเสนอราคา (QT)&rdquo; ด้านบนเพื่อเริ่มต้น
                  </td>
                </tr>
              ) : (
                filteredDocs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-3 wrap-cell">
                      <div className="font-bold font-mono-num text-slate-900">
                        {d.docNumber}
                        {(d.revisionNumber ?? 0) > 0 && (
                          <span className="text-xs font-semibold text-blue-700 ms-1.5">
                            · Rev.{d.revisionNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-num">
                        {formatShortDate(d.docDate)} · {d.type}
                        {d.refDocNumber ? ` · Ref: ${d.refDocNumber}` : ''}
                        {d.issueMode && d.issueMode !== 'normal' && (
                          <span className="text-blue-700 font-semibold">
                            {' '}
                            ·{' '}
                            {d.issueMode === 'backdated'
                              ? 'ย้อนหลัง'
                              : d.issueMode === 'advance'
                                ? 'ล่วงหน้า'
                                : 'กรณีพิเศษ'}
                          </span>
                        )}
                        {d.specialDeliveryDate && ` · ส่งมอบ ${formatShortDate(d.specialDeliveryDate)}`}
                      </div>
                    </td>
                    <td className="px-4 py-3 wrap-cell">
                      <div className="font-semibold text-slate-900 thai-prose">
                        {formatThaiLineBreaks(d.customerSnapshot.companyName)}
                      </div>
                      <div className="text-xs text-slate-500 thai-prose">
                        {formatThaiLineBreaks(d.eventName)}
                        {d.installmentInfo?.isInstallment
                          ? ` · งวดที่ ${d.installmentInfo.currentPeriod}/${d.installmentInfo.totalPeriods}`
                          : ''}
                        {d.specialCaseReason ? ` · ${formatThaiLineBreaks(d.specialCaseReason)}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num text-slate-700">
                      ฿{formatTHB(d.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num">
                      <div className="font-bold text-slate-900">฿{formatTHB(d.grandTotal)}</div>
                      {d.whtEnabled && (
                        <div className="text-xs text-amber-700">
                          รับสุทธิ: ฿{formatTHB(d.netPayable)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-bold uppercase ${
                          d.status === 'paid'
                            ? 'text-emerald-700'
                            : d.status === 'cancelled'
                              ? 'text-rose-600'
                              : d.status === 'issued' || d.status === 'approved'
                                ? 'text-blue-700'
                                : 'text-slate-500'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {d.type === 'QT' && (
                          <button
                            type="button"
                            onClick={() => handleConvertQTtoINV(d)}
                            className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 whitespace-nowrap"
                            title="แปลงเป็นใบแจ้งหนี้/วางบิล"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            ออก INV
                          </button>
                        )}
                        {d.type === 'INV' && (
                          <button
                            type="button"
                            onClick={() => handleConvertINVtoREC(d)}
                            className="btn btn-sm btn-outline-success inline-flex items-center gap-1 whitespace-nowrap"
                            title="แปลงเป็นใบเสร็จรับเงิน"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            ออกใบเสร็จ
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCreateSpecialRevision(d)}
                          className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1 whitespace-nowrap"
                          title="สร้างฉบับแก้ไข / ย้อนหลัง / ล่วงหน้า (เก็บต้นฉบับเดิม)"
                        >
                          <History className="w-3.5 h-3.5" />
                          ย้อนหลัง/ล่วงหน้า
                        </button>
                        <button
                          type="button"
                          onClick={() => openPrintOnly(d)}
                          className="btn btn-sm btn-light border"
                          title="ดู/พิมพ์ A4"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditor(d)}
                          className="btn btn-sm btn-light border"
                          title="แก้ไขเอกสาร"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(d)}
                          className="btn btn-sm btn-light border text-danger"
                          title="ลบ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Guidance Strip */}
      <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-[13px] sm:text-xs text-slate-600">
        <div className="flex items-start sm:items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-700 shrink-0 mt-0.5 sm:mt-0" />
          <span className="thai-prose leading-relaxed">
            <strong>Workflow แนะนำ:</strong>{' '}
            <ThaiText text="สร้างใบเสนอราคา (QT) → กดปุ่ม “ออก INV” เพื่อวางบิลเต็มจำนวนหรือแบ่งงวด → กด “ออกใบเสร็จรับเงิน” เพื่อรับชำระเงินและบันทึกงบประมาณอัตโนมัติ" />
          </span>
        </div>
      </div>

      {/* Special Revision / Backdated / Advance Modal */}
      {specialRevisionModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-xl animate-figma-modal overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">
                  สร้างฉบับแก้ไข / เอกสารย้อนหลัง-ล่วงหน้า
                </h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  คัดลอกจากเอกสาร <strong>{specialRevisionModal.sourceDoc.docNumber}</strong> โดยเก็บต้นฉบับเดิมไว้
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSpecialRevisionModal(null)}
                className="btn btn-sm btn-light border"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmSpecialRevision} className="p-5 space-y-3.5 text-sm">
              <div>
                <label className="form-label">วัตถุประสงค์ของเอกสารชุดนี้</label>
                <select
                  className="form-select"
                  value={specialRevisionModal.issueMode}
                  onChange={(e) =>
                    setSpecialRevisionModal({
                      ...specialRevisionModal,
                      issueMode: e.target.value as DocumentIssueMode,
                    })
                  }
                >
                  <option value="backdated">แก้ไขข้อมูลย้อนหลัง (Backdated Revision)</option>
                  <option value="advance">ทำเอกสารล่วงหน้าเพื่อส่งมอบลูกค้า (Advance Delivery)</option>
                  <option value="special">เอกสารกรณีพิเศษ / ปรับเงื่อนไขเฉพาะลูกค้า</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ThaiDatePickerField
                  label="วันที่บนเอกสาร (ว/ด/ป)"
                  value={specialRevisionModal.docDate}
                  onChange={(nextIso) =>
                    setSpecialRevisionModal({ ...specialRevisionModal, docDate: nextIso })
                  }
                />
                <ThaiDatePickerField
                  label="วันที่ส่งมอบพิเศษ (ถ้ามี)"
                  value={specialRevisionModal.specialDeliveryDate}
                  onChange={(nextIso) =>
                    setSpecialRevisionModal({
                      ...specialRevisionModal,
                      specialDeliveryDate: nextIso,
                    })
                  }
                  allowEmpty
                />
              </div>

              <div>
                <label className="form-label">เหตุผล / รายละเอียดกรณีพิเศษ</label>
                <input
                  type="text"
                  className="form-control"
                  value={specialRevisionModal.reason}
                  onChange={(e) =>
                    setSpecialRevisionModal({ ...specialRevisionModal, reason: e.target.value })
                  }
                  placeholder="เช่น แก้ไขขอบเขตงานย้อนหลัง หรือออกวางบิลล่วงหน้าตามรอบปิดบัญชีลูกค้า"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSpecialRevisionModal(null)}
                  className="btn btn-light border"
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary px-4 fw-semibold">
                  เปิดแก้ไขเอกสารฉบับใหม่
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
