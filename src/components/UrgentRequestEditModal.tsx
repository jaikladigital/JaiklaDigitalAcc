import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowRightCircle,
  Calculator,
  CheckCircle2,
  FileCheck2,
  Image as ImageIcon,
  Mail,
  MessageCircle,
  Phone,
  RotateCcw,
  Save,
  UserCheck,
  Users,
  X,
  ZoomIn,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  clampString,
  EmergencyPayerType,
  FIELD_LIMITS,
  Project,
  Supplier,
  UrgentExpenseRequest,
  UrgentRequestStatus,
} from '../types/accounting';
import {
  calculateExpenseAmounts,
  formatTHB,
  getTodayISO,
  sanitizeDecimalInput,
} from '../utils/formatters';
import { toastError, toastSuccess } from '../utils/swal';
import { ThaiDatePickerField } from './ThaiDatePickerField';

interface UrgentRequestEditModalProps {
  request: UrgentExpenseRequest;
  projects: Project[];
  suppliers: Supplier[];
  onClose: () => void;
  onEnlargePhoto?: (url: string) => void;
  onSaved?: (updated: UrgentExpenseRequest) => void;
  onSavedAndProceedImport?: (updated: UrgentExpenseRequest) => void;
}

const STATUS_LABELS: Record<UrgentRequestStatus, { label: string; cls: string }> = {
  pending_review: {
    label: 'รอตรวจสอบ',
    cls: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  approved: {
    label: 'อนุมัติแล้ว',
    cls: 'bg-blue-100 text-blue-900 border-blue-300',
  },
  imported: {
    label: 'นำเข้าบัญชีแล้ว',
    cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  rejected: {
    label: 'ปฏิเสธแล้ว',
    cls: 'bg-slate-200 text-slate-700 border-slate-300',
  },
};

export const UrgentRequestEditModal: React.FC<UrgentRequestEditModalProps> = ({
  request,
  projects,
  suppliers,
  onClose,
  onEnlargePhoto,
  onSaved,
  onSavedAndProceedImport,
}) => {
  const [payerType, setPayerType] = useState<EmergencyPayerType>(request.payerType || 'employee');
  const [payerName, setPayerName] = useState(request.payerName || '');
  const [submitterPhone, setSubmitterPhone] = useState(request.submitterPhone || '');
  const [submitterLineId, setSubmitterLineId] = useState(request.submitterLineId || '');
  const [submitterEmail, setSubmitterEmail] = useState(request.submitterEmail || '');

  const [projectName, setProjectName] = useState(request.projectName || '');
  const [paymentDate, setPaymentDate] = useState(request.paymentDate || getTodayISO());
  const [vendorName, setVendorName] = useState(request.vendorName || '');
  const [vendorTaxId, setVendorTaxId] = useState(request.vendorTaxId || '');
  const [description, setDescription] = useState(request.description || '');
  const [urgencyReason, setUrgencyReason] = useState(request.urgencyReason || '');
  const [reviewNotes, setReviewNotes] = useState(request.reviewNotes || '');
  const [status, setStatus] = useState<UrgentRequestStatus>(request.status || 'pending_review');

  // Preserve original figures cleanly by defaulting to 'before_vat' with request.amount,
  // while letting admin switch to 'gross_total' to recalculate from receipt grand total.
  const [amountMode, setAmountMode] = useState<'before_vat' | 'gross_total'>('before_vat');
  const [amountInput, setAmountInput] = useState<string>(
    Number(request.amount) > 0 ? String(Number(request.amount)) : ''
  );
  const [rawAmountValue, setRawAmountValue] = useState<number>(Math.max(0, Number(request.amount) || 0));
  const [vatRate, setVatRate] = useState<number>(Math.min(30, Math.max(0, Number(request.vatRate) || 0)));
  const [whtRate, setWhtRate] = useState<number>(Math.min(30, Math.max(0, Number(request.whtRate) || 0)));
  const [grossIncludesWhtDeduction, setGrossIncludesWhtDeduction] = useState<boolean>(false);

  const [activePhotoTab, setActivePhotoTab] = useState<'receipt' | 'extra'>(
    request.receiptUrl ? 'receipt' : 'extra'
  );
  const [saving, setSaving] = useState(false);

  const calculated = useMemo(
    () =>
      calculateExpenseAmounts({
        mode: amountMode,
        inputAmount: rawAmountValue,
        vatRate,
        whtRate,
        grossIncludesWhtDeduction,
      }),
    [amountMode, rawAmountValue, vatRate, whtRate, grossIncludesWhtDeduction]
  );

  const handleSwitchAmountMode = (nextMode: 'before_vat' | 'gross_total') => {
    if (nextMode === amountMode) return;
    if (nextMode === 'gross_total') {
      // Seed total receipt figure from current base + vat so switching doesn't zero out
      const currentGross = Number((calculated.amountBeforeVat + calculated.vatAmount).toFixed(2));
      setAmountMode('gross_total');
      setRawAmountValue(currentGross);
      setAmountInput(currentGross > 0 ? String(currentGross) : '');
    } else {
      const currentBase = calculated.amountBeforeVat;
      setAmountMode('before_vat');
      setRawAmountValue(currentBase);
      setAmountInput(currentBase > 0 ? String(currentBase) : '');
    }
  };

  const handlePickSupplier = (supplierId: string) => {
    const sup = suppliers.find((s) => s.id === supplierId);
    if (!sup) return;
    setVendorName(sup.name);
    if (sup.taxId) {
      setVendorTaxId(sup.taxId);
    }
  };

  const persistEdits = async (andProceedImport: boolean) => {
    const cleanPayerName = clampString(payerName, FIELD_LIMITS.companyName);
    const cleanPhone = clampString(submitterPhone, FIELD_LIMITS.phone);
    const cleanLineId = clampString(submitterLineId, 100);
    const cleanEmail = clampString(submitterEmail, FIELD_LIMITS.email);
    const cleanProjectName = clampString(projectName, FIELD_LIMITS.eventName);
    const cleanVendorName = clampString(vendorName, FIELD_LIMITS.companyName);
    const cleanVendorTaxId = clampString(vendorTaxId, FIELD_LIMITS.taxId);
    const cleanDescription = clampString(description, FIELD_LIMITS.description);
    const cleanUrgencyReason = clampString(urgencyReason, 500);
    const cleanReviewNotes = clampString(reviewNotes, 500);
    const cleanPaymentDate = clampString(paymentDate, 30);

    if (!cleanPayerName) {
      toastError('กรุณากรอกชื่อผู้ส่งเรื่อง / ผู้สำรองจ่าย');
      return;
    }

    const hasValidContact =
      cleanLineId.length >= 1 || cleanEmail.length >= 3 || cleanPhone.length >= 6;
    if (!hasValidContact) {
      toastError(
        'กรุณาระบุช่องทางติดต่อกลับอย่างน้อย 1 ช่องทาง',
        'เบอร์โทรอย่างน้อย 6 หลัก, LINE ID อย่างน้อย 1 ตัวอักษร หรืออีเมลอย่างน้อย 3 ตัวอักษร'
      );
      return;
    }

    if (!cleanProjectName) {
      toastError('กรุณากรอกชื่องาน / โปรเจกต์ / Event');
      return;
    }

    if (!cleanDescription) {
      toastError('กรุณากรอกรายละเอียดค่าใช้จ่าย');
      return;
    }

    if (cleanPaymentDate.length < 8) {
      toastError('วันที่จ่ายเงินสดไม่ถูกต้อง กรุณาเลือก ว/ด/ป ใหม่');
      return;
    }

    if (
      !Number.isFinite(calculated.amountBeforeVat) ||
      calculated.amountBeforeVat <= 0 ||
      calculated.amountBeforeVat > 50000000 ||
      !Number.isFinite(calculated.netPaid) ||
      calculated.netPaid < 0 ||
      calculated.netPaid > 50000000
    ) {
      toastError('กรุณาระบุจำนวนเงินให้ถูกต้อง (มากกว่า 0 และไม่เกิน 50,000,000 บาท)');
      return;
    }

    const safeVatRate = Math.min(30, Math.max(0, Number(vatRate) || 0));
    const safeWhtRate = Math.min(30, Math.max(0, Number(whtRate) || 0));

    const updatePayload = {
      payerType,
      payerName: cleanPayerName,
      submitterPhone: cleanPhone,
      submitterLineId: cleanLineId,
      submitterEmail: cleanEmail,
      projectName: cleanProjectName,
      vendorName: cleanVendorName,
      vendorTaxId: cleanVendorTaxId,
      description: cleanDescription,
      urgencyReason: cleanUrgencyReason,
      reviewNotes: cleanReviewNotes,
      amount: calculated.amountBeforeVat,
      vatRate: safeVatRate,
      vatAmount: calculated.vatAmount,
      whtRate: safeWhtRate,
      whtAmount: calculated.whtAmount,
      netPaid: calculated.netPaid,
      paymentDate: cleanPaymentDate,
      status,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      await updateDoc(doc(db, 'urgent_requests', request.id), updatePayload);

      const updatedRequest: UrgentExpenseRequest = {
        ...request,
        payerType,
        payerName: cleanPayerName,
        submitterPhone: cleanPhone,
        submitterLineId: cleanLineId,
        submitterEmail: cleanEmail,
        projectName: cleanProjectName,
        vendorName: cleanVendorName,
        vendorTaxId: cleanVendorTaxId,
        description: cleanDescription,
        urgencyReason: cleanUrgencyReason,
        reviewNotes: cleanReviewNotes,
        amount: calculated.amountBeforeVat,
        vatRate: safeVatRate,
        vatAmount: calculated.vatAmount,
        whtRate: safeWhtRate,
        whtAmount: calculated.whtAmount,
        netPaid: calculated.netPaid,
        paymentDate: cleanPaymentDate,
        status,
      };

      toastSuccess(`อัปเดตข้อมูลคำขอ ${request.voucherNo} เรียบร้อย`);
      if (andProceedImport && onSavedAndProceedImport) {
        onSavedAndProceedImport(updatedRequest);
      } else if (onSaved) {
        onSaved(updatedRequest);
      }
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `urgent_requests/${request.id}`);
    } finally {
      setSaving(false);
    }
  };

  const hasPhotos = Boolean(request.receiptUrl || request.extraPhotoUrl);
  const currentDisplayedPhoto =
    activePhotoTab === 'receipt'
      ? request.receiptUrl || request.extraPhotoUrl
      : request.extraPhotoUrl || request.receiptUrl;

  const statusMeta = STATUS_LABELS[status];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl shadow-2xl animate-figma-modal overflow-hidden my-auto max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-amber-50/70 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 m-0 thai-heading">
                ตรวจสอบ &amp; แก้ไขข้อมูลคำขอเบิกด่วน
              </h3>
              <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                {request.voucherNo}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${statusMeta.cls}`}>
                {statusMeta.label}
              </span>
            </div>
            <p className="text-xs text-slate-600 m-0 mt-0.5 thai-prose">
              เปรียบเทียบกับรูปหลักฐานและแก้ไขคำผิดจากผู้ส่ง (ชื่องาน, ร้านค้า, ยอดเงิน, วันที่) ก่อนนำเข้าบัญชี
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="btn btn-sm btn-light border shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void persistEdits(false);
          }}
          className="overflow-y-auto p-4 sm:p-6 flex-1"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: Attached Receipt / Site Photos Comparison */}
            <div className="lg:col-span-5 space-y-3">
              <div className="border border-slate-200 rounded-xl bg-slate-50/70 p-3 space-y-2.5 lg:sticky lg:top-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 inline-flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-rose-700" />
                    รูปหลักฐานที่ผู้ส่งแนบมา
                  </span>
                  {request.receiptUrl && request.extraPhotoUrl && (
                    <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setActivePhotoTab('receipt')}
                        className={`px-2 py-1 rounded-md border-0 cursor-pointer transition-colors ${
                          activePhotoTab === 'receipt'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'bg-transparent text-slate-600'
                        }`}
                      >
                        รูปใบเสร็จ
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePhotoTab('extra')}
                        className={`px-2 py-1 rounded-md border-0 cursor-pointer transition-colors ${
                          activePhotoTab === 'extra'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'bg-transparent text-slate-600'
                        }`}
                      >
                        รูปหน้างาน
                      </button>
                    </div>
                  )}
                </div>

                {hasPhotos && currentDisplayedPhoto ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-white">
                      <img
                        src={currentDisplayedPhoto}
                        alt="หลักฐานค่าใช้จ่าย"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[340px] lg:max-h-[420px] object-contain mx-auto bg-slate-50"
                      />
                    </div>
                    {onEnlargePhoto && (
                      <button
                        type="button"
                        onClick={() => onEnlargePhoto(currentDisplayedPhoto)}
                        className="btn btn-sm btn-outline-secondary w-full inline-flex items-center justify-center gap-1.5 text-xs"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        ขยายดูรูปภาพเต็มหน้าจอ
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="py-10 px-4 text-center border border-dashed border-slate-300 rounded-lg bg-white text-xs text-slate-500">
                    ผู้ส่งไม่ได้แนบรูปหลักฐานมากับคำขอนี้
                  </div>
                )}

                {/* Original submitted summary snapshot */}
                <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11.5px] text-slate-600 space-y-1">
                  <div className="font-bold text-slate-800">ยอดเดิมที่ส่งมาจากต้นทาง</div>
                  <div className="flex justify-between font-mono-num">
                    <span>ก่อน VAT:</span>
                    <span>฿{formatTHB(request.amount)}</span>
                  </div>
                  <div className="flex justify-between font-mono-num">
                    <span>VAT ({request.vatRate}%):</span>
                    <span>฿{formatTHB(request.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between font-mono-num">
                    <span>WHT ({request.whtRate}%):</span>
                    <span>-฿{formatTHB(request.whtAmount)}</span>
                  </div>
                  <div className="flex justify-between font-mono-num font-bold text-slate-900 pt-1 border-t border-slate-100">
                    <span>ยอดสุทธิเดิม:</span>
                    <span>฿{formatTHB(request.netPaid)}</span>
                  </div>
                </div>

                {request.status === 'imported' && (
                  <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11.5px] text-blue-900 leading-relaxed flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <span>
                      คำขอนี้ถูกนำเข้าเป็นรายการเบิกจ่ายฉุกเฉินแล้ว การแก้ไขตรงนี้จะปรับข้อมูลอ้างอิงในกล่องคำขอภายนอก (หากต้องการแก้ยอดบัญชีที่นำเข้าแล้ว ให้กดแก้ไขในตารางรายการเบิกจ่ายด้านล่างควบคู่กัน)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Editable Form Fields */}
            <div className="lg:col-span-7 space-y-4">
              {/* Section 1: Submitter & Contact */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  1. ผู้ส่งเรื่องและช่องทางติดต่อกลับ
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayerType('employee')}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                      payerType === 'employee'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold">พนักงานบริษัท</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerType('supplier')}
                    className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-colors cursor-pointer ${
                      payerType === 'supplier'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold">ซัพพลายเยอร์</span>
                  </button>
                </div>

                <div className="row g-2.5">
                  <div className="col-sm-6">
                    <label className="form-label text-xs mb-1">
                      {payerType === 'supplier' ? 'ชื่อซัพพลายเยอร์ / บริษัท *' : 'ชื่อ-นามสกุล ผู้ส่งเรื่อง *'}
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm text-sm"
                      required
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                    />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label text-xs mb-1 inline-flex items-center gap-1">
                      <Phone className="w-3 h-3 text-blue-700" />
                      เบอร์โทรติดต่อกลับ
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-mono-num text-sm"
                      value={submitterPhone}
                      onChange={(e) => setSubmitterPhone(e.target.value)}
                      placeholder="08x-xxx-xxxx"
                    />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label text-xs mb-1 inline-flex items-center gap-1">
                      <MessageCircle className="w-3 h-3 text-emerald-600" />
                      LINE ID
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-mono-num text-sm"
                      value={submitterLineId}
                      onChange={(e) => setSubmitterLineId(e.target.value)}
                    />
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label text-xs mb-1 inline-flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-600" />
                      อีเมล
                    </label>
                    <input
                      type="email"
                      className="form-control form-control-sm text-sm"
                      value={submitterEmail}
                      onChange={(e) => setSubmitterEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Project, Date, Vendor & Description */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  2. ชื่องาน, วันที่, ร้านค้า และรายละเอียดค่าใช้จ่าย
                </div>

                <div className="row g-2.5">
                  <div className="col-12">
                    <label className="form-label text-xs mb-1">ชื่องาน / โปรเจกต์ / Event *</label>
                    <input
                      type="text"
                      className="form-control form-control-sm text-sm"
                      required
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                    />
                    {projects.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {projects.slice(0, 5).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setProjectName(p.eventName)}
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium cursor-pointer transition-colors ${
                              projectName.trim() === p.eventName
                                ? 'bg-teal-700 text-white border-teal-700'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {p.eventName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="col-12">
                    <ThaiDatePickerField
                      label="วันที่จ่ายเงินสด (ว/ด/ป) *"
                      value={paymentDate}
                      onChange={setPaymentDate}
                    />
                  </div>

                  {suppliers.length > 0 && (
                    <div className="col-12">
                      <label className="form-label text-xs mb-1">
                        ดึงชื่อร้านค้า / เลขผู้เสียภาษีจากฐานข้อมูลซัพพลายเยอร์ (ตัวช่วยแก้คำผิด)
                      </label>
                      <select
                        className="form-select form-select-sm text-xs"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handlePickSupplier(e.target.value);
                        }}
                      >
                        <option value="">-- เลือกซัพพลายเยอร์เพื่อเติมชื่อและ Tax ID อัตโนมัติ --</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.taxId ? `(${s.taxId})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="col-md-7">
                    <label className="form-label text-xs mb-1">ร้านค้า / ผู้รับเงินปลายทาง</label>
                    <input
                      type="text"
                      className="form-control form-control-sm text-sm"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="เช่น Elexa / ปั๊มน้ำมัน / ร้านวัสดุก่อสร้าง"
                    />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label text-xs mb-1">เลขผู้เสียภาษีร้านค้า (ถ้ามี)</label>
                    <input
                      type="text"
                      className="form-control form-control-sm font-mono-num text-sm"
                      value={vendorTaxId}
                      onChange={(e) => setVendorTaxId(e.target.value)}
                      placeholder="13 หลัก"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label text-xs mb-1">รายละเอียดค่าใช้จ่าย *</label>
                    <input
                      type="text"
                      className="form-control form-control-sm text-sm"
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label text-xs mb-1">เหตุผลความจำเป็นเร่งด่วน</label>
                    <input
                      type="text"
                      className="form-control form-control-sm text-sm"
                      value={urgencyReason}
                      onChange={(e) => setUrgencyReason(e.target.value)}
                      placeholder="ระบุเหตุผลเพิ่มเติม (ถ้ามี)"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Amount & VAT/WHT Calculator */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-teal-700" />
                    3. ปรับแก้จำนวนเงิน, VAT และหัก ณ ที่จ่าย
                  </div>
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handleSwitchAmountMode('before_vat')}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold border-0 cursor-pointer transition-colors ${
                        amountMode === 'before_vat'
                          ? 'bg-slate-900 text-white'
                          : 'bg-transparent text-slate-700'
                      }`}
                    >
                      แก้ยอดก่อน VAT
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchAmountMode('gross_total')}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold border-0 cursor-pointer transition-colors ${
                        amountMode === 'gross_total'
                          ? 'bg-teal-700 text-white'
                          : 'bg-transparent text-slate-700'
                      }`}
                    >
                      คำนวณจากยอดเต็มบิล
                    </button>
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-sm-6">
                    <label className="form-label text-xs mb-1">
                      {amountMode === 'gross_total'
                        ? 'ยอดราคาเต็มตามบิล (บาท) *'
                        : 'จำนวนเงิน (ก่อน VAT) *'}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      className="form-control form-control-sm font-mono-num fw-bold text-sm"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => {
                        const { text, value } = sanitizeDecimalInput(e.target.value);
                        setAmountInput(text);
                        setRawAmountValue(value);
                      }}
                    />
                  </div>
                  <div className="col-6 col-sm-3">
                    <label className="form-label text-xs mb-1">VAT (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      className="form-control form-control-sm font-mono-num text-sm"
                      value={vatRate}
                      onChange={(e) =>
                        setVatRate(Math.min(30, Math.max(0, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                  <div className="col-6 col-sm-3">
                    <label className="form-label text-xs mb-1">หัก ณ ที่จ่าย (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.5"
                      className="form-control form-control-sm font-mono-num text-sm"
                      value={whtRate}
                      onChange={(e) =>
                        setWhtRate(Math.min(30, Math.max(0, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                </div>

                {amountMode === 'gross_total' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVatRate((prev) => (prev === 7 ? 0 : 7))}
                        className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                          vatRate === 7
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {vatRate === 7 ? '✓ รวม VAT 7%' : '+ รวม VAT 7%'}
                      </button>
                      {[0, 1, 2, 3, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setWhtRate(r)}
                          className={`px-2 py-1 rounded border text-[11px] font-semibold cursor-pointer ${
                            whtRate === r
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          WHT {r}%
                        </button>
                      ))}
                    </div>

                    {whtRate > 0 && (
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          className="form-check-input mt-0"
                          checked={grossIncludesWhtDeduction}
                          onChange={(e) => setGrossIncludesWhtDeduction(e.target.checked)}
                        />
                        <span>ยอดที่กรอกหัก ณ ที่จ่ายออกแล้ว</span>
                      </label>
                    )}
                  </div>
                )}

                <div className="p-2.5 rounded-lg bg-white border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-num">
                  <div>
                    <div className="text-[11px] text-slate-500">ก่อน VAT</div>
                    <div className="font-bold text-slate-900">
                      ฿{formatTHB(calculated.amountBeforeVat)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">VAT ({vatRate}%)</div>
                    <div className="font-bold text-slate-900">+฿{formatTHB(calculated.vatAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">WHT ({whtRate}%)</div>
                    <div className="font-bold text-slate-900">-฿{formatTHB(calculated.whtAmount)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-rose-700 font-semibold">เบิกคืนสุทธิ</div>
                    <div className="font-bold text-rose-700 text-sm">
                      ฿{formatTHB(calculated.netPaid)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 4: Accounting Correction Notes & Status */}
              <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="form-label text-xs font-bold text-blue-950 m-0 inline-flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5 text-blue-700" />
                    หมายเหตุการปรับปรุงข้อมูลโดยฝ่ายบัญชี (reviewNotes)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewNotes((prev) =>
                        prev.trim()
                          ? prev
                          : 'ฝ่ายบัญชีตรวจสอบและปรับแก้ข้อมูลที่พิมพ์ผิดให้ตรงตามหลักฐานบิลแล้ว'
                      )
                    }
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 rounded px-2 py-0.5 cursor-pointer"
                  >
                    + ใส่ข้อความมาตรฐาน
                  </button>
                </div>
                <textarea
                  rows={2}
                  maxLength={500}
                  className="form-control form-control-sm text-xs bg-white"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="บันทึกเหตุผลการปรับแก้ เช่น แก้ตัวสะกดชื่อร้านค้า / ปรับยอดก่อน VAT ให้ตรงกับใบกำกับภาษี"
                />

                {request.status === 'rejected' && (
                  <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      className="form-check-input mt-0"
                      checked={status === 'pending_review'}
                      onChange={(e) =>
                        setStatus(e.target.checked ? 'pending_review' : 'rejected')
                      }
                    />
                    <RotateCcw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      คืนสถานะคำขอนี้กลับเป็น &ldquo;รอตรวจสอบ (pending_review)&rdquo; เพื่อนำเข้าบัญชี
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2 mt-5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-light border text-xs sm:text-sm"
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary px-4 fw-semibold text-xs sm:text-sm inline-flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
            </button>

            {onSavedAndProceedImport && request.status !== 'imported' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void persistEdits(true)}
                className="btn btn-success px-4 fw-semibold text-xs sm:text-sm inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>บันทึก &amp; นำเข้าบัญชีอนุมัติ</span>
                <ArrowRightCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
