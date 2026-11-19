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
  ClipboardCheck,
  FileSpreadsheet,
  FileStack,
  FileText,
  Image as ImageIcon,
  Plus,
  Printer,
  Receipt,
  ScanLine,
  Search,
  Sparkles,
  Trash2,
  Upload,
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
  EntityLegalType,
  Expense,
  FIELD_LIMITS,
  Project,
  ServiceCategory,
  Supplier,
  WhtFormType,
  clampString,
} from '../types/accounting';
import {
  formatShortDate,
  formatTHB,
  generate50TawiNumber,
  getMonthYearFromDate,
  getTodayISO,
  sanitizeDecimalInput,
} from '../utils/formatters';
import {
  closeSwal,
  confirmDelete,
  showUploadLoading,
  toastError,
  toastSuccess,
} from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { Wht50TawiModal } from '../components/Wht50TawiModal';
import { EmergencyCashVoucherModal } from '../components/EmergencyCashVoucherModal';
import {
  MultiPageScannerModal,
  MultiPageScanResult,
} from '../components/MultiPageScannerModal';
import { ThaiDatePickerField } from '../components/ThaiDatePickerField';
import { sendEmergencyCashLineAlert } from '../utils/lineClient';
import {
  FIELD_LABELS_TH,
  scanReceiptFile,
  scanReceiptFromDataUrlOrImage,
} from '../utils/receiptOcrClient';
import {
  auditExpenseWht,
  exportPndAttachmentExcel,
  getWhtFilingDeadlines,
  validateThaiTaxId,
  WHT_INCOME_CATALOG,
} from '../utils/whtCompliance';

interface ExpensesViewProps {
  expenses: Expense[];
  projects: Project[];
  customers: Customer[];
  suppliers: Supplier[];
  categories: ServiceCategory[];
  company: CompanyProfile;
  teamUids: string[];
  onOpenEmergencyTab?: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  expenses,
  projects,
  customers,
  suppliers,
  categories,
  company,
  teamUids,
  onOpenEmergencyTab,
}) => {
  const [subTab, setSubTab] = useState<'list' | 'wht_audit'>('list');
  const [auditMonth, setAuditMonth] = useState<string>(getMonthYearFromDate(getTodayISO()));
  const [search, setSearch] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [selected50TawiExpense, setSelected50TawiExpense] = useState<Expense | null>(null);
  const [selectedEmergencyVoucher, setSelectedEmergencyVoucher] = useState<Expense | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'success' | 'partial' | 'error'>('idle');
  const [ocrNote, setOcrNote] = useState('');
  const [ocrUnreadableFields, setOcrUnreadableFields] = useState<string[]>([]);

  // Quick Project modal if user has no project yet
  const [showQuickProjModal, setShowQuickProjModal] = useState(false);
  const [quickProjForm, setQuickProjForm] = useState({
    eventName: '',
    customerId: '',
    durationStart: getTodayISO(),
    durationEnd: getTodayISO(),
  });

  const [form, setForm] = useState({
    projectId: '',
    supplierId: '',
    supplierName: '',
    supplierTaxId: '',
    supplierAddress: '',
    payeeEntityType: 'corporate' as EntityLegalType,
    whtIncomeCode: '40(8)_service_3',
    categoryId: '',
    categoryName: '',
    description: '',
    amount: 0,
    vatRate: 0,
    whtRate: company.defaultWhtRate ?? 3,
    paymentDate: getTodayISO(),
    receiptUrl: '',
    scanFileUrl: '',
    scanFileName: '',
    scanFileType: '',
    scanPageCount: 0,
    scanFileSizeBytes: 0,
    incomeType50Tawi: 'ค่าจ้างทำของ / ค่าบริการ',
  });
  const [amountInput, setAmountInput] = useState<string>('');

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filterProjectId !== 'all' && e.projectId !== filterProjectId) return false;
      if (!q) return true;
      return (
        e.eventName.toLowerCase().includes(q) ||
        e.supplierName.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q)
      );
    });
  }, [expenses, search, filterProjectId]);

  const totals = useMemo(() => {
    return filteredExpenses.reduce(
      (acc, e) => ({
        amount: acc.amount + e.amount,
        vat: acc.vat + e.vatAmount,
        wht: acc.wht + e.whtAmount,
        netPaid: acc.netPaid + e.netPaid,
      }),
      { amount: 0, vat: 0, wht: 0, netPaid: 0 }
    );
  }, [filteredExpenses]);

  const computedVat = Number(((form.amount * form.vatRate) / 100).toFixed(2));
  const computedWht = Number(((form.amount * form.whtRate) / 100).toFixed(2));
  const computedNetPaid = Number((form.amount + computedVat - computedWht).toFixed(2));

  const openAddExpense = () => {
    if (projects.length === 0) {
      if (customers.length === 0) {
        toastError('กรุณาสร้างข้อมูลลูกค้าและโปรเจกต์ก่อน', 'ไปที่เมนู "ลูกค้า" เพื่อเพิ่มลูกค้าอย่างน้อย 1 ราย');
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

    setForm({
      projectId: projects[0].id,
      supplierId: '',
      supplierName: '',
      supplierTaxId: '',
      supplierAddress: '',
      payeeEntityType: 'corporate',
      whtIncomeCode: '40(8)_service_3',
      categoryId: categories[0]?.id || '',
      categoryName: categories[0]?.name || '',
      description: '',
      amount: 0,
      vatRate: 0,
      whtRate: company.defaultWhtRate ?? 3,
      paymentDate: getTodayISO(),
      receiptUrl: '',
      scanFileUrl: '',
      scanFileName: '',
      scanFileType: '',
      scanPageCount: 0,
      scanFileSizeBytes: 0,
      incomeType50Tawi: 'ค่าจ้างทำของ / ค่าบริการ',
    });
    setOcrStatus('idle');
    setOcrNote('');
    setOcrUnreadableFields([]);
    setAmountInput('');
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
      setForm((prev) => ({ ...prev, projectId: refDoc.id }));
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
    if (form.amount === 0 && sup.baseRate > 0) {
      setAmountInput(String(sup.baseRate));
    }
    setForm((prev) => ({
      ...prev,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierTaxId: sup.taxId || '',
      supplierAddress: sup.address || '',
      payeeEntityType: sup.entityType || 'corporate',
      categoryId: sup.categoryId,
      categoryName: sup.categoryName || cat?.name || '',
      whtRate: cat?.defaultWhtRate ?? prev.whtRate,
      amount: prev.amount === 0 && sup.baseRate > 0 ? sup.baseRate : prev.amount,
    }));
  };

  const applyOcrToExpenseForm = (res: Awaited<ReturnType<typeof scanReceiptFile>>) => {
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
      supplierAddress: d.vendorAddress || prev.supplierAddress,
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
      applyOcrToExpenseForm(result.ocrResult);
    }
    toastSuccess(`แนบเอกสารสแกน ${result.scanPageCount} หน้าเรียบร้อยแล้ว`);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const targetProjectId = form.projectId || 'general';
    showUploadLoading('กำลังอัปโหลดและสแกนข้อมูลจากรูปใบเสร็จ...');
    setOcrStatus('scanning');
    setOcrNote('กำลังอ่านข้อความและยอดเงินจากรูปใบเสร็จด้วย AI...');
    try {
      const [url, ocrRes] = await Promise.all([
        uploadAssetFile(`expense_receipts/${targetProjectId}/${Date.now()}_${file.name}`, file),
        scanReceiptFile(file),
      ]);
      setForm((prev) => ({ ...prev, receiptUrl: url }));
      closeSwal();
      applyOcrToExpenseForm(ocrRes);
      toastSuccess('อัปโหลดใบเสร็จและดึงข้อมูลเบื้องต้นแล้ว');
    } catch (error) {
      closeSwal();
      toastError(
        'อัปโหลดใบเสร็จไม่สำเร็จ',
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
    applyOcrToExpenseForm(res);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const proj = projects.find((p) => p.id === form.projectId);
    if (!proj) {
      toastError('กรุณาเลือกโปรเจกต์ / Event');
      return;
    }

    const supplierName = clampString(form.supplierName, FIELD_LIMITS.companyName);
    const description = clampString(form.description, FIELD_LIMITS.description);
    if (!supplierName || !description) {
      toastError('กรุณากรอกชื่อผู้รับเงินและรายละเอียดค่าใช้จ่าย');
      return;
    }

    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    const resolvedFormType: WhtFormType =
      computedWht > 0
        ? form.whtIncomeCode === '40(1)_salary'
          ? 'PND1'
          : form.payeeEntityType === 'individual'
            ? 'PND3'
            : 'PND53'
        : 'NONE';

    try {
      await addDoc(collection(db, 'expenses'), {
        projectId: proj.id,
        eventName: clampString(proj.eventName, FIELD_LIMITS.eventName),
        supplierId: form.supplierId,
        supplierName,
        supplierTaxId: clampString(form.supplierTaxId, FIELD_LIMITS.taxId),
        supplierAddress: clampString(form.supplierAddress, FIELD_LIMITS.address),
        payeeEntityType: form.payeeEntityType,
        whtFormType: resolvedFormType,
        whtIncomeCode: clampString(form.whtIncomeCode, 60),
        categoryId: form.categoryId,
        categoryName: clampString(form.categoryName, 150),
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
        scanFileUrl: form.scanFileUrl || '',
        scanFileName: clampString(form.scanFileName, 240),
        scanFileType: clampString(form.scanFileType, 90),
        scanPageCount: Number(form.scanPageCount) || 0,
        scanFileSizeBytes: Number(form.scanFileSizeBytes) || 0,
        wht50TawiNo: '',
        wht50TawiIssued: false,
        incomeType50Tawi: clampString(form.incomeType50Tawi, 200),
        createdBy: uid,
        teamUids: activeTeam,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toastSuccess('บันทึกรายจ่ายเข้าโปรเจกต์เรียบร้อย');
      setShowModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    }
  };

  const handleOpen50Tawi = async (exp: Expense) => {
    if (!exp.wht50TawiIssued || !exp.wht50TawiNo) {
      const newNo = generate50TawiNumber(expenses);
      try {
        await updateDoc(doc(db, 'expenses', exp.id), {
          wht50TawiNo: newNo,
          wht50TawiIssued: true,
          updatedAt: serverTimestamp(),
        });
        setSelected50TawiExpense({ ...exp, wht50TawiNo: newNo, wht50TawiIssued: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `expenses/${exp.id}`);
      }
    } else {
      setSelected50TawiExpense(exp);
    }
  };

  const handleDeleteExpense = async (exp: Expense) => {
    const ok = await confirmDelete(exp.description);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'expenses', exp.id));
      toastSuccess('ลบรายการรายจ่ายแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `expenses/${exp.id}`);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      <div className="flex flex-col items-center text-center gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            {formatThaiLineBreaks('บันทึกรายจ่ายโปรเจกต์และออกหนังสือรับรอง 50 ทวิ')}
          </h1>
          <p className="thai-prose text-xs sm:text-sm text-slate-500 mt-1.5 mb-0">
            {formatThaiLineBreaks(
              'บันทึกรายจ่ายผูกกับ Event พร้อมสแกนดึงข้อมูลจากรูปใบเสร็จอัตโนมัติ และออก 50 ทวิให้ซัพพลายเยอร์'
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
          {onOpenEmergencyTab && (
            <button
              type="button"
              onClick={onOpenEmergencyTab}
              className="figma-btn col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 whitespace-nowrap"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              เบิกจ่ายฉุกเฉิน (LINE)
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (customers.length === 0) {
                toastError('กรุณาเพิ่มลูกค้าก่อนสร้างโปรเจกต์');
                return;
              }
              setQuickProjForm({
                eventName: '',
                customerId: customers[0].id,
                durationStart: getTodayISO(),
                durationEnd: getTodayISO(),
              });
              setShowQuickProjModal(true);
            }}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            สร้างโปรเจกต์ใหม่
          </button>
          <button
            type="button"
            onClick={openAddExpense}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 whitespace-nowrap"
          >
            <Receipt className="w-4 h-4 shrink-0" />
            บันทึกรายจ่ายใหม่
          </button>
        </div>
      </div>

      {/* Sub-Tab Switcher: Expenses Ledger vs Revenue Dept WHT Filing (PND3 / PND53) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:inline-flex md:mx-auto gap-2 w-full md:w-auto">
        <button
          type="button"
          onClick={() => setSubTab('list')}
          className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap ${
            subTab === 'list'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Receipt className="w-4 h-4 shrink-0" />
          รายการรายจ่ายทั้งหมด ({filteredExpenses.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('wht_audit')}
          className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap ${
            subTab === 'wht_audit'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <ClipboardCheck className="w-4 h-4 shrink-0" />
          ตรวจเช็กและยื่น ภ.ง.ด. 3 / 53 (สรรพากร)
        </button>
      </div>

      {subTab === 'list' ? (
        <>
          {/* Filter & Totals Bar */}
          <div className="figma-card p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
              <div className="relative w-full sm:flex-1 sm:max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  className="form-control !pl-9"
                  placeholder="ค้นหารายการ, ซัพพลายเยอร์, Event..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select
                className="form-select w-full sm:w-auto sm:min-w-[210px]"
                value={filterProjectId}
                onChange={(e) => setFilterProjectId(e.target.value)}
              >
                <option value="all">ทุกโปรเจกต์ / Event ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.eventName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-5 gap-y-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 text-xs font-mono-num">
              <div>
                <span className="text-slate-500">ฐานค่าใช้จ่าย: </span>
                <strong className="text-slate-900">฿{formatTHB(totals.amount)}</strong>
              </div>
              <div>
                <span className="text-slate-500">VAT ซื้อ: </span>
                <strong className="text-blue-700">฿{formatTHB(totals.vat)}</strong>
              </div>
              <div>
                <span className="text-slate-500">WHT หักไว้: </span>
                <strong className="text-amber-700">฿{formatTHB(totals.wht)}</strong>
              </div>
              <div>
                <span className="text-slate-500">จ่ายสุทธิ: </span>
                <strong className="text-rose-700">฿{formatTHB(totals.netPaid)}</strong>
              </div>
            </div>
          </div>

          {/* Expenses Table (Tablet/Desktop) & Card List (Mobile) */}
          <div className="figma-card overflow-hidden">
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredExpenses.length === 0 ? (
                <div className="text-center py-10 px-4 text-sm text-slate-500">
                  <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  ยังไม่มีรายการรายจ่ายโครงการ
                </div>
              ) : (
                filteredExpenses.map((e) => {
                  const audit = auditExpenseWht(e, suppliers);
                  return (
                    <div key={e.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 font-mono-num">
                            <span>{formatShortDate(e.paymentDate)}</span>
                            {e.isEmergencyCash && (
                              <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                เงินสดฉุกเฉิน {e.emergencyVoucherNo || ''}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-sm text-slate-900 thai-prose mt-0.5">
                            {formatThaiLineBreaks(e.eventName)}
                          </div>
                          <div className="text-xs text-slate-600 thai-prose">
                            {formatThaiLineBreaks(e.description)}
                          </div>
                        </div>
                        <div className="text-end shrink-0 font-mono-num">
                          <div className="text-xs text-slate-500">จ่ายสุทธิ</div>
                          <div className="text-base font-bold text-slate-900">
                            ฿{formatTHB(e.netPaid)}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 border border-slate-100 space-y-1">
                        <div className="font-medium text-slate-800 thai-prose">
                          {formatThaiLineBreaks(e.supplierName)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {audit.entityType === 'individual' ? 'บุคคลธรรมดา' : 'นิติบุคคล'} ·{' '}
                          {e.whtAmount > 0
                            ? audit.formType === 'PND3'
                              ? 'ภ.ง.ด. 3'
                              : audit.formType === 'PND1'
                                ? 'ภ.ง.ด. 1'
                                : 'ภ.ง.ด. 53'
                            : 'ไม่หัก WHT'}{' '}
                          · Tax: {e.supplierTaxId || '-'}
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-200/70 font-mono-num text-[11px]">
                          <div>
                            <span className="text-slate-500 block">ก่อนภาษี</span>
                            <span className="font-semibold text-slate-900">฿{formatTHB(e.amount)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">VAT</span>
                            <span className="font-semibold text-blue-700">฿{formatTHB(e.vatAmount)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">WHT ({e.whtRate}%)</span>
                            <span className="font-semibold text-amber-700">-฿{formatTHB(e.whtAmount)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {e.receiptUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewReceiptUrl(e.receiptUrl!)}
                              className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              {e.scanPageCount && e.scanPageCount > 1
                                ? `ดูสแกน (${e.scanPageCount} หน้า)`
                                : 'ดูรูป'}
                            </button>
                          )}
                          {e.scanFileUrl && (
                            <a
                              href={e.scanFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-blue-700 hover:underline px-1.5"
                            >
                              ไฟล์สแกนต้นฉบับ
                            </a>
                          )}
                          {e.isEmergencyCash && (
                            <button
                              type="button"
                              onClick={() => setSelectedEmergencyVoucher(e)}
                              className="btn btn-sm btn-outline-danger inline-flex items-center gap-1"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              ใบเบิกฉุกเฉิน
                            </button>
                          )}
                          {e.whtAmount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpen50Tawi(e)}
                              className="btn btn-sm btn-outline-primary inline-flex items-center gap-1"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {e.wht50TawiIssued ? e.wht50TawiNo : 'ออก 50 ทวิ'}
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(e)}
                          className="btn btn-sm btn-light border text-danger ms-auto"
                          aria-label="ลบรายการ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Tablet & Desktop Table */}
            <div className="hidden md:block table-responsive">
              <table className="table table-hover align-middle mb-0 text-sm">
                <thead className="table-light">
                  <tr>
                    <th className="px-4 py-3">วันที่จ่าย</th>
                    <th className="px-4 py-3">โปรเจกต์ / รายละเอียด</th>
                    <th className="px-4 py-3">ผู้รับเงิน / แบบ ภ.ง.ด.</th>
                    <th className="px-4 py-3 text-end">ยอดก่อนภาษี</th>
                    <th className="px-4 py-3 text-end">VAT / WHT</th>
                    <th className="px-4 py-3 text-end">จ่ายสุทธิ</th>
                    <th className="px-4 py-3 text-center">หลักฐาน / สแกน</th>
                    <th className="px-4 py-3 text-end">50 ทวิ / จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-slate-500">
                        ยังไม่มีรายการรายจ่ายโครงการ
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((e) => {
                      const audit = auditExpenseWht(e, suppliers);
                      return (
                        <tr key={e.id}>
                          <td className="px-4 py-3 font-mono-num text-xs text-slate-600">
                            {formatShortDate(e.paymentDate)}
                          </td>
                          <td className="px-4 py-3 wrap-cell">
                            <div className="font-semibold text-slate-900 thai-prose flex flex-wrap items-center gap-1.5">
                              <span>{formatThaiLineBreaks(e.eventName)}</span>
                              {e.isEmergencyCash && (
                                <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                  เงินสดฉุกเฉิน {e.emergencyVoucherNo || ''}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 thai-prose">
                              {formatThaiLineBreaks(e.description)}
                            </div>
                          </td>
                          <td className="px-4 py-3 wrap-cell">
                            <div className="text-slate-800 font-medium thai-prose">
                              {formatThaiLineBreaks(e.supplierName)}
                            </div>
                            <div className="text-xs text-slate-500">
                              {audit.entityType === 'individual' ? 'บุคคลธรรมดา' : 'นิติบุคคล'} ·{' '}
                              {e.whtAmount > 0
                                ? audit.formType === 'PND3'
                                  ? 'ภ.ง.ด. 3'
                                  : audit.formType === 'PND1'
                                    ? 'ภ.ง.ด. 1'
                                    : 'ภ.ง.ด. 53'
                                : 'ไม่หัก WHT'}{' '}
                              · Tax: {e.supplierTaxId || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-end font-mono-num">฿{formatTHB(e.amount)}</td>
                          <td className="px-4 py-3 text-end font-mono-num text-xs">
                            <div className="text-blue-700">VAT: ฿{formatTHB(e.vatAmount)}</div>
                            <div className="text-amber-700">
                              WHT ({e.whtRate}%): -฿{formatTHB(e.whtAmount)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-end font-mono-num font-bold text-slate-900">
                            ฿{formatTHB(e.netPaid)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {e.receiptUrl || e.scanFileUrl ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                {e.receiptUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewReceiptUrl(e.receiptUrl!)}
                                    className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1 whitespace-nowrap"
                                  >
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    {e.scanPageCount && e.scanPageCount > 1
                                      ? `ดูสแกน (${e.scanPageCount} หน้า)`
                                      : 'ดูรูป'}
                                  </button>
                                )}
                                {e.scanFileUrl && (
                                  <a
                                    href={e.scanFileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-semibold text-blue-700 hover:underline"
                                  >
                                    ไฟล์สแกนต้นฉบับ
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">ไม่มีรูป</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              {e.isEmergencyCash && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedEmergencyVoucher(e)}
                                  className="btn btn-sm btn-outline-danger inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  ใบเบิกฉุกเฉิน
                                </button>
                              )}
                              {e.whtAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpen50Tawi(e)}
                                  className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 whitespace-nowrap"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  {e.wht50TawiIssued ? e.wht50TawiNo : 'ออก 50 ทวิ'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteExpense(e)}
                                className="btn btn-sm btn-light border text-danger"
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
        </>
      ) : (
        /* WHT Revenue Department Audit & PND3 / PND53 Filing View */
        (() => {
          const monthExpenses = expenses.filter((e) => e.monthYear === auditMonth);
          const audits = monthExpenses.map((e) => auditExpenseWht(e, suppliers));
          const pnd3Items = audits.filter((a) => a.formType === 'PND3' && a.expense.whtAmount > 0);
          const pnd53Items = audits.filter((a) => a.formType === 'PND53' && a.expense.whtAmount > 0);
          const pnd3Base = pnd3Items.reduce((s, a) => s + a.expense.amount, 0);
          const pnd3Tax = pnd3Items.reduce((s, a) => s + a.expense.whtAmount, 0);
          const pnd53Base = pnd53Items.reduce((s, a) => s + a.expense.amount, 0);
          const pnd53Tax = pnd53Items.reduce((s, a) => s + a.expense.whtAmount, 0);
          const deadlines = getWhtFilingDeadlines(auditMonth);
          const availableMonths = Array.from(
            new Set([auditMonth, ...expenses.map((e) => e.monthYear)])
          ).sort((a, b) => b.localeCompare(a));

          return (
            <div className="space-y-4">
              {/* Month Picker + Deadlines */}
              <div className="figma-card p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <label className="text-xs font-bold text-slate-700 m-0 whitespace-nowrap">
                    เลือกงวดเดือนภาษี:
                  </label>
                  <select
                    className="form-select form-select-sm w-auto font-mono-num"
                    value={auditMonth}
                    onChange={(e) => setAuditMonth(e.target.value)}
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-600 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-4">
                  <span>
                    ยื่นแบบกระดาษภายใน: <strong className="text-slate-900">{deadlines.paperDeadlineTh}</strong>
                  </span>
                  <span>
                    ยื่น e-Filing (ขยายเวลา) ภายใน:{' '}
                    <strong className="text-blue-700">{deadlines.eFilingDeadlineTh}</strong>
                  </span>
                </div>
              </div>

              {/* Separate PND3 (Individual) vs PND53 (Corporate) Summary Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* PND 3 */}
                <div className="figma-card p-4 sm:p-5 border-t-2 border-t-amber-600 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-amber-700">
                        แบบ ภ.ง.ด. 3 (บุคคลธรรมดา / คณะบุคคล)
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1 mb-0 thai-heading">
                        ผู้รับเงินบุคคลธรรมดา (เลขประจำตัวขึ้นต้น 1–8)
                      </h3>
                    </div>
                    <button
                      type="button"
                      disabled={pnd3Items.length === 0}
                      onClick={() => exportPndAttachmentExcel(auditMonth, 'PND3', audits, company)}
                      className="btn btn-sm btn-outline-primary inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full sm:w-auto shrink-0"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Export ใบแนบ ภ.ง.ด. 3
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2.5 border-t border-slate-100 text-[11px] sm:text-xs">
                    <div>
                      <div className="text-slate-500">จำนวนรายการ</div>
                      <div className="text-base sm:text-lg font-bold font-mono-num text-slate-900 mt-0.5">
                        {pnd3Items.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">เงินได้ที่จ่ายรวม</div>
                      <div className="text-base sm:text-lg font-bold font-mono-num text-slate-900 mt-0.5">
                        ฿{formatTHB(pnd3Base)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">ภาษีที่ต้องนำส่ง</div>
                      <div className="text-base sm:text-lg font-bold font-mono-num text-amber-700 mt-0.5">
                        ฿{formatTHB(pnd3Tax)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* PND 53 */}
                <div className="figma-card p-4 sm:p-5 border-t-2 border-t-blue-700 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-blue-700">
                        แบบ ภ.ง.ด. 53 (นิติบุคคล / บริษัท / หจก.)
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-1 mb-0 thai-heading">
                        ผู้รับเงินนิติบุคคล (เลขทะเบียนขึ้นต้นด้วย 0)
                      </h3>
                    </div>
                    <button
                      type="button"
                      disabled={pnd53Items.length === 0}
                      onClick={() => exportPndAttachmentExcel(auditMonth, 'PND53', audits, company)}
                      className="btn btn-sm btn-outline-primary inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full sm:w-auto shrink-0"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Export ใบแนบ ภ.ง.ด. 53
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-2.5 border-t border-slate-100 text-[11px] sm:text-xs">
                    <div>
                      <div className="text-slate-500">จำนวนรายการ</div>
                      <div className="text-base sm:text-lg font-bold font-mono-num text-slate-900 mt-0.5">
                        {pnd53Items.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">เงินได้ที่จ่ายรวม</div>
                      <div className="text-base sm:text-lg font-bold font-mono-num text-slate-900 mt-0.5">
                        ฿{formatTHB(pnd53Base)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">ภาษีที่ต้องนำส่ง</div>
                      <div className="text-base sm:text-lg font-bold font-mono-num text-blue-700 mt-0.5">
                        ฿{formatTHB(pnd53Tax)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Per-Transaction Compliance Table */}
              <div className="figma-card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-col gap-1">
                  <h4 className="text-sm font-bold text-slate-900 m-0 thai-heading">
                    ผลการตรวจสอบความถูกต้องตามระเบียบกรมสรรพากร (ท.ป. 4/2528 และ ม.3 เตรส)
                  </h4>
                  <span className="text-xs text-slate-500 thai-prose">
                    แยกตรวจทั้ง Tax ID 13 หลัก (Checksum), ประเภทบุคคล/นิติบุคคล, เกณฑ์ขั้นต่ำ 1,000 บาท และการออก 50 ทวิ
                  </span>
                </div>

                {/* Mobile Audit Cards */}
                <div className="md:hidden divide-y divide-slate-200">
                  {audits.length === 0 ? (
                    <div className="text-center py-8 px-4 text-sm text-slate-500">
                      ไม่มีรายการรายจ่ายในเดือน {auditMonth}
                    </div>
                  ) : (
                    audits.map((a) => (
                      <div key={a.expense.id} className="p-4 space-y-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-slate-900 thai-prose">
                              {formatThaiLineBreaks(a.expense.supplierName)}
                            </div>
                            <div className="text-slate-500 font-mono-num">
                              {formatShortDate(a.expense.paymentDate)} · Tax: {a.expense.supplierTaxId || '-'}
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold shrink-0">
                            {a.formType === 'PND3'
                              ? 'ภ.ง.ด. 3'
                              : a.formType === 'PND53'
                                ? 'ภ.ง.ด. 53'
                                : a.formType === 'PND1'
                                  ? 'ภ.ง.ด. 1'
                                  : 'ไม่หัก WHT'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 font-mono-num">
                          <div>
                            <span className="text-slate-500 block">ฐานเงินได้</span>
                            <span className="font-semibold text-slate-900">฿{formatTHB(a.expense.amount)}</span>
                          </div>
                          <div className="text-end">
                            <span className="text-slate-500 block">ภาษีหัก (WHT)</span>
                            <span className="font-bold text-amber-700">฿{formatTHB(a.expense.whtAmount)}</span>
                          </div>
                        </div>

                        <div>
                          {a.issues.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              ครบถ้วนพร้อมยื่นสรรพากร
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {a.issues.map((iss, idx) => (
                                <div
                                  key={idx}
                                  className={iss.severity === 'error' ? 'text-rose-700 font-semibold' : 'text-amber-800'}
                                >
                                  • {iss.message}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {a.expense.whtAmount > 0 && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => handleOpen50Tawi(a.expense)}
                              className="btn btn-sm btn-outline-primary w-full"
                            >
                              {a.expense.wht50TawiIssued ? a.expense.wht50TawiNo : 'ออก 50 ทวิ'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Tablet & Desktop Table */}
                <div className="hidden md:block table-responsive">
                  <table className="table align-middle mb-0 text-sm">
                    <thead className="table-light">
                      <tr>
                        <th className="px-4 py-2.5">วันที่ / ผู้รับเงิน</th>
                        <th className="px-4 py-2.5">ประเภท / แบบยื่น</th>
                        <th className="px-4 py-2.5 text-end">ฐานเงินได้</th>
                        <th className="px-4 py-2.5 text-end">ภาษีหัก (WHT)</th>
                        <th className="px-4 py-2.5">ผลการตรวจความครบถ้วน</th>
                        <th className="px-4 py-2.5 text-end">50 ทวิ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-slate-500">
                            ไม่มีรายการรายจ่ายในเดือน {auditMonth}
                          </td>
                        </tr>
                      ) : (
                        audits.map((a) => (
                          <tr key={a.expense.id}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-900">
                                {a.expense.supplierName}
                              </div>
                              <div className="text-xs text-slate-500 font-mono-num">
                                {formatShortDate(a.expense.paymentDate)} · Tax:{' '}
                                {a.expense.supplierTaxId || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <div className="font-semibold text-slate-800">
                                {a.entityType === 'individual' ? 'บุคคลธรรมดา' : 'นิติบุคคล'}
                              </div>
                              <div className="text-slate-500">
                                {a.formType === 'PND3'
                                  ? 'แบบ ภ.ง.ด. 3'
                                  : a.formType === 'PND53'
                                    ? 'แบบ ภ.ง.ด. 53'
                                    : a.formType === 'PND1'
                                      ? 'แบบ ภ.ง.ด. 1'
                                      : 'ไม่มีการหัก WHT'}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-end font-mono-num">
                              ฿{formatTHB(a.expense.amount)}
                            </td>
                            <td className="px-4 py-3 text-end font-mono-num font-bold text-amber-700">
                              ฿{formatTHB(a.expense.whtAmount)}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {a.issues.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  ครบถ้วนพร้อมยื่นสรรพากร
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {a.issues.map((iss, idx) => (
                                    <div
                                      key={idx}
                                      className={
                                        iss.severity === 'error'
                                          ? 'text-rose-700 font-semibold'
                                          : 'text-amber-800'
                                      }
                                    >
                                      • {iss.message}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              {a.expense.whtAmount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpen50Tawi(a.expense)}
                                  className="btn btn-sm btn-outline-primary whitespace-nowrap"
                                >
                                  {a.expense.wht50TawiIssued
                                    ? a.expense.wht50TawiNo
                                    : 'ออก 50 ทวิ'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-xl animate-figma-modal overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex-1 text-center ps-6">
                <h3 className="text-base font-bold text-slate-900 m-0 thai-heading">
                  บันทึกรายจ่ายโปรเจกต์และสแกนใบเสร็จอัตโนมัติ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="p-5">
              <div className="row g-3">
                {/* Receipt Photo + OCR Scanner */}
                <div className="col-12">
                  <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                        <Sparkles className="w-4 h-4 text-blue-700" />
                        แนบรูปสลิป / ใบเสร็จ เพื่อดึงข้อมูลลงแบบฟอร์มอัตโนมัติ
                      </div>
                      {form.receiptUrl && (
                        <button
                          type="button"
                          disabled={ocrStatus === 'scanning'}
                          onClick={handleRescanReceipt}
                          className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 text-xs"
                        >
                          <ScanLine className="w-3.5 h-3.5" />
                          {ocrStatus === 'scanning' ? 'กำลังสแกน...' : 'สแกนอีกครั้ง'}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="btn btn-primary btn-sm inline-flex items-center gap-1.5 cursor-pointer">
                        <Camera className="w-4 h-4" />
                        ถ่ายรูปใบเสร็จ
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleReceiptUpload}
                        />
                      </label>
                      <label className="btn btn-outline-secondary btn-sm inline-flex items-center gap-1.5 cursor-pointer bg-white">
                        <Upload className="w-4 h-4" />
                        อัปโหลดรูปใบเสร็จ
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleReceiptUpload}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowScannerModal(true)}
                        className="btn btn-outline-primary btn-sm inline-flex items-center gap-1.5 bg-white"
                      >
                        <FileStack className="w-4 h-4" />
                        สแกน PDF / TIFF / หลายหน้า
                      </button>
                      {form.receiptUrl && (
                        <span className="text-xs text-emerald-700 font-semibold">
                          ✓ แนบหลักฐานแล้ว
                          {form.scanPageCount > 1 ? ` (${form.scanPageCount} หน้า)` : ''}
                        </span>
                      )}
                    </div>

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

                <div className="col-12 col-lg-7">
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
                <div className="col-12 col-lg-5">
                  <ThaiDatePickerField
                    label={
                      <>
                        วันที่จ่ายเงิน (ว/ด/ป) *
                        {ocrUnreadableFields.includes('receiptDate') && (
                          <span className="text-amber-700 ms-1">(พิมพ์เพิ่ม)</span>
                        )}
                      </>
                    }
                    value={form.paymentDate}
                    onChange={(nextIso) => setForm({ ...form, paymentDate: nextIso })}
                    highlighted={ocrUnreadableFields.includes('receiptDate')}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">เลือกซัพพลายเยอร์จากฐานข้อมูล (Auto-fill)</label>
                  <select
                    className="form-select"
                    value={form.supplierId}
                    onChange={(e) => handleSelectSupplier(e.target.value)}
                  >
                    <option value="">-- กรอกเอง / เลือกซัพพลายเยอร์ --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.categoryName || 'ทั่วไป'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">
                    ชื่อผู้รับเงิน / ซัพพลายเยอร์ *
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
                    required
                    value={form.supplierName}
                    onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
                  />
                </div>

                <div className="col-md-5">
                  <label className="form-label">
                    Tax ID / เลขบัตรประชาชน 13 หลัก (50 ทวิ)
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
                  {form.supplierTaxId && (
                    <div
                      className={`text-[11px] mt-1 ${
                        validateThaiTaxId(form.supplierTaxId).checksumValid
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {validateThaiTaxId(form.supplierTaxId).reason}
                    </div>
                  )}
                </div>

                <div className="col-md-3">
                  <label className="form-label">สถานะทางกฎหมาย *</label>
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

                <div className="col-md-4">
                  <label className="form-label">ประเภทเงินได้ตาม ม.40</label>
                  <select
                    className="form-select"
                    value={form.whtIncomeCode}
                    onChange={(e) => {
                      const cat = WHT_INCOME_CATALOG.find((c) => c.code === e.target.value);
                      setForm({
                        ...form,
                        whtIncomeCode: e.target.value,
                        incomeType50Tawi: cat ? cat.labelTh : form.incomeType50Tawi,
                        whtRate: cat ? cat.defaultRate : form.whtRate,
                      });
                    }}
                  >
                    {WHT_INCOME_CATALOG.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.labelTh} ({c.defaultRate}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-md-6">
                  <label className="form-label">ข้อความประเภทเงินได้บน 50 ทวิ</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.incomeType50Tawi}
                    onChange={(e) => setForm({ ...form, incomeType50Tawi: e.target.value })}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label">ที่อยู่ผู้รับเงิน (สำหรับ 50 ทวิ / ภ.ง.ด.)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.supplierAddress}
                    onChange={(e) => setForm({ ...form, supplierAddress: e.target.value })}
                    placeholder="เลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์"
                  />
                </div>

                <div className="col-12">
                  <label className="form-label">
                    รายละเอียดค่าใช้จ่าย *
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
                    placeholder="เช่น ค่าจ้างทีมถ่ายทำวิดีโอ / ค่าเช่าอุปกรณ์ไฟ"
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label">
                    จำนวนเงิน (ก่อนภาษี) *
                    {ocrUnreadableFields.includes('amount') && (
                      <span className="text-amber-700 ms-1">(พิมพ์เพิ่ม)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`form-control font-mono-num ${
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
                  <label className="form-label">ภาษีมูลค่าเพิ่ม VAT (%)</label>
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
                    <span>VAT ซื้อ: ฿{formatTHB(computedVat)}</span>
                    <span>
                      หัก ณ ที่จ่าย ({form.payeeEntityType === 'individual' ? 'ภ.ง.ด. 3' : 'ภ.ง.ด. 53'}): -฿
                      {formatTHB(computedWht)}
                    </span>
                    <span className="font-bold text-slate-900">
                      ยอดโอนจ่ายสุทธิ: ฿{formatTHB(computedNetPaid)}
                    </span>
                  </div>
                  {form.amount > 0 && form.amount < 1000 && form.whtRate > 0 && (
                    <div className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                      หมายเหตุ ท.ป. 4/2528 ข้อ 12 ทวิ: การจ่ายค่าบริการครั้งเดียวไม่ถึง 1,000 บาท ได้รับยกเว้นไม่ต้องหัก ณ ที่จ่าย (เว้นแต่เป็นสัญญาระยะยาวต่อเนื่อง)
                    </div>
                  )}
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
                <button type="submit" className="btn btn-primary px-4 fw-semibold">
                  บันทึกรายจ่าย
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Project Creation Modal */}
      {showQuickProjModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl shadow-xl animate-figma-modal overflow-hidden">
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
            <form onSubmit={handleQuickProjectCreate} className="p-5 space-y-3.5">
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
                  placeholder="เช่น งานเปิดตัวสินค้า Q4 2026"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ThaiDatePickerField
                  label="วันเริ่มงาน (ว/ด/ป)"
                  value={quickProjForm.durationStart}
                  onChange={(nextIso) =>
                    setQuickProjForm({ ...quickProjForm, durationStart: nextIso })
                  }
                />
                <ThaiDatePickerField
                  label="วันสิ้นสุด (ว/ด/ป)"
                  value={quickProjForm.durationEnd}
                  onChange={(nextIso) =>
                    setQuickProjForm({ ...quickProjForm, durationEnd: nextIso })
                  }
                />
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

      {/* Receipt Image Lightbox */}
      {previewReceiptUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4"
          onClick={() => setPreviewReceiptUrl(null)}
        >
          <div
            className="bg-white rounded-xl p-3 max-w-2xl w-full shadow-2xl animate-figma-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-slate-900">หลักฐานใบเสร็จ / สลิปโอนเงิน</span>
              <button
                type="button"
                onClick={() => setPreviewReceiptUrl(null)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewReceiptUrl}
              alt="ใบเสร็จค่าใช้จ่าย"
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-lg bg-slate-50"
            />
          </div>
        </div>
      )}

      {/* 50 Tawi Print Modal */}
      {selected50TawiExpense && (
        <Wht50TawiModal
          expense={selected50TawiExpense}
          company={company}
          onClose={() => setSelected50TawiExpense(null)}
        />
      )}

      {/* Emergency Cash Voucher Modal */}
      {selectedEmergencyVoucher && (
        <EmergencyCashVoucherModal
          expense={selectedEmergencyVoucher}
          company={company}
          onClose={() => setSelectedEmergencyVoucher(null)}
          onNotifyLine={(exp) =>
            sendEmergencyCashLineAlert(exp, company, {
              onOpenVoucherPrint: (target) => setSelectedEmergencyVoucher(target),
            })
          }
        />
      )}

      {/* Multi-Page Scanner Modal (PDF / TIFF / Large Batch Images) */}
      {showScannerModal && (
        <MultiPageScannerModal
          storageFolderPrefix={`expense_receipts/${form.projectId || 'general'}`}
          title="นำเข้าและสแกนเอกสารรายจ่ายจากเครื่องสแกน (PDF / TIFF / หลายหน้า)"
          onComplete={handleMultiPageScanComplete}
          onClose={() => setShowScannerModal(false)}
        />
      )}
    </div>
  );
};
