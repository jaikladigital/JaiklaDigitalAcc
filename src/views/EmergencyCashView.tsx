import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FileStack,
  FileText,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Printer,
  ScanLine,
  Search,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  uploadAssetFile,
} from '../firebase';
import {
  CompanyProfile,
  Customer,
  EmergencyCashStatus,
  EmergencyPayerType,
  EntityLegalType,
  Expense,
  FIELD_LIMITS,
  Project,
  ServiceCategory,
  Supplier,
  UrgentExpenseRequest,
  WhtFormType,
  clampString,
} from '../types/accounting';
import {
  formatShortDate,
  formatTHB,
  generateEmergencyVoucherNumber,
  getMonthYearFromDate,
  getTodayISO,
  sanitizeDecimalInput,
} from '../utils/formatters';
import { sendEmergencyCashLineAlert } from '../utils/lineClient';
import {
  FIELD_LABELS_TH,
  scanReceiptFile,
  scanReceiptFromDataUrlOrImage,
} from '../utils/receiptOcrClient';
import { validateThaiTaxId, WHT_INCOME_CATALOG } from '../utils/whtCompliance';
import {
  closeSwal,
  confirmDelete,
  showUploadLoading,
  toastError,
  toastSuccess,
} from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { EmergencyCashVoucherModal } from '../components/EmergencyCashVoucherModal';
import {
  MultiPageScannerModal,
  MultiPageScanResult,
} from '../components/MultiPageScannerModal';

interface EmergencyCashViewProps {
  expenses: Expense[];
  projects: Project[];
  customers: Customer[];
  suppliers: Supplier[];
  categories: ServiceCategory[];
  company: CompanyProfile;
  teamUids: string[];
  urgentRequests?: UrgentExpenseRequest[];
  isEmailAdmin?: boolean;
}

const STATUS_META: Record<
  EmergencyCashStatus,
  { label: string; badgeCls: string }
> = {
  pending_reimburse: {
    label: 'รอตรวจสอบ / เบิกคืน',
    badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'อนุมัติจ่ายคืนแล้ว',
    badgeCls: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  reimbursed: {
    label: 'คืนเงินสดเรียบร้อย',
    badgeCls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

export const EmergencyCashView: React.FC<EmergencyCashViewProps> = ({
  expenses,
  projects,
  customers,
  suppliers,
  categories,
  company,
  teamUids,
  urgentRequests = [],
}) => {
  const oaId = (company.lineOaId || '@421khbew').trim() || '@421khbew';

  const [importingRequest, setImportingRequest] = useState<UrgentExpenseRequest | null>(null);
  const [importProjectId, setImportProjectId] = useState('');
  const [importingBusy, setImportingBusy] = useState(false);
  const [showRichMenuGuide, setShowRichMenuGuide] = useState(false);

  const urgentFormUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?mode=urgent`
      : '?mode=urgent';

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | EmergencyCashStatus>('all');
  const [filterPayerType, setFilterPayerType] = useState<'all' | EmergencyPayerType>('all');

  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [voucherExpense, setVoucherExpense] = useState<Expense | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'success' | 'partial' | 'error'>('idle');
  const [ocrNote, setOcrNote] = useState('');
  const [ocrUnreadableFields, setOcrUnreadableFields] = useState<string[]>([]);

  // Quick Project creation if needed
  const [showQuickProjModal, setShowQuickProjModal] = useState(false);
  const [quickProjForm, setQuickProjForm] = useState({
    eventName: '',
    customerId: '',
    durationStart: getTodayISO(),
    durationEnd: getTodayISO(),
  });

  const [form, setForm] = useState({
    projectId: '',
    payerType: 'employee' as EmergencyPayerType,
    payerName: '',
    payerPhone: '',
    supplierId: '',
    supplierName: '',
    supplierTaxId: '',
    payeeEntityType: 'corporate' as EntityLegalType,
    whtIncomeCode: '40(8)_service_3',
    categoryId: '',
    categoryName: '',
    description: '',
    urgencyReason: '',
    amount: 0,
    vatRate: 0,
    whtRate: 0,
    paymentDate: getTodayISO(),
    receiptUrl: '',
    extraPhotoUrl: '',
    scanFileUrl: '',
    scanFileName: '',
    scanFileType: '',
    scanPageCount: 0,
    scanFileSizeBytes: 0,
    emergencyStatus: 'pending_reimburse' as EmergencyCashStatus,
    notifyLineOnSave: true,
  });
  const [amountInput, setAmountInput] = useState<string>('');

  const emergencyExpenses = useMemo(
    () => expenses.filter((e) => Boolean(e.isEmergencyCash)),
    [expenses]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emergencyExpenses.filter((e) => {
      const st = e.emergencyStatus || 'pending_reimburse';
      if (filterStatus !== 'all' && st !== filterStatus) return false;
      if (filterPayerType !== 'all' && (e.payerType || 'employee') !== filterPayerType) return false;
      if (!q) return true;
      return (
        (e.emergencyVoucherNo || '').toLowerCase().includes(q) ||
        (e.payerName || '').toLowerCase().includes(q) ||
        e.supplierName.toLowerCase().includes(q) ||
        e.eventName.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    });
  }, [emergencyExpenses, search, filterStatus, filterPayerType]);

  const stats = useMemo(() => {
    return emergencyExpenses.reduce(
      (acc, e) => {
        const st = e.emergencyStatus || 'pending_reimburse';
        if (st === 'pending_reimburse') {
          acc.pendingCount += 1;
          acc.pendingAmount += e.netPaid;
        } else if (st === 'approved') {
          acc.approvedAmount += e.netPaid;
        } else {
          acc.reimbursedAmount += e.netPaid;
        }
        acc.totalAmount += e.netPaid;
        return acc;
      },
      { pendingCount: 0, pendingAmount: 0, approvedAmount: 0, reimbursedAmount: 0, totalAmount: 0 }
    );
  }, [emergencyExpenses]);

  const computedVat = Number(((form.amount * form.vatRate) / 100).toFixed(2));
  const computedWht = Number(((form.amount * form.whtRate) / 100).toFixed(2));
  const computedNetPaid = Number((form.amount + computedVat - computedWht).toFixed(2));

  const openCreateModal = () => {
    if (projects.length === 0) {
      if (customers.length === 0) {
        toastError('กรุณาสร้างข้อมูลลูกค้าก่อน', 'ไปที่เมนู "ลูกค้าและวิเคราะห์" เพื่อเพิ่มลูกค้าอย่างน้อย 1 ราย');
        return;
      }
      setQuickProjForm({
        eventName: '',
        customerId: customers[0].id,
        durationStart: getTodayISO(),
        durationEnd: getTodayISO(),
      });
      setShowQuickProjModal(true);
      return;
    }

    setEditingExpense(null);
    setForm({
      projectId: projects[0].id,
      payerType: 'employee',
      payerName: auth.currentUser?.displayName || '',
      payerPhone: '',
      supplierId: '',
      supplierName: '',
      supplierTaxId: '',
      payeeEntityType: 'corporate',
      whtIncomeCode: '40(8)_service_3',
      categoryId: categories[0]?.id || '',
      categoryName: categories[0]?.name || '',
      description: '',
      urgencyReason: '',
      amount: 0,
      vatRate: 0,
      whtRate: 0,
      paymentDate: getTodayISO(),
      receiptUrl: '',
      extraPhotoUrl: '',
      scanFileUrl: '',
      scanFileName: '',
      scanFileType: '',
      scanPageCount: 0,
      scanFileSizeBytes: 0,
      emergencyStatus: 'pending_reimburse',
      notifyLineOnSave: true,
    });
    setOcrStatus('idle');
    setOcrNote('');
    setOcrUnreadableFields([]);
    setAmountInput('');
    setShowModal(true);
  };

  const openEditModal = (exp: Expense) => {
    setEditingExpense(exp);
    setForm({
      projectId: exp.projectId,
      payerType: exp.payerType || 'employee',
      payerName: exp.payerName || exp.supplierName,
      payerPhone: exp.payerPhone || '',
      supplierId: exp.supplierId || '',
      supplierName: exp.supplierName,
      supplierTaxId: exp.supplierTaxId || '',
      payeeEntityType: exp.payeeEntityType || 'corporate',
      whtIncomeCode: exp.whtIncomeCode || '40(8)_service_3',
      categoryId: exp.categoryId || '',
      categoryName: exp.categoryName || '',
      description: exp.description,
      urgencyReason: exp.urgencyReason || '',
      amount: exp.amount,
      vatRate: exp.vatRate,
      whtRate: exp.whtRate,
      paymentDate: exp.paymentDate,
      receiptUrl: exp.receiptUrl || '',
      extraPhotoUrl: exp.extraPhotoUrl || '',
      scanFileUrl: exp.scanFileUrl || '',
      scanFileName: exp.scanFileName || '',
      scanFileType: exp.scanFileType || '',
      scanPageCount: exp.scanPageCount || 0,
      scanFileSizeBytes: exp.scanFileSizeBytes || 0,
      emergencyStatus: exp.emergencyStatus || 'pending_reimburse',
      notifyLineOnSave: false,
    });
    setAmountInput(exp.amount > 0 ? String(exp.amount) : '');
    setOcrStatus('idle');
    setOcrNote('');
    setOcrUnreadableFields([]);
    setShowModal(true);
  };

  const handleQuickProjectCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const cust = customers.find((c) => c.id === quickProjForm.customerId);
    if (!cust) return;
    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    try {
      const refDoc = await addDoc(collection(db, 'projects'), {
        eventName: clampString(quickProjForm.eventName, FIELD_LIMITS.eventName),
        durationStart: quickProjForm.durationStart,
        durationEnd: quickProjForm.durationEnd,
        customerId: cust.id,
        customerName: cust.companyName,
        status: 'active',
        budgetLimit: 0,
        notes: '',
        createdBy: uid,
        teamUids: activeTeam,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setShowQuickProjModal(false);
      toastSuccess('สร้างโปรเจกต์ใหม่เรียบร้อย');
      setEditingExpense(null);
      setForm((prev) => ({
        ...prev,
        projectId: refDoc.id,
        payerName: auth.currentUser?.displayName || '',
      }));
      setShowModal(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'projects');
    }
  };

  const handleSelectSupplier = (supplierId: string) => {
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) {
      setForm((prev) => ({ ...prev, supplierId: '' }));
      return;
    }
    const cat = categories.find((c) => c.id === sup.categoryId);
    setForm((prev) => ({
      ...prev,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierTaxId: sup.taxId || '',
      payeeEntityType: sup.entityType || 'corporate',
      categoryId: sup.categoryId,
      categoryName: sup.categoryName || cat?.name || '',
      payerName: prev.payerType === 'supplier' ? sup.name : prev.payerName,
      payerPhone: prev.payerType === 'supplier' && sup.phone ? sup.phone : prev.payerPhone,
    }));
  };

  const applyOcrDataToForm = (res: Awaited<ReturnType<typeof scanReceiptFile>>) => {
    if (!res.ok || !res.data) {
      setOcrStatus('error');
      setOcrNote(
        res.error || 'ไม่สามารถอ่านข้อมูลจากรูปใบเสร็จได้ กรุณาพิมพ์ข้อมูลเพิ่มเติมด้วยตนเอง'
      );
      setOcrUnreadableFields(['vendorName', 'description', 'amount']);
      return;
    }

    const d = res.data;
    const missing = new Set<string>(d.unreadableFields || []);
    if (!d.vendorName) missing.add('vendorName');
    if (!d.description) missing.add('description');
    if (d.totalAmount <= 0 && d.subtotal <= 0) missing.add('amount');
    if (!d.receiptDate) missing.add('receiptDate');

    const extractedAmount =
      d.subtotal > 0 ? d.subtotal : d.totalAmount > 0 ? Number((d.totalAmount - d.vatAmount).toFixed(2)) : 0;

    const taxCheck = validateThaiTaxId(d.vendorTaxId);
    const inferredEntity: EntityLegalType | undefined =
      d.vendorEntityType === 'individual' || d.vendorEntityType === 'corporate'
        ? d.vendorEntityType
        : taxCheck.detectedEntityType !== 'unknown'
          ? taxCheck.detectedEntityType
          : undefined;

    setForm((prev) => ({
      ...prev,
      supplierName: d.vendorName || prev.supplierName,
      supplierTaxId: d.vendorTaxId || prev.supplierTaxId,
      payeeEntityType: inferredEntity || prev.payeeEntityType,
      paymentDate: d.receiptDate || prev.paymentDate,
      description: d.description || prev.description,
      amount: extractedAmount > 0 ? extractedAmount : prev.amount,
      vatRate: d.vatRate > 0 ? d.vatRate : prev.vatRate,
      whtRate: d.whtRate > 0 ? d.whtRate : prev.whtRate,
    }));
    if (extractedAmount > 0) {
      setAmountInput(String(extractedAmount));
    }

    const missingList = Array.from(missing);
    setOcrUnreadableFields(missingList);

    if (!d.readable || missingList.length > 0) {
      setOcrStatus('partial');
      setOcrNote(
        d.readabilityNote ||
          'อ่านข้อมูลจากใบเสร็จได้บางส่วน กรุณาตรวจสอบและพิมพ์ข้อมูลเพิ่มเติมในช่องที่ไฮไลต์สีเหลือง'
      );
    } else {
      setOcrStatus('success');
      setOcrNote(
        d.pageSummary
          ? `${d.pageSummary} — ${d.readabilityNote || 'ดึงข้อมูลเรียบร้อยแล้ว'}`
          : d.readabilityNote ||
              'ดึงข้อมูลเบื้องต้นจากรูปใบเสร็จเรียบร้อยแล้ว สามารถแก้ไขหรือพิมพ์เพิ่มเติมได้ทุกช่อง'
      );
    }
  };

  const handleMultiPageScanComplete = (result: MultiPageScanResult) => {
    setForm((prev) => ({
      ...prev,
      receiptUrl: result.receiptUrl || prev.receiptUrl,
      scanFileUrl: result.scanFileUrl || '',
      scanFileName: clampString(result.scanFileName, 240),
      scanFileType: clampString(result.scanFileType, 90),
      scanPageCount: result.scanPageCount,
      scanFileSizeBytes: result.scanFileSizeBytes,
    }));
    setShowScannerModal(false);
    if (result.ocrResult) {
      applyOcrDataToForm(result.ocrResult);
    }
    toastSuccess(`แนบเอกสารสแกน ${result.scanPageCount} หน้าแล้ว`);
  };

  const handlePhotoUpload = async (
    targetField: 'receiptUrl' | 'extraPhotoUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetProjectId = form.projectId || 'emergency';
    showUploadLoading(
      targetField === 'receiptUrl' ? 'กำลังอัปโหลดและสแกนข้อมูลจากรูปใบเสร็จ...' : 'กำลังอัปโหลดรูปภาพหน้างาน...'
    );
    try {
      const urlPromise = uploadAssetFile(
        `emergency_cash/${targetProjectId}/${Date.now()}_${file.name}`,
        file
      );
      if (targetField === 'receiptUrl') {
        setOcrStatus('scanning');
        setOcrNote('กำลังอ่านข้อความและยอดเงินจากรูปใบเสร็จด้วย AI...');
        const [url, ocrRes] = await Promise.all([urlPromise, scanReceiptFile(file)]);
        setForm((prev) => ({ ...prev, receiptUrl: url }));
        closeSwal();
        applyOcrDataToForm(ocrRes);
        toastSuccess('แนบรูปใบเสร็จและดึงข้อมูลเบื้องต้นแล้ว');
      } else {
        const url = await urlPromise;
        setForm((prev) => ({ ...prev, [targetField]: url }));
        closeSwal();
        toastSuccess('แนบรูปภาพหน้างานเรียบร้อยแล้ว');
      }
    } catch (error) {
      closeSwal();
      toastError(
        'อัปโหลดรูปไม่สำเร็จ',
        error instanceof Error ? error.message : 'กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleRescanReceipt = async () => {
    if (!form.receiptUrl) return;
    setOcrStatus('scanning');
    setOcrNote('กำลังสแกนข้อมูลจากรูปใบเสร็จอีกครั้ง...');
    const res = await scanReceiptFromDataUrlOrImage(form.receiptUrl);
    applyOcrDataToForm(res);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const proj = projects.find((p) => p.id === form.projectId);
    if (!proj) {
      toastError('กรุณาเลือกโปรเจกต์ / Event');
      return;
    }

    const payerName = clampString(form.payerName, FIELD_LIMITS.companyName);
    const vendorName = clampString(form.supplierName || form.payerName, FIELD_LIMITS.companyName);
    const description = clampString(form.description, FIELD_LIMITS.description);

    if (!payerName || !description) {
      toastError('กรุณากรอกชื่อผู้สำรองจ่ายเงินสดและรายละเอียดค่าใช้จ่าย');
      return;
    }

    if ((Number(form.amount) || 0) <= 0) {
      toastError('กรุณาระบุจำนวนเงินสดที่จ่ายจริงมากกว่า 0 บาท');
      return;
    }

    setSaving(true);
    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    try {
      const voucherNo =
        editingExpense?.emergencyVoucherNo ||
        generateEmergencyVoucherNumber(expenses, form.paymentDate);

      const resolvedFormType: WhtFormType =
        computedWht > 0
          ? form.whtIncomeCode === '40(1)_salary'
            ? 'PND1'
            : form.payeeEntityType === 'individual'
              ? 'PND3'
              : 'PND53'
          : 'NONE';

      const payloadData = {
        projectId: proj.id,
        eventName: clampString(proj.eventName, FIELD_LIMITS.eventName),
        supplierId: form.supplierId,
        supplierName: vendorName,
        supplierTaxId: clampString(form.supplierTaxId, FIELD_LIMITS.taxId),
        supplierAddress: '',
        payeeEntityType: form.payeeEntityType,
        whtFormType: resolvedFormType,
        whtIncomeCode: clampString(form.whtIncomeCode, 60),
        categoryId: form.categoryId,
        categoryName: clampString(form.categoryName || 'ค่าใช้จ่ายเงินสดฉุกเฉิน', 150),
        description,
        amount: Number(form.amount) || 0,
        vatRate: Number(form.vatRate) || 0,
        vatAmount: computedVat,
        whtRate: Number(form.whtRate) || 0,
        whtAmount: computedWht,
        netPaid: computedNetPaid,
        paymentDate: form.paymentDate,
        monthYear: getMonthYearFromDate(form.paymentDate),
        receiptUrl: form.receiptUrl,
        extraPhotoUrl: form.extraPhotoUrl,
        scanFileUrl: form.scanFileUrl || '',
        scanFileName: clampString(form.scanFileName, 240),
        scanFileType: clampString(form.scanFileType, 90),
        scanPageCount: Number(form.scanPageCount) || 0,
        scanFileSizeBytes: Number(form.scanFileSizeBytes) || 0,
        wht50TawiNo: editingExpense?.wht50TawiNo || '',
        wht50TawiIssued: editingExpense?.wht50TawiIssued || false,
        incomeType50Tawi:
          WHT_INCOME_CATALOG.find((c) => c.code === form.whtIncomeCode)?.labelTh ||
          'ค่าใช้จ่ายเงินสดฉุกเฉิน / สำรองจ่าย',
        isEmergencyCash: true,
        emergencyVoucherNo: voucherNo,
        payerType: form.payerType,
        payerName,
        payerPhone: clampString(form.payerPhone, FIELD_LIMITS.phone),
        urgencyReason: clampString(form.urgencyReason, 500),
        emergencyStatus: form.emergencyStatus,
        lineNotifiedAt: editingExpense?.lineNotifiedAt || '',
        lineNotifyChannel: editingExpense?.lineNotifyChannel || '',
        teamUids: activeTeam,
        updatedAt: serverTimestamp(),
      };

      let savedExpense: Expense;

      if (editingExpense) {
        await updateDoc(doc(db, 'expenses', editingExpense.id), payloadData);
        savedExpense = {
          ...editingExpense,
          ...payloadData,
        } as Expense;
        toastSuccess(`อัปเดตใบเบิกเงินสดฉุกเฉิน ${voucherNo} เรียบร้อย`);
      } else {
        const refDoc = await addDoc(collection(db, 'expenses'), {
          ...payloadData,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        savedExpense = {
          id: refDoc.id,
          ...payloadData,
          createdBy: uid,
        } as Expense;
        toastSuccess(`บันทึกเอกสาร ${voucherNo} เข้าสู่ระบบแล้ว`);
      }

      setShowModal(false);

      if (form.notifyLineOnSave) {
        await sendEmergencyCashLineAlert(savedExpense, company, {
          onOpenVoucherPrint: (exp) => setVoucherExpense(exp),
        });
      }
    } catch (error) {
      handleFirestoreError(
        error,
        editingExpense ? OperationType.UPDATE : OperationType.CREATE,
        editingExpense ? `expenses/${editingExpense.id}` : 'expenses'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (exp: Expense, nextStatus: EmergencyCashStatus) => {
    try {
      await updateDoc(doc(db, 'expenses', exp.id), {
        emergencyStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });
      toastSuccess(`อัปเดตสถานะ ${exp.emergencyVoucherNo || ''} เป็น "${STATUS_META[nextStatus].label}"`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `expenses/${exp.id}`);
    }
  };

  const handleDelete = async (exp: Expense) => {
    const ok = await confirmDelete(`${exp.emergencyVoucherNo || ''} - ${exp.description}`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'expenses', exp.id));
      toastSuccess('ลบรายการเงินสดฉุกเฉินแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${exp.id}`);
    }
  };

  const handleCopyNoLoginUrl = async () => {
    const url = `${window.location.origin}${window.location.pathname}?mode=urgent`;
    try {
      await navigator.clipboard.writeText(url);
      toastSuccess(
        'คัดลอกลิงก์แจ้งเบิกด่วน (ไม่ต้องเข้าสู่ระบบ) เรียบร้อย',
        'ส่งลิงก์นี้ให้พนักงานหรือซัพพลายเยอร์กรอกข้อมูลและแนบรูปบิลหน้างานได้ทันที'
      );
    } catch {
      toastError('ไม่สามารถคัดลอกลิงก์ได้', url);
    }
  };

  const openImportUrgentModal = (req: UrgentExpenseRequest) => {
    if (projects.length === 0) {
      toastError(
        'ยังไม่มีโปรเจกต์ในระบบ',
        'กรุณาสร้างลูกค้าและโปรเจกต์อย่างน้อย 1 รายการก่อนนำเข้าคำขอเบิกด่วน'
      );
      return;
    }
    const matched = projects.find(
      (p) =>
        p.eventName.toLowerCase().includes(req.projectName.toLowerCase()) ||
        req.projectName.toLowerCase().includes(p.eventName.toLowerCase())
    );
    setImportProjectId(matched?.id || projects[0].id);
    setImportingRequest(req);
  };

  const handleConfirmImportUrgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importingRequest) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const proj = projects.find((p) => p.id === importProjectId);
    if (!proj) {
      toastError('กรุณาเลือกโปรเจกต์');
      return;
    }

    setImportingBusy(true);
    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    try {
      const contactSummary = [
        importingRequest.submitterPhone || '',
        importingRequest.submitterLineId ? `LINE: ${importingRequest.submitterLineId}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

      const resolvedFormType: WhtFormType =
        importingRequest.whtAmount > 0 ? 'PND53' : 'NONE';

      const expenseRef = await addDoc(collection(db, 'expenses'), {
        projectId: proj.id,
        eventName: clampString(proj.eventName, FIELD_LIMITS.eventName),
        supplierId: '',
        supplierName: clampString(
          importingRequest.vendorName || importingRequest.payerName,
          FIELD_LIMITS.companyName
        ),
        supplierTaxId: clampString(importingRequest.vendorTaxId || '', FIELD_LIMITS.taxId),
        supplierAddress: '',
        payeeEntityType: 'corporate',
        whtFormType: resolvedFormType,
        whtIncomeCode: '40(8)_service_3',
        categoryId: categories[0]?.id || '',
        categoryName: clampString(categories[0]?.name || 'ค่าใช้จ่ายเงินสดฉุกเฉิน', 150),
        description: clampString(
          `[${importingRequest.projectName}] ${importingRequest.description}`,
          FIELD_LIMITS.description
        ),
        amount: Number(importingRequest.amount) || 0,
        vatRate: Number(importingRequest.vatRate) || 0,
        vatAmount: Number(importingRequest.vatAmount) || 0,
        whtRate: Number(importingRequest.whtRate) || 0,
        whtAmount: Number(importingRequest.whtAmount) || 0,
        netPaid: Number(importingRequest.netPaid) || 0,
        paymentDate: importingRequest.paymentDate || getTodayISO(),
        monthYear: getMonthYearFromDate(importingRequest.paymentDate || getTodayISO()),
        receiptUrl: importingRequest.receiptUrl || '',
        extraPhotoUrl: importingRequest.extraPhotoUrl || '',
        wht50TawiNo: '',
        wht50TawiIssued: false,
        incomeType50Tawi: 'ค่าใช้จ่ายเงินสดฉุกเฉิน / สำรองจ่ายหน้างาน',
        isEmergencyCash: true,
        emergencyVoucherNo: importingRequest.voucherNo,
        payerType: importingRequest.payerType,
        payerName: clampString(importingRequest.payerName, FIELD_LIMITS.companyName),
        payerPhone: clampString(contactSummary, FIELD_LIMITS.phone),
        urgencyReason: clampString(importingRequest.urgencyReason || '', 500),
        emergencyStatus: 'approved' as EmergencyCashStatus,
        lineNotifiedAt: importingRequest.lineNotifiedAt || '',
        lineNotifyChannel: importingRequest.lineNotifyChannel || 'public_urgent',
        createdBy: uid,
        teamUids: activeTeam,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'urgent_requests', importingRequest.id), {
        status: 'imported',
        importedExpenseId: expenseRef.id,
        updatedAt: serverTimestamp(),
      });

      setImportingRequest(null);
      toastSuccess(`อนุมัติและนำเข้า ${importingRequest.voucherNo} เข้าบัญชีรายจ่ายเรียบร้อย`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `urgent_requests/${importingRequest.id}`);
    } finally {
      setImportingBusy(false);
    }
  };

  const handleRejectUrgentRequest = async (req: UrgentExpenseRequest) => {
    try {
      await updateDoc(doc(db, 'urgent_requests', req.id), {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
      toastSuccess(`ปิดคำขอ ${req.voucherNo} เรียบร้อย`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `urgent_requests/${req.id}`);
    }
  };

  const handleDeleteUrgentRequest = async (req: UrgentExpenseRequest) => {
    const ok = await confirmDelete(`${req.voucherNo} - ${req.payerName}`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'urgent_requests', req.id));
      toastSuccess(`ลบคำขอเบิกด่วน ${req.voucherNo} แล้ว`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `urgent_requests/${req.id}`);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[11px] sm:text-xs font-bold mb-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Emergency Cash Disbursement &amp; LINE OA Alert
          </div>
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            {formatThaiLineBreaks('เบิกจ่ายเงินสดฉุกเฉิน (พนักงาน / ซัพพลายเยอร์)')}
          </h1>
          <p className="thai-prose text-xs sm:text-sm text-slate-500 mt-1.5 mb-0">
            {formatThaiLineBreaks(
              `บันทึกการสำรองจ่ายเงินสดหน้างาน แนบรูปถ่ายใบเสร็จเพื่อดึงข้อมูลอัตโนมัติ ออกใบสำคัญจ่าย A4 และส่งแจ้งเตือนไปที่ LINE OA ${oaId}`
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center justify-center gap-2 w-full lg:w-auto">
          <button
            type="button"
            onClick={handleCopyNoLoginUrl}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 whitespace-nowrap"
          >
            <Copy className="w-4 h-4 shrink-0" />
            คัดลอกลิงก์ส่งบิลด่วน
          </button>

          <button
            type="button"
            onClick={() => setShowRichMenuGuide((v) => !v)}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {showRichMenuGuide ? 'ซ่อนคู่มือ Rich Menu' : 'ลิงก์ตั้งค่า Rich Menu'}
          </button>

          <a
            href={`https://line.me/R/ti/p/${encodeURIComponent(oaId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            LINE OA {oaId}
            <ExternalLink className="w-3.5 h-3.5 opacity-70 shrink-0" />
          </a>

          <button
            type="button"
            onClick={openCreateModal}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-700 rounded-xl hover:bg-rose-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            บันทึกเบิกเงินสดฉุกเฉิน
          </button>
        </div>
      </div>

      {showRichMenuGuide && (
        <div className="figma-card p-4 sm:p-5 border border-emerald-200 bg-emerald-50/40 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 m-0">
                ลิงก์สำหรับสร้าง Rich Menu ใน LINE OA ({oaId})
              </h2>
              <p className="text-xs text-slate-600 m-0 mt-0.5">
                นำไปวางใน LINE Official Account Manager &gt; Rich Menu &gt; ประเภท Action: Link (URL)
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyNoLoginUrl}
              className="figma-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              <Copy className="w-3.5 h-3.5" />
              คัดลอกลิงก์
            </button>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-emerald-200 font-mono-num text-xs text-slate-800 break-all select-all">
            {urgentFormUrl}
          </div>

          <div className="text-xs text-slate-700 space-y-1 leading-relaxed">
            <div>
              • <strong>การเห็นข้อมูลแอคเคาท์ LINE ของผู้ส่ง:</strong> หากผู้ใช้กดเปิดเว็บลิงก์อย่างเดียวโดยไม่เคยทักแชท ระบบแชท OA จะยังไม่แสดงห้องแชทจนกว่าผู้ส่งจะกดปุ่ม <strong>"ส่งคำขอเข้าแชท LINE OA"</strong> หลังกรอกฟอร์ม (หรือส่งข้อความ/สติ๊กเกอร์ 1 ครั้งในแชท)
            </div>
            <div>
              • <strong>ตัวเลือกอัตโนมัติ (LINE LIFF):</strong> หากต้องการให้เว็บดึงชื่อโปรไฟล์และ LINE User ID อัตโนมัติทันทีที่เปิดจาก Rich Menu ให้สร้าง LIFF App ใน LINE Developers Console แล้วนำลิงก์ด้านบนไปตั้งเป็น Endpoint URL ของ LIFF
            </div>
          </div>
        </div>
      )}

      {/* 4-Card Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="figma-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>รอตรวจสอบ / เบิกคืนเงินสด</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-amber-700 mt-1.5">
            ฿{formatTHB(stats.pendingAmount)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            ค้างดำเนินการ <strong className="font-mono-num">{stats.pendingCount}</strong> รายการ
          </div>
        </div>

        <div className="figma-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>อนุมัติแล้ว (รอจ่ายเงินคืน)</span>
            <UserCheck className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-blue-700 mt-1.5">
            ฿{formatTHB(stats.approvedAmount)}
          </div>
          <div className="text-xs text-slate-500 mt-1">พร้อมจ่ายคืนพนักงาน / ซัพพลายเยอร์</div>
        </div>

        <div className="figma-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>คืนเงินสดเรียบร้อยแล้ว</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-emerald-700 mt-1.5">
            ฿{formatTHB(stats.reimbursedAmount)}
          </div>
          <div className="text-xs text-slate-500 mt-1">ปิดยอดเบิกจ่ายฉุกเฉินแล้ว</div>
        </div>

        <div className="figma-card p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>รวมค่าใช้จ่ายฉุกเฉินทั้งหมด</span>
            <MessageCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-1.5">
            ฿{formatTHB(stats.totalAmount)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            ทั้งหมด <strong className="font-mono-num">{emergencyExpenses.length}</strong> เอกสาร (เชื่อมงบรายเดือนอัตโนมัติ)
          </div>
        </div>
      </div>

      {/* Public No-Login Urgent Submissions Inbox (Admin only) */}
      {urgentRequests.length > 0 && (
        <div className="figma-card p-4 sm:p-5 space-y-3 border border-amber-300 bg-amber-50/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0 thai-heading">
                คำขอเบิกด่วนจากภายนอก (ส่งโดยไม่ต้องเข้าสู่ระบบ)
              </h2>
              <p className="text-xs text-slate-600 mt-0.5 mb-0 thai-prose">
                ตรวจสอบข้อมูลติดต่อกลับ (LINE ID / อีเมล / เบอร์โทร) และอนุมัตินำเข้าบัญชีรายจ่ายของโปรเจกต์
              </p>
            </div>
            <span className="text-xs font-mono-num font-bold text-amber-800 shrink-0">
              รอตรวจสอบ {urgentRequests.filter((r) => r.status === 'pending_review').length} / ทั้งหมด {urgentRequests.length} รายการ
            </span>
          </div>

          {/* Mobile Urgent Request Cards */}
          <div className="md:hidden space-y-3">
            {urgentRequests.map((req) => (
              <div key={req.id} className="bg-white border border-amber-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono-num font-bold text-rose-700">{req.voucherNo}</div>
                    <div className="text-slate-500 font-mono-num">{formatShortDate(req.paymentDate)}</div>
                  </div>
                  <div className="text-end font-mono-num">
                    <div className="text-slate-500">ยอดสุทธิ</div>
                    <div className="text-base font-bold text-slate-900">฿{formatTHB(req.netPaid)}</div>
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-sm text-slate-900">
                    {req.payerName}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      ({req.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน'})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    {req.submitterLineId && (
                      <span className="text-emerald-800 font-mono-num font-semibold inline-flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {req.submitterLineId}
                      </span>
                    )}
                    {req.submitterPhone && (
                      <a
                        href={`tel:${req.submitterPhone}`}
                        className="text-blue-700 font-mono-num inline-flex items-center gap-1 hover:underline"
                      >
                        <Phone className="w-3 h-3" />
                        {req.submitterPhone}
                      </a>
                    )}
                    {req.submitterEmail && (
                      <a
                        href={`mailto:${req.submitterEmail}`}
                        className="text-slate-600 inline-flex items-center gap-1 hover:underline break-all"
                      >
                        <Mail className="w-3 h-3 shrink-0" />
                        {req.submitterEmail}
                      </a>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-0.5">
                  <div className="font-semibold text-slate-800 thai-prose">{req.projectName}</div>
                  <div className="text-slate-600 thai-prose">{req.description}</div>
                  {req.urgencyReason && (
                    <div className="text-[11px] text-rose-700 thai-prose">เร่งด่วน: {req.urgencyReason}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {req.receiptUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewPhotoUrl(req.receiptUrl!)}
                      className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      ดูบิล
                    </button>
                  )}
                  {req.status === 'pending_review' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openImportUrgentModal(req)}
                        className="btn btn-sm btn-success fw-semibold flex-1 whitespace-nowrap"
                      >
                        นำเข้าบัญชี &amp; อนุมัติ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectUrgentRequest(req)}
                        className="btn btn-sm btn-outline-secondary"
                      >
                        ปฏิเสธ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUrgentRequest(req)}
                        className="btn btn-sm btn-light border text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <div className="ms-auto inline-flex items-center gap-2">
                      <span
                        className={`font-semibold ${
                          req.status === 'imported' || req.status === 'approved'
                            ? 'text-emerald-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {req.status === 'imported'
                          ? 'นำเข้าบัญชีแล้ว ✓'
                          : req.status === 'rejected'
                            ? 'ปฏิเสธแล้ว'
                            : 'อนุมัติแล้ว'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteUrgentRequest(req)}
                        className="btn btn-sm btn-light border text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Tablet & Desktop Table */}
          <div className="hidden md:block table-responsive">
            <table className="table table-sm align-middle mb-0 text-xs sm:text-sm bg-white rounded-lg overflow-hidden">
              <thead className="table-light">
                <tr>
                  <th>รหัสอ้างอิง / วันที่</th>
                  <th>ผู้ส่งเรื่อง &amp; ช่องทางติดต่อกลับ</th>
                  <th>งาน / รายละเอียด</th>
                  <th className="text-end font-mono-num">ยอดสุทธิ</th>
                  <th className="text-center">หลักฐาน</th>
                  <th className="text-end">จัดการ / นำเข้าบัญชี</th>
                </tr>
              </thead>
              <tbody>
                {urgentRequests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <div className="font-mono-num font-bold text-rose-700 text-xs">
                        {req.voucherNo}
                      </div>
                      <div className="text-xs text-slate-500 font-mono-num">
                        {formatShortDate(req.paymentDate)}
                      </div>
                    </td>
                    <td>
                      <div className="font-semibold text-slate-900">
                        {req.payerName}{' '}
                        <span className="text-xs text-slate-500">
                          ({req.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน'})
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5">
                        {req.submitterLineId && (
                          <span className="text-emerald-800 font-mono-num font-semibold inline-flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {req.submitterLineId}
                          </span>
                        )}
                        {req.submitterPhone && (
                          <a
                            href={`tel:${req.submitterPhone}`}
                            className="text-blue-700 font-mono-num inline-flex items-center gap-1 hover:underline"
                          >
                            <Phone className="w-3 h-3" />
                            {req.submitterPhone}
                          </a>
                        )}
                        {req.submitterEmail && (
                          <a
                            href={`mailto:${req.submitterEmail}`}
                            className="text-slate-600 inline-flex items-center gap-1 hover:underline"
                          >
                            <Mail className="w-3 h-3" />
                            {req.submitterEmail}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="font-semibold text-slate-800">{req.projectName}</div>
                      <div className="text-xs text-slate-600">{req.description}</div>
                      {req.urgencyReason && (
                        <div className="text-[11px] text-rose-700">
                          เร่งด่วน: {req.urgencyReason}
                        </div>
                      )}
                    </td>
                    <td className="text-end font-mono-num font-bold text-slate-900">
                      ฿{formatTHB(req.netPaid)}
                    </td>
                    <td className="text-center">
                      {req.receiptUrl ? (
                        <button
                          type="button"
                          onClick={() => setPreviewPhotoUrl(req.receiptUrl!)}
                          className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          ดูบิล
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">ไม่มีรูป</span>
                      )}
                    </td>
                    <td className="text-end">
                      {req.status === 'pending_review' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openImportUrgentModal(req)}
                            className="btn btn-sm btn-success fw-semibold whitespace-nowrap"
                          >
                            นำเข้าบัญชี &amp; อนุมัติ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectUrgentRequest(req)}
                            className="btn btn-sm btn-outline-secondary"
                          >
                            ปฏิเสธ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteUrgentRequest(req)}
                            className="btn btn-sm btn-light border text-danger"
                            title="ลบ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold ${
                              req.status === 'imported' || req.status === 'approved'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                            }`}
                          >
                            {req.status === 'imported'
                              ? 'นำเข้าบัญชีแล้ว ✓'
                              : req.status === 'rejected'
                                ? 'ปฏิเสธแล้ว'
                                : 'อนุมัติแล้ว'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteUrgentRequest(req)}
                            className="btn btn-sm btn-light border text-danger"
                            title="ลบประวัติ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="figma-card p-3.5 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-center gap-2.5">
          <div className="relative sm:col-span-2 lg:flex-1 lg:max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              className="form-control !pl-9"
              placeholder="ค้นหาเลขที่ ECV, ชื่อผู้สำรองจ่าย, โปรเจกต์..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="form-select w-full lg:w-auto lg:min-w-[170px]"
            value={filterPayerType}
            onChange={(e) => setFilterPayerType(e.target.value as 'all' | EmergencyPayerType)}
          >
            <option value="all">ผู้สำรองจ่ายทั้งหมด</option>
            <option value="employee">พนักงานบริษัท</option>
            <option value="supplier">ซัพพลายเยอร์</option>
          </select>

          <select
            className="form-select w-full lg:w-auto lg:min-w-[190px]"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | EmergencyCashStatus)}
          >
            <option value="all">ทุกสถานะการเบิกคืน</option>
            <option value="pending_reimburse">รอตรวจสอบ / เบิกคืน</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="reimbursed">คืนเงินสดเรียบร้อย</option>
          </select>
        </div>
      </div>

      {/* Emergency Cash List (Mobile Cards + Tablet/Desktop Table) */}
      <div className="figma-card overflow-hidden">
        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-200">
          {filtered.length === 0 ? (
            <div className="text-center py-10 px-4 text-sm text-slate-500">
              ยังไม่มีรายการค่าใช้จ่ายเงินสดฉุกเฉิน — กดปุ่ม &ldquo;บันทึกเบิกเงินสดฉุกเฉิน&rdquo; เพื่อเริ่มต้น
            </div>
          ) : (
            filtered.map((exp) => {
              const status = exp.emergencyStatus || 'pending_reimburse';
              const statusMeta = STATUS_META[status];
              const isSupplier = exp.payerType === 'supplier';
              const photoCount = (exp.receiptUrl ? 1 : 0) + (exp.extraPhotoUrl ? 1 : 0);

              return (
                <div key={exp.id} className="p-4 space-y-2.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono-num font-bold text-rose-700">
                          {exp.emergencyVoucherNo || `ECV-${exp.id.slice(0, 6).toUpperCase()}`}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10.5px] font-semibold ${
                            isSupplier
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-sky-50 text-sky-700 border-sky-200'
                          }`}
                        >
                          {isSupplier ? 'ซัพพลายเยอร์' : 'พนักงาน'}
                        </span>
                      </div>
                      <div className="text-slate-500 font-mono-num mt-0.5">
                        {formatShortDate(exp.paymentDate)}
                      </div>
                    </div>
                    <div className="text-end font-mono-num shrink-0">
                      <div className="text-slate-500">ยอดเบิกคืน</div>
                      <div className="text-base font-bold text-slate-900">฿{formatTHB(exp.netPaid)}</div>
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold text-sm text-slate-900 thai-prose">
                      {formatThaiLineBreaks(exp.payerName || exp.supplierName)}
                      {exp.payerPhone ? ` · ${exp.payerPhone}` : ''}
                    </div>
                    <div className="font-medium text-slate-800 thai-prose mt-0.5">
                      {formatThaiLineBreaks(exp.eventName)}
                    </div>
                    <div className="text-slate-600 thai-prose">{formatThaiLineBreaks(exp.description)}</div>
                    {exp.urgencyReason && (
                      <div className="text-[11px] text-rose-700 mt-0.5 thai-prose">
                        เหตุผลฉุกเฉิน: {formatThaiLineBreaks(exp.urgencyReason)}
                      </div>
                    )}
                  </div>

                  <div>
                    <select
                      aria-label="สถานะการเบิกคืนเงินสด"
                      className={`form-select form-select-sm text-xs font-semibold border w-full ${statusMeta.badgeCls}`}
                      value={status}
                      onChange={(e) => handleStatusChange(exp, e.target.value as EmergencyCashStatus)}
                    >
                      <option value="pending_reimburse">รอตรวจสอบ / เบิกคืน</option>
                      <option value="approved">อนุมัติจ่ายคืนแล้ว</option>
                      <option value="reimbursed">คืนเงินสดเรียบร้อย</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {(photoCount > 0 || exp.scanFileUrl) && exp.receiptUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoUrl(exp.receiptUrl!)}
                        className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        {exp.scanPageCount && exp.scanPageCount > 1
                          ? `สแกน (${exp.scanPageCount} หน้า)`
                          : 'ดูใบเสร็จ'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setVoucherExpense(exp)}
                      className="btn btn-sm btn-outline-primary inline-flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      ใบเบิก A4
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        sendEmergencyCashLineAlert(exp, company, {
                          onOpenVoucherPrint: (target) => setVoucherExpense(target),
                        })
                      }
                      className="btn btn-sm text-white inline-flex items-center gap-1"
                      style={{ backgroundColor: '#06C755' }}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {exp.lineNotifiedAt ? 'LINE ซ้ำ' : 'แจ้ง LINE'}
                    </button>
                    <div className="ms-auto flex items-center gap-1.5">
                      {status !== 'reimbursed' && (
                        <button
                          type="button"
                          onClick={() => openEditModal(exp)}
                          className="btn btn-sm btn-light border"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(exp)}
                        className="btn btn-sm btn-light border text-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="hidden md:block table-responsive">
          <table className="table table-hover align-middle mb-0 text-sm">
            <thead className="table-light">
              <tr>
                <th className="px-4 py-3">เลขที่เอกสาร / วันที่</th>
                <th className="px-4 py-3">ผู้สำรองจ่ายเงินสด</th>
                <th className="px-4 py-3">โปรเจกต์ / รายการ และเหตุผลฉุกเฉิน</th>
                <th className="px-4 py-3 text-end">ยอดเบิกคืนสุทธิ</th>
                <th className="px-4 py-3 text-center">รูปหลักฐาน</th>
                <th className="px-4 py-3 text-center">สถานะเบิกคืน</th>
                <th className="px-4 py-3 text-end">เอกสาร A4 / แจ้งเตือน LINE</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    ยังไม่มีรายการค่าใช้จ่ายเงินสดฉุกเฉิน — กดปุ่ม &ldquo;บันทึกเบิกเงินสดฉุกเฉิน&rdquo; เพื่อเริ่มต้น
                  </td>
                </tr>
              ) : (
                filtered.map((exp) => {
                  const status = exp.emergencyStatus || 'pending_reimburse';
                  const statusMeta = STATUS_META[status];
                  const isSupplier = exp.payerType === 'supplier';
                  const photoCount =
                    (exp.receiptUrl ? 1 : 0) + (exp.extraPhotoUrl ? 1 : 0);

                  return (
                    <tr key={exp.id}>
                      <td className="px-4 py-3">
                        <div className="font-mono-num font-bold text-rose-700 text-xs">
                          {exp.emergencyVoucherNo || `ECV-${exp.id.slice(0, 6).toUpperCase()}`}
                        </div>
                        <div className="text-xs text-slate-500 font-mono-num">
                          {formatShortDate(exp.paymentDate)}
                        </div>
                      </td>

                      <td className="px-4 py-3 wrap-cell">
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold mb-0.5">
                          <span
                            className={`px-2 py-0.5 rounded border ${
                              isSupplier
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}
                          >
                            {isSupplier ? 'ซัพพลายเยอร์' : 'พนักงาน'}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-900 thai-prose">
                          {formatThaiLineBreaks(exp.payerName || exp.supplierName)}
                        </div>
                        {exp.payerPhone && (
                          <div className="text-xs text-slate-500 font-mono-num">
                            โทร: {exp.payerPhone}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 wrap-cell">
                        <div className="font-semibold text-slate-900 thai-prose">
                          {formatThaiLineBreaks(exp.eventName)}
                        </div>
                        <div className="text-xs text-slate-700 thai-prose">
                          {formatThaiLineBreaks(exp.description)}
                        </div>
                        {exp.urgencyReason && (
                          <div className="text-[11.5px] text-rose-700 mt-0.5 thai-prose">
                            เหตุผลฉุกเฉิน: {formatThaiLineBreaks(exp.urgencyReason)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-end font-mono-num">
                        <div className="font-bold text-slate-900">฿{formatTHB(exp.netPaid)}</div>
                        {(exp.vatAmount > 0 || exp.whtAmount > 0) && (
                          <div className="text-[11px] text-slate-500">
                            ฐาน ฿{formatTHB(exp.amount)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {photoCount > 0 || exp.scanFileUrl ? (
                          <div className="inline-flex flex-col gap-1 items-center">
                            {exp.receiptUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewPhotoUrl(exp.receiptUrl!)}
                                className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                {exp.scanPageCount && exp.scanPageCount > 1
                                  ? `ดูสแกน (${exp.scanPageCount} หน้า)`
                                  : 'ดูใบเสร็จ'}
                              </button>
                            )}
                            {exp.scanFileUrl && (
                              <a
                                href={exp.scanFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-semibold text-blue-700 hover:underline"
                              >
                                เปิดไฟล์สแกนต้นฉบับ
                              </a>
                            )}
                            {exp.extraPhotoUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewPhotoUrl(exp.extraPhotoUrl!)}
                                className="btn btn-sm btn-link text-decoration-none p-0 text-[11px]"
                              >
                                + รูปหน้างาน
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">ไม่มีรูป</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <select
                          aria-label="สถานะการเบิกคืนเงินสด"
                          className={`form-select form-select-sm text-xs font-semibold border ${statusMeta.badgeCls}`}
                          value={status}
                          onChange={(e) =>
                            handleStatusChange(exp, e.target.value as EmergencyCashStatus)
                          }
                        >
                          <option value="pending_reimburse">รอตรวจสอบ / เบิกคืน</option>
                          <option value="approved">อนุมัติจ่ายคืนแล้ว</option>
                          <option value="reimbursed">คืนเงินสดเรียบร้อย</option>
                        </select>
                      </td>

                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setVoucherExpense(exp)}
                            className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 whitespace-nowrap"
                            title="พิมพ์ใบเบิกจ่ายเงินสดฉุกเฉิน A4"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            ใบเบิก A4
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              sendEmergencyCashLineAlert(exp, company, {
                                onOpenVoucherPrint: (target) => setVoucherExpense(target),
                              })
                            }
                            className="btn btn-sm text-white inline-flex items-center gap-1 whitespace-nowrap"
                            style={{ backgroundColor: '#06C755' }}
                            title={`ส่งแจ้งเตือนไปที่ LINE ${oaId}`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {exp.lineNotifiedAt ? 'ส่ง LINE ซ้ำ' : 'แจ้ง LINE'}
                          </button>

                          {status !== 'reimbursed' && (
                            <button
                              type="button"
                              onClick={() => openEditModal(exp)}
                              className="btn btn-sm btn-light border"
                              title="แก้ไขรายการ"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDelete(exp)}
                            className="btn btn-sm btn-light border text-danger"
                            title="ลบรายการ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Emergency Cash Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-xl animate-figma-modal overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50/50">
              <div className="flex-1 text-center ps-6">
                <h3 className="text-base font-bold text-slate-900 m-0 thai-heading">
                  {editingExpense
                    ? `แก้ไขใบเบิกเงินสดฉุกเฉิน (${editingExpense.emergencyVoucherNo || ''})`
                    : 'บันทึกค่าใช้จ่ายเงินสดฉุกเฉินและสแกนใบเสร็จ'}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  แนบรูปใบเสร็จเพื่อดึงข้อมูลอัตโนมัติ (พิมพ์เพิ่มได้หากภาพไม่ชัด) พร้อมแจ้ง LINE OA {oaId}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5">
              <div className="row g-3">
                {/* Camera / Photo Upload + AI Receipt OCR Section (Top for easy scan-first flow) */}
                <div className="col-12">
                  <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                        <Sparkles className="w-4 h-4 text-blue-700" />
                        ขั้นตอนที่ 1 (แนะนำ): ถ่ายรูป/อัปโหลดใบเสร็จ เพื่อดึงข้อมูลลงแบบฟอร์มอัตโนมัติ
                      </div>
                      {form.receiptUrl && (
                        <button
                          type="button"
                          disabled={ocrStatus === 'scanning'}
                          onClick={handleRescanReceipt}
                          className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 text-xs"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                          {ocrStatus === 'scanning' ? 'กำลังสแกน...' : 'สแกนรูปใบเสร็จอีกครั้ง'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Receipt Photo */}
                      <div className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="text-xs font-bold text-slate-700 mb-2">
                          1. รูปใบเสร็จ / บิลเงินสด (สแกนข้อมูลอัตโนมัติ)
                        </div>
                        {form.receiptUrl ? (
                          <div className="space-y-2">
                            <img
                              src={form.receiptUrl}
                              alt="ตัวอย่างใบเสร็จ"
                              className="w-full h-32 object-contain rounded bg-slate-50 border border-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, receiptUrl: '' }));
                                setOcrStatus('idle');
                                setOcrNote('');
                                setOcrUnreadableFields([]);
                              }}
                              className="btn btn-sm btn-outline-danger w-full"
                            >
                              ลบรูปใบเสร็จนี้
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <label className="btn btn-sm btn-primary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" />
                              ถ่ายรูปใบเสร็จ
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload('receiptUrl', e)}
                              />
                            </label>
                            <label className="btn btn-sm btn-outline-secondary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              เลือกรูป
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload('receiptUrl', e)}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setShowScannerModal(true)}
                              className="btn btn-sm btn-outline-primary w-full inline-flex items-center justify-center gap-1.5"
                            >
                              <FileStack className="w-3.5 h-3.5" />
                              สแกนเอกสาร PDF / TIFF / หลายหน้า
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Extra Evidence Photo */}
                      <div className="border border-slate-200 rounded-lg p-3 bg-white">
                        <div className="text-xs font-bold text-slate-700 mb-2">
                          2. รูปภาพหน้างาน / สินค้า (ถ้ามี)
                        </div>
                        {form.extraPhotoUrl ? (
                          <div className="space-y-2">
                            <img
                              src={form.extraPhotoUrl}
                              alt="ตัวอย่างภาพหน้างาน"
                              className="w-full h-32 object-contain rounded bg-slate-50 border border-slate-200"
                            />
                            <button
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, extraPhotoUrl: '' }))}
                              className="btn btn-sm btn-outline-danger w-full"
                            >
                              ลบรูปหน้างานนี้
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <label className="btn btn-sm btn-outline-primary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer">
                              <Camera className="w-3.5 h-3.5" />
                              ถ่ายรูปหน้างาน
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload('extraPhotoUrl', e)}
                              />
                            </label>
                            <label className="btn btn-sm btn-outline-secondary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              เลือกรูป
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handlePhotoUpload('extraPhotoUrl', e)}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* OCR Feedback Banner */}
                    {ocrStatus !== 'idle' && (
                      <div
                        className={`mt-2.5 p-2.5 rounded-lg border text-xs ${
                          ocrStatus === 'scanning'
                            ? 'bg-white border-blue-200 text-blue-800'
                            : ocrStatus === 'success'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50 border-amber-300 text-amber-900'
                        }`}
                      >
                        <div className="font-bold">
                          {ocrStatus === 'scanning' && 'กำลังอ่านข้อมูลจากรูปใบเสร็จ...'}
                          {ocrStatus === 'success' && 'ดึงข้อมูลจากรูปใบเสร็จสำเร็จ ✓'}
                          {(ocrStatus === 'partial' || ocrStatus === 'error') &&
                            'ไม่สามารถอ่านข้อมูลบางส่วนจากรูปใบเสร็จได้ — กรุณาพิมพ์เพิ่มเติมด้วยตนเอง'}
                        </div>
                        {ocrNote && <div className="mt-0.5">{ocrNote}</div>}
                        {ocrUnreadableFields.length > 0 && (
                          <div className="mt-1 font-semibold">
                            ช่องที่แนะนำให้ตรวจสอบ/พิมพ์เพิ่มเติม:{' '}
                            {ocrUnreadableFields
                              .map((f) => FIELD_LABELS_TH[f] || f)
                              .join(', ')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Payer Type Toggle */}
                <div className="col-12">
                  <label className="form-label">ผู้ที่สำรองเงินสดจ่ายล่วงหน้า *</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          payerType: 'employee',
                          payerName: prev.payerName || auth.currentUser?.displayName || '',
                        }))
                      }
                      className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                        form.payerType === 'employee'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-sm font-bold leading-tight">พนักงานบริษัท</div>
                        <div
                          className={`text-[11px] ${
                            form.payerType === 'employee' ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          Staff / ทีมงานหน้างาน
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, payerType: 'supplier' }))}
                      className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                        form.payerType === 'supplier'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <UserCheck className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-sm font-bold leading-tight">ซัพพลายเยอร์</div>
                        <div
                          className={`text-[11px] ${
                            form.payerType === 'supplier' ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          Supplier สำรองจ่ายแทน
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Project & Payment Date */}
                <div className="col-md-7">
                  <label className="form-label">โปรเจกต์ / Event Name *</label>
                  <select
                    className="form-select"
                    required
                    value={form.projectId}
                    onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.eventName} ({p.customerName || '-'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-5">
                  <label className="form-label">
                    วันที่ออกเงินสดจ่าย *
                    {ocrUnreadableFields.includes('receiptDate') && (
                      <span className="text-amber-700 ms-1">(พิมพ์เพิ่ม)</span>
                    )}
                  </label>
                  <input
                    type="date"
                    className={`form-control font-mono-num ${
                      ocrUnreadableFields.includes('receiptDate')
                        ? 'border-amber-400 bg-amber-50/40'
                        : ''
                    }`}
                    required
                    value={form.paymentDate}
                    onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                  />
                </div>

                {/* Optional supplier quick-pick */}
                {form.payerType === 'supplier' && (
                  <div className="col-12">
                    <label className="form-label">เลือกซัพพลายเยอร์จากฐานข้อมูล (Auto-fill)</label>
                    <select
                      className="form-select"
                      value={form.supplierId}
                      onChange={(e) => handleSelectSupplier(e.target.value)}
                    >
                      <option value="">-- กรอกชื่อซัพพลายเยอร์เอง / เลือกจากฐานข้อมูล --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.categoryName || 'ทั่วไป'})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="col-md-6">
                  <label className="form-label">
                    {form.payerType === 'supplier'
                      ? 'ชื่อซัพพลายเยอร์ผู้สำรองจ่าย *'
                      : 'ชื่อ-นามสกุล พนักงานผู้สำรองจ่าย *'}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={form.payerName}
                    onChange={(e) => setForm({ ...form, payerName: e.target.value })}
                    placeholder={
                      form.payerType === 'supplier'
                        ? 'เช่น บริษัท เอวี โปรดักชัน จำกัด'
                        : 'เช่น นายสมชาย ใจกล้า'
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">เบอร์ติดต่อผู้ขอเบิกคืน</label>
                  <input
                    type="text"
                    className="form-control font-mono-num"
                    value={form.payerPhone}
                    onChange={(e) => setForm({ ...form, payerPhone: e.target.value })}
                    placeholder="08x-xxx-xxxx"
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">
                    ร้านค้า / ผู้รับเงินปลายทาง
                    {ocrUnreadableFields.includes('vendorName') && (
                      <span className="text-amber-700 ms-1">(พิมพ์เพิ่ม)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className={`form-control ${
                      ocrUnreadableFields.includes('vendorName')
                        ? 'border-amber-400 bg-amber-50/40'
                        : ''
                    }`}
                    value={form.supplierName}
                    onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                    placeholder="เช่น ร้านวัสดุก่อสร้าง / ปั๊มน้ำมัน / ค่าวิน"
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label">
                    เลขประจำตัวผู้เสียภาษี / บัตรประชาชน (ถ้ามี)
                    {ocrUnreadableFields.includes('vendorTaxId') && (
                      <span className="text-amber-700 ms-1">(พิมพ์เพิ่ม)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className={`form-control font-mono-num ${
                      ocrUnreadableFields.includes('vendorTaxId')
                        ? 'border-amber-400 bg-amber-50/40'
                        : ''
                    }`}
                    value={form.supplierTaxId}
                    onChange={(e) => {
                      const nextTax = e.target.value;
                      const check = validateThaiTaxId(nextTax);
                      setForm({
                        ...form,
                        supplierTaxId: nextTax,
                        payeeEntityType:
                          check.detectedEntityType !== 'unknown'
                            ? check.detectedEntityType
                            : form.payeeEntityType,
                      });
                    }}
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">ประเภทผู้รับเงิน (หัก ณ ที่จ่าย)</label>
                  <select
                    className="form-select"
                    value={form.payeeEntityType}
                    onChange={(e) =>
                      setForm({ ...form, payeeEntityType: e.target.value as EntityLegalType })
                    }
                  >
                    <option value="corporate">นิติบุคคล (ภ.ง.ด. 53)</option>
                    <option value="individual">บุคคลธรรมดา (ภ.ง.ด. 3)</option>
                  </select>
                </div>

                <div className="col-md-8">
                  <label className="form-label">ประเภทเงินได้ตามมาตรา 40 (กรณีมีหัก ณ ที่จ่าย)</label>
                  <select
                    className="form-select"
                    value={form.whtIncomeCode}
                    onChange={(e) => {
                      const cat = WHT_INCOME_CATALOG.find((c) => c.code === e.target.value);
                      setForm((prev) => ({
                        ...prev,
                        whtIncomeCode: e.target.value,
                        whtRate:
                          prev.whtRate > 0 && cat ? cat.defaultRate : prev.whtRate,
                      }));
                    }}
                  >
                    {WHT_INCOME_CATALOG.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.labelTh} ({c.defaultRate}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label">
                    รายละเอียดค่าใช้จ่ายฉุกเฉิน *
                    {ocrUnreadableFields.includes('description') && (
                      <span className="text-amber-700 ms-1">(กรุณาพิมพ์เพิ่มเติม)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    className={`form-control ${
                      ocrUnreadableFields.includes('description')
                        ? 'border-amber-400 bg-amber-50/40'
                        : ''
                    }`}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="เช่น ซื้อปลั๊กพ่วง สายสัญญาณ HDMI และอุปกรณ์หน้างานเร่งด่วน"
                  />
                </div>

                <div className="col-12">
                  <label className="form-label">เหตุผลความจำเป็นเร่งด่วน (แสดงบนใบเบิกและ LINE)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.urgencyReason}
                    onChange={(e) => setForm({ ...form, urgencyReason: e.target.value })}
                    placeholder="เช่น อุปกรณ์หน้างานชำรุดก่อนเริ่มงาน 1 ชั่วโมง ต้องซื้อทดแทนทันที"
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    จำนวนเงิน (ก่อน VAT) *
                    {ocrUnreadableFields.includes('amount') && (
                      <span className="text-amber-700 ms-1">(พิมพ์เพิ่ม)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`form-control font-mono-num fw-bold ${
                      ocrUnreadableFields.includes('amount')
                        ? 'border-amber-400 bg-amber-50/40'
                        : ''
                    }`}
                    required
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => {
                      const { text, value } = sanitizeDecimalInput(e.target.value);
                      setAmountInput(text);
                      setForm({ ...form, amount: value });
                    }}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">VAT (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    className="form-control font-mono-num"
                    value={form.vatRate}
                    onChange={(e) => setForm({ ...form, vatRate: Number(e.target.value) })}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">หัก ณ ที่จ่าย WHT (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    className="form-control font-mono-num"
                    value={form.whtRate}
                    onChange={(e) => setForm({ ...form, whtRate: Number(e.target.value) })}
                  />
                </div>

                <div className="col-12">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap justify-between gap-2 text-xs font-mono-num">
                    <span>VAT: ฿{formatTHB(computedVat)}</span>
                    <span>WHT: -฿{formatTHB(computedWht)}</span>
                    <span className="font-bold text-rose-700 text-sm">
                      ยอดเงินสดเบิกคืนสุทธิ: ฿{formatTHB(computedNetPaid)}
                    </span>
                  </div>
                </div>

                {/* Notify LINE OA Checkbox */}
                <div className="col-12">
                  <label className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-200 bg-emerald-50/60 cursor-pointer">
                    <input
                      type="checkbox"
                      className="form-check-input mt-0"
                      checked={form.notifyLineOnSave}
                      onChange={(e) => setForm({ ...form, notifyLineOnSave: e.target.checked })}
                    />
                    <span className="text-xs sm:text-sm font-semibold text-emerald-900">
                      ส่งแจ้งเตือนค่าใช้จ่ายฉุกเฉิน + รูปภาพไปยัง LINE OA{' '}
                      <span className="font-mono-num font-bold">{oaId}</span> ทันทีหลังบันทึก
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-light border"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-danger px-4 fw-semibold inline-flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  {saving
                    ? 'กำลังบันทึก...'
                    : editingExpense
                      ? 'บันทึกการแก้ไข'
                      : 'บันทึกเอกสารเบิกจ่ายฉุกเฉิน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Project Creation Modal */}
      {showQuickProjModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl animate-figma-modal overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">สร้างโปรเจกต์ / Event ใหม่</h3>
              <button
                type="button"
                onClick={() => setShowQuickProjModal(false)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleQuickProjectCreate} className="p-5 space-y-3">
              <div>
                <label className="form-label">ชื่อ Event / โครงการ *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={quickProjForm.eventName}
                  onChange={(e) =>
                    setQuickProjForm({ ...quickProjForm, eventName: e.target.value })
                  }
                  placeholder="เช่น งานอีเวนต์ฉุกเฉิน"
                />
              </div>
              <div>
                <label className="form-label">ลูกค้า *</label>
                <select
                  className="form-select"
                  value={quickProjForm.customerId}
                  onChange={(e) =>
                    setQuickProjForm({ ...quickProjForm, customerId: e.target.value })
                  }
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuickProjModal(false)}
                  className="btn btn-light border"
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary px-4 fw-semibold">
                  บันทึกโปรเจกต์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Lightbox */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="bg-white rounded-xl p-3 max-w-2xl w-full shadow-2xl animate-figma-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-slate-900">
                หลักฐานรูปภาพค่าใช้จ่ายเงินสดฉุกเฉิน
              </span>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewPhotoUrl}
              alt="หลักฐานค่าใช้จ่ายฉุกเฉิน"
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-lg bg-slate-50"
            />
          </div>
        </div>
      )}

      {/* A4 Emergency Cash Voucher Modal */}
      {voucherExpense && (
        <EmergencyCashVoucherModal
          expense={voucherExpense}
          company={company}
          onClose={() => setVoucherExpense(null)}
          onNotifyLine={(exp) =>
            sendEmergencyCashLineAlert(exp, company, {
              onOpenVoucherPrint: (target) => setVoucherExpense(target),
            })
          }
        />
      )}

      {/* Multi-Page Scanner Modal (PDF / TIFF / Large Batch Images) */}
      {showScannerModal && (
        <MultiPageScannerModal
          storageFolderPrefix={`emergency_cash/${form.projectId || 'emergency'}`}
          title="สแกนเอกสารเบิกเงินสดฉุกเฉินจากเครื่องสแกน (PDF / TIFF / หลายหน้า)"
          onComplete={handleMultiPageScanComplete}
          onClose={() => setShowScannerModal(false)}
        />
      )}

      {/* Import Public Urgent Request Modal */}
      {importingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl animate-figma-modal overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">
                นำเข้าคำขอเบิกด่วน {importingRequest.voucherNo}
              </h3>
              <button
                type="button"
                onClick={() => setImportingRequest(null)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmImportUrgent} className="p-5 space-y-3 text-sm">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-xs">
                <div>
                  <strong>ผู้ส่ง:</strong> {importingRequest.payerName} (฿{formatTHB(importingRequest.netPaid)})
                </div>
                <div>
                  <strong>ชื่องานที่แจ้ง:</strong> {importingRequest.projectName}
                </div>
                <div>
                  <strong>รายละเอียด:</strong> {importingRequest.description}
                </div>
              </div>
              <div>
                <label className="form-label">เลือกโปรเจกต์ที่จะผูกยอดค่าใช้จ่ายเข้าบัญชี *</label>
                <select
                  className="form-select"
                  value={importProjectId}
                  onChange={(e) => setImportProjectId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.eventName} ({p.customerName || '-'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setImportingRequest(null)}
                  className="btn btn-light border"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={importingBusy}
                  className="btn btn-success px-4 fw-semibold"
                >
                  {importingBusy ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า & อนุมัติ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
