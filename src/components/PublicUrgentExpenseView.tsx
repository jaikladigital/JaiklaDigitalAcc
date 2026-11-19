import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  RotateCcw,
  ScanLine,
  Sparkles,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { compressImageFileToLimit, db } from '../firebase';
import {
  COMPANY_BILLING_HEADER_TEXT,
  CompanyProfile,
  EmergencyPayerType,
  FIELD_LIMITS,
  UrgentExpenseRequest,
  clampString,
} from '../types/accounting';
import { formatTHB, getTodayISO } from '../utils/formatters';
import {
  ClientLineNotifyResult,
  sendPublicUrgentLineAlert,
} from '../utils/lineClient';
import { FIELD_LABELS_TH, scanReceiptFile } from '../utils/receiptOcrClient';
import { toastError, toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { FriendlyExpenseIconSVG, JaiklaLogoSVG } from './BrandAssets';

interface PublicUrgentExpenseViewProps {
  company: CompanyProfile;
  onBackToLogin: () => void;
}

function buildPublicVoucherNo(): string {
  const datePart = getTodayISO().replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `URG-${datePart}-${rand}`;
}

const SUBMITTER_STORAGE_KEY = 'jkd_urgent_submitter_profile_v1';

interface SavedSubmitterProfile {
  payerType: EmergencyPayerType;
  payerName: string;
  submitterPhone: string;
  submitterLineId: string;
  submitterEmail: string;
}

function loadSavedSubmitterProfile(): SavedSubmitterProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SUBMITTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSubmitterProfile>;
    return {
      payerType: parsed.payerType === 'supplier' ? 'supplier' : 'employee',
      payerName: typeof parsed.payerName === 'string' ? parsed.payerName : '',
      submitterPhone: typeof parsed.submitterPhone === 'string' ? parsed.submitterPhone : '',
      submitterLineId: typeof parsed.submitterLineId === 'string' ? parsed.submitterLineId : '',
      submitterEmail: typeof parsed.submitterEmail === 'string' ? parsed.submitterEmail : '',
    };
  } catch {
    return null;
  }
}

export const PublicUrgentExpenseView: React.FC<PublicUrgentExpenseViewProps> = ({
  company,
  onBackToLogin,
}) => {
  const oaId = (company.lineOaId || '@421khbew').trim() || '@421khbew';

  const [payerType, setPayerType] = useState<EmergencyPayerType>(() => {
    const saved = loadSavedSubmitterProfile();
    return saved?.payerType || 'employee';
  });
  const [payerName, setPayerName] = useState(() => loadSavedSubmitterProfile()?.payerName || '');
  const [submitterLineId, setSubmitterLineId] = useState(
    () => loadSavedSubmitterProfile()?.submitterLineId || ''
  );
  const [submitterEmail, setSubmitterEmail] = useState(
    () => loadSavedSubmitterProfile()?.submitterEmail || ''
  );
  const [submitterPhone, setSubmitterPhone] = useState(
    () => loadSavedSubmitterProfile()?.submitterPhone || ''
  );
  const [hasSavedProfile, setHasSavedProfile] = useState(() =>
    Boolean(loadSavedSubmitterProfile()?.payerName || loadSavedSubmitterProfile()?.submitterPhone)
  );
  const [showLineIdGuide, setShowLineIdGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const paramLine = params.get('lineId') || params.get('lineName');
    const paramName = params.get('name');
    const paramPhone = params.get('phone');
    if (paramLine && !submitterLineId) setSubmitterLineId(paramLine);
    if (paramName && !payerName) setPayerName(paramName);
    if (paramPhone && !submitterPhone) setSubmitterPhone(paramPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [projectName, setProjectName] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorTaxId, setVendorTaxId] = useState('');
  const [description, setDescription] = useState('');
  const [urgencyReason, setUrgencyReason] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [amount, setAmount] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(0);
  const [whtRate, setWhtRate] = useState<number>(0);

  const [receiptUrl, setReceiptUrl] = useState('');
  const [extraPhotoUrl, setExtraPhotoUrl] = useState('');
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'scanning' | 'success' | 'partial' | 'error'>('idle');
  const [ocrNote, setOcrNote] = useState('');
  const [ocrMissing, setOcrMissing] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    request: UrgentExpenseRequest;
    lineResult: ClientLineNotifyResult | null;
  } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const vatAmount = Number(((amount * vatRate) / 100).toFixed(2));
  const whtAmount = Number(((amount * whtRate) / 100).toFixed(2));
  const netPaid = Number((amount + vatAmount - whtAmount).toFixed(2));

  const handleImagePick = async (
    target: 'receipt' | 'extra',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (target === 'receipt') {
        setOcrStatus('scanning');
        setOcrNote('กำลังอ่านข้อความและยอดเงินจากรูปใบเสร็จด้วย AI...');
        const [compressed, ocrRes] = await Promise.all([
          compressImageFileToLimit(file, 52000),
          scanReceiptFile(file),
        ]);
        setReceiptUrl(compressed);

        if (!ocrRes.ok || !ocrRes.data) {
          setOcrStatus('error');
          setOcrNote(
            ocrRes.error || 'ไม่สามารถอ่านข้อมูลจากรูปใบเสร็จได้ กรุณาพิมพ์รายละเอียดและยอดเงินด้วยตนเอง'
          );
          setOcrMissing(['vendorName', 'description', 'amount']);
        } else {
          const d = ocrRes.data;
          const missing = new Set<string>(d.unreadableFields || []);
          if (!d.vendorName) missing.add('vendorName');
          if (!d.description) missing.add('description');
          if (d.totalAmount <= 0 && d.subtotal <= 0) missing.add('amount');

          const extractedAmt =
            d.subtotal > 0
              ? d.subtotal
              : d.totalAmount > 0
                ? Number((d.totalAmount - d.vatAmount).toFixed(2))
                : 0;

          if (d.vendorName && !vendorName) setVendorName(d.vendorName);
          if (d.vendorTaxId && !vendorTaxId) setVendorTaxId(d.vendorTaxId);
          if (d.receiptDate) setPaymentDate(d.receiptDate);
          if (d.description && !description) setDescription(d.description);
          if (extractedAmt > 0 && amount <= 0) setAmount(extractedAmt);
          if (d.vatRate > 0) setVatRate(d.vatRate);
          if (d.whtRate > 0) setWhtRate(d.whtRate);

          const missingArr = Array.from(missing);
          setOcrMissing(missingArr);
          if (!d.readable || missingArr.length > 0) {
            setOcrStatus('partial');
            setOcrNote(
              d.readabilityNote ||
                'อ่านข้อมูลได้บางส่วน กรุณาตรวจสอบและพิมพ์ข้อมูลเพิ่มเติมให้ครบถ้วน'
            );
          } else {
            setOcrStatus('success');
            setOcrNote(d.readabilityNote || 'ดึงข้อมูลเบื้องต้นจากใบเสร็จเรียบร้อยแล้ว');
          }
        }
        toastSuccess('แนบรูปใบเสร็จแล้ว');
      } else {
        const compressed = await compressImageFileToLimit(file, 52000);
        setExtraPhotoUrl(compressed);
        toastSuccess('แนบรูปหน้างานเรียบร้อยแล้ว');
      }
    } catch (err) {
      toastError(
        'ไม่สามารถประมวลผลรูปภาพได้',
        err instanceof Error ? err.message : 'กรุณาลองเลือกไฟล์ใหม่อีกครั้ง'
      );
    } finally {
      e.target.value = '';
    }
  };

  const resetForm = () => {
    setSubmittedReceipt(null);
    setProjectName('');
    setVendorName('');
    setVendorTaxId('');
    setDescription('');
    setUrgencyReason('');
    setPaymentDate(getTodayISO());
    setAmount(0);
    setVatRate(0);
    setWhtRate(0);
    setReceiptUrl('');
    setExtraPhotoUrl('');
    setOcrStatus('idle');
    setOcrNote('');
    setOcrMissing([]);
    setCopiedMsg(false);
  };

  const clearSavedProfile = () => {
    try {
      window.localStorage.removeItem(SUBMITTER_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setPayerName('');
    setSubmitterPhone('');
    setSubmitterLineId('');
    setSubmitterEmail('');
    setHasSavedProfile(false);
    toastSuccess('ล้างข้อมูลผู้ส่งที่จำไว้ในเครื่องนี้แล้ว');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = clampString(payerName, FIELD_LIMITS.companyName);
    const cleanLine = clampString(submitterLineId, 100);
    const cleanEmail = clampString(submitterEmail, 150);
    const cleanPhone = clampString(submitterPhone, 60);
    const cleanProject = clampString(projectName || 'งานด่วนหน้างาน', FIELD_LIMITS.eventName);
    const cleanDesc = clampString(description, FIELD_LIMITS.description);

    if (!cleanName || !cleanDesc) {
      toastError('กรุณากรอกชื่อผู้ส่งเรื่องและรายละเอียดค่าใช้จ่าย');
      return;
    }

    if (cleanPhone.length < 6 && !cleanLine && cleanEmail.length < 3) {
      toastError(
        'กรุณากรอกเบอร์โทรศัพท์ติดต่อกลับ (หรือช่องทางติดต่ออย่างน้อย 1 ช่องทาง)',
        'แนะนำให้กรอกเบอร์โทรศัพท์เพื่อใช้โทรกลับหรือค้นหา LINE ได้ทันที'
      );
      return;
    }

    if (amount <= 0) {
      toastError('กรุณาระบุยอดเงินค่าใช้จ่ายมากกว่า 0 บาท');
      return;
    }

    setSubmitting(true);
    const requestId = `urg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const voucherNo = buildPublicVoucherNo();

    const docPayload = {
      voucherNo,
      payerType,
      payerName: cleanName,
      submitterLineId: cleanLine,
      submitterEmail: cleanEmail,
      submitterPhone: cleanPhone,
      projectName: cleanProject,
      vendorName: clampString(vendorName, FIELD_LIMITS.companyName),
      vendorTaxId: clampString(vendorTaxId, FIELD_LIMITS.taxId),
      description: cleanDesc,
      urgencyReason: clampString(urgencyReason, 500),
      amount: Number(amount) || 0,
      vatRate: Number(vatRate) || 0,
      vatAmount,
      whtRate: Number(whtRate) || 0,
      whtAmount,
      netPaid,
      paymentDate,
      receiptUrl: receiptUrl.slice(0, 59500),
      extraPhotoUrl: extraPhotoUrl.slice(0, 59500),
      status: 'pending_review' as const,
      lineNotifiedAt: new Date().toISOString(),
      lineNotifyChannel: 'pending',
    };

    try {
      await setDoc(doc(db, 'urgent_requests', requestId), {
        ...docPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const savedRequest: UrgentExpenseRequest = {
        id: requestId,
        ...docPayload,
      };

      try {
        window.localStorage.setItem(
          SUBMITTER_STORAGE_KEY,
          JSON.stringify({
            payerType,
            payerName: cleanName,
            submitterPhone: cleanPhone,
            submitterLineId: cleanLine,
            submitterEmail: cleanEmail,
          })
        );
        setHasSavedProfile(true);
      } catch {
        // ignore storage errors
      }

      const lineResult = await sendPublicUrgentLineAlert(savedRequest, company);

      setSubmittedReceipt({
        request: savedRequest,
        lineResult,
      });
      toastSuccess(
        `ส่งคำขอเบิกด่วน ${voucherNo} สำเร็จ`,
        lineResult?.sentViaApi
          ? `แจ้งเตือนไปยัง LINE ${oaId} อัตโนมัติแล้ว`
          : `บันทึกคำขอแล้ว — กดปุ่มส่งเข้าแชท LINE ${oaId} ด้านล่างได้เลย`
      );
    } catch (err) {
      toastError(
        'บันทึกคำขอไม่สำเร็จ',
        err instanceof Error ? err.message : 'กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedReceipt) {
    const { request, lineResult } = submittedReceipt;
    return (
      <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 flex items-center justify-center">
        <div className="max-w-xl w-full figma-card p-6 sm:p-8 space-y-5 animate-figma-in">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 m-0 thai-heading">
              บันทึกคำขอค่าใช้จ่ายฉุกเฉินเรียบร้อยแล้ว
            </h1>
            <div className="text-sm font-mono-num font-bold text-rose-700">
              เลขที่อ้างอิง: {request.voucherNo} · ยอดสุทธิ ฿{formatTHB(request.netPaid)}
            </div>
            <p className="text-xs sm:text-sm text-slate-600 m-0">
              ข้อมูลถูกส่งเข้าระบบบัญชีบริษัทและเตรียมข้อความแจ้งเตือนไปยัง{' '}
              <strong className="font-mono-num">{oaId}</strong> เรียบร้อย
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs sm:text-sm">
            <div className="font-bold text-slate-900">ช่องทางติดต่อกลับผู้ส่งเรื่อง</div>
            <div>
              <strong>ผู้ส่งเรื่อง:</strong> {request.payerName} (
              {request.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน'})
            </div>
            {request.submitterLineId && (
              <div className="font-mono-num">
                <strong>LINE ID:</strong> {request.submitterLineId}
              </div>
            )}
            {request.submitterPhone && (
              <div className="font-mono-num">
                <strong>เบอร์โทร:</strong> {request.submitterPhone}
              </div>
            )}
            {request.submitterEmail && (
              <div>
                <strong>อีเมล:</strong> {request.submitterEmail}
              </div>
            )}
          </div>

          {lineResult && (
            <div className="space-y-3">
              {lineResult.sentViaApi ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm space-y-1">
                  <div className="font-semibold">
                    ✓ ระบบได้ส่งแจ้งเตือนอัตโนมัติเข้าสู่ LINE OA {lineResult.oaId} เรียบร้อยแล้ว
                  </div>
                  <div className="text-xs text-emerald-800 leading-relaxed">
                    หากไม่ได้กรอก LINE ID ไว้ สามารถกดปุ่มสีเขียวด้านล่างเพื่อทักเข้าห้องแชท{' '}
                    <strong className="font-mono-num">{lineResult.oaId}</strong> เพื่อให้ฝ่ายบัญชีเห็นโปรไฟล์ LINE และตอบกลับได้ทันที
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                  <strong>ขั้นตอนแนะนำ (เปิดแชท LINE):</strong> กดปุ่มสีเขียวด้านล่างเพื่อส่งเลขคำขอ{' '}
                  <strong className="font-mono-num">{request.voucherNo}</strong> เข้าห้องแชท{' '}
                  <strong className="font-mono-num">{lineResult.oaId}</strong> ทันที
                  — ฝ่ายบัญชีจะเห็นโปรไฟล์ LINE ของคุณในแชทโดยไม่ต้องค้นหา LINE ID
                </div>
              )}

              <pre className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto m-0">
                {lineResult.formattedMessage}
              </pre>

              <div className="flex flex-wrap gap-2">
                <a
                  href={lineResult.oaDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="figma-btn flex-1 min-w-[220px] py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 text-decoration-none"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  ส่งคำขอเข้าแชท LINE OA {lineResult.oaId}
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lineResult.formattedMessage);
                      setCopiedMsg(true);
                      toastSuccess('คัดลอกข้อความแจ้งเตือนแล้ว');
                    } catch {
                      toastError('คัดลอกไม่สำเร็จ');
                    }
                  }}
                  className="figma-btn py-2.5 px-4 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm inline-flex items-center gap-1.5"
                >
                  <Copy className="w-4 h-4" />
                  {copiedMsg ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                </button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-2 justify-between">
            <button
              type="button"
              onClick={resetForm}
              className="figma-btn py-2 px-4 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              ส่งรายการเบิกด่วนเพิ่ม
            </button>
            <button
              type="button"
              onClick={onBackToLogin}
              className="figma-btn py-2 px-4 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              กลับหน้าเข้าสู่ระบบ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-5 px-3 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-5 animate-figma-in">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <JaiklaLogoSVG className="w-10 h-10 shrink-0" logoUrl={company.logoUrl} />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">
                {company.companyNameTh}
              </div>
              <div className="text-xs text-teal-700 font-medium">
                แจ้งเบิกค่าใช้จ่ายโครงการ · ไม่ต้องเข้าสู่ระบบ
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToLogin}
            className="figma-btn inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับหน้าเข้าสู่ระบบ
          </button>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="figma-card p-5 sm:p-7 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center gap-2 text-xs font-bold text-teal-800">
              <FriendlyExpenseIconSVG className="w-5 h-5" />
              <span>ส่งบิลค่าใช้จ่ายโครงการหน้างาน · แจ้งเตือนทีมบัญชี LINE OA {oaId}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 m-0 thai-heading">
              {formatThaiLineBreaks('แจ้งเบิกค่าใช้จ่ายโครงการ (ไม่ต้องเข้าสู่ระบบ)')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 m-0">
              กรอกเบอร์โทรศัพท์ติดต่อกลับและแนบรูปบิล ระบบจะแจ้งเตือนไปยัง{' '}
              <strong className="font-mono-num text-teal-700">{oaId}</strong> และส่งเข้ารอตรวจสอบทันที
            </p>
          </div>

          {/* Quick Copy Company Billing Header */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs text-slate-700 leading-relaxed">
              <div className="font-bold text-slate-900">ข้อมูลหัวบิลสำหรับแจ้งร้านค้าออกใบกำกับภาษี (กรณีเร่งด่วน)</div>
              <div className="select-all mt-0.5">{COMPANY_BILLING_HEADER_TEXT}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(COMPANY_BILLING_HEADER_TEXT);
                  toastSuccess('คัดลอกข้อมูลหัวบิลบริษัทเรียบร้อย');
                } catch {
                  toastError('ไม่สามารถคัดลอกได้');
                }
              }}
              className="figma-btn shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              คัดลอกข้อมูลหัวบิล
            </button>
          </div>

          {/* Step 1: Upload Receipt / OCR */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-900">
                <Sparkles className="w-4 h-4 text-blue-700" />
                1. ถ่ายรูปหรืออัปโหลดใบเสร็จ (AI ดึงยอดเงินให้อัตโนมัติ)
              </div>
              {ocrStatus === 'scanning' && (
                <span className="text-xs font-semibold text-blue-700 inline-flex items-center gap-1">
                  <ScanLine className="w-3.5 h-3.5 animate-spin" />
                  กำลังอ่านใบเสร็จ...
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-700 mb-2">รูปใบเสร็จ / บิลเงินสด</div>
                {receiptUrl ? (
                  <div className="space-y-2">
                    <img
                      src={receiptUrl}
                      alt="ตัวอย่างใบเสร็จ"
                      className="w-full h-32 object-contain rounded bg-slate-50 border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptUrl('');
                        setOcrStatus('idle');
                        setOcrNote('');
                        setOcrMissing([]);
                      }}
                      className="btn btn-sm btn-outline-danger w-full"
                    >
                      ลบรูปใบเสร็จนี้
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="btn btn-sm btn-primary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]">
                      <Camera className="w-3.5 h-3.5" />
                      ถ่ายรูป
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleImagePick('receipt', e)}
                      />
                    </label>
                    <label className="btn btn-sm btn-outline-secondary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]">
                      <Upload className="w-3.5 h-3.5" />
                      เลือกรูป
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImagePick('receipt', e)}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <div className="text-xs font-bold text-slate-700 mb-2">รูปหน้างาน / สินค้า (ถ้ามี)</div>
                {extraPhotoUrl ? (
                  <div className="space-y-2">
                    <img
                      src={extraPhotoUrl}
                      alt="ตัวอย่างภาพหน้างาน"
                      className="w-full h-32 object-contain rounded bg-slate-50 border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => setExtraPhotoUrl('')}
                      className="btn btn-sm btn-outline-danger w-full"
                    >
                      ลบรูปหน้างานนี้
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="btn btn-sm btn-outline-primary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]">
                      <Camera className="w-3.5 h-3.5" />
                      ถ่ายหน้างาน
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleImagePick('extra', e)}
                      />
                    </label>
                    <label className="btn btn-sm btn-outline-secondary flex-1 inline-flex items-center justify-center gap-1 cursor-pointer min-h-[40px]">
                      <Upload className="w-3.5 h-3.5" />
                      เลือกรูป
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImagePick('extra', e)}
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {ocrStatus !== 'idle' && (
              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  ocrStatus === 'scanning'
                    ? 'bg-white border-blue-200 text-blue-800'
                    : ocrStatus === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}
              >
                <div className="font-bold">
                  {ocrStatus === 'scanning' && 'กำลังวิเคราะห์รูปใบเสร็จ...'}
                  {ocrStatus === 'success' && 'อ่านข้อมูลจากใบเสร็จสำเร็จ ✓'}
                  {(ocrStatus === 'partial' || ocrStatus === 'error') &&
                    'กรุณาตรวจสอบหรือพิมพ์ข้อมูลเพิ่มเติมด้านล่าง'}
                </div>
                {ocrNote && <div className="mt-0.5">{ocrNote}</div>}
                {ocrMissing.length > 0 && (
                  <div className="mt-0.5 font-semibold">
                    ช่องที่แนะนำให้กรอกเพิ่ม:{' '}
                    {ocrMissing.map((f) => FIELD_LABELS_TH[f] || f).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Submitter Identity & Callback Contacts */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  2. ข้อมูลผู้ส่งเรื่อง และช่องทางติดต่อกลับ (เน้นเบอร์โทรศัพท์เป็นหลัก)
                </div>
                <div className="text-xs text-slate-500">
                  กรอกเบอร์โทรศัพท์เพื่อใช้ติดต่อกลับหรือค้นหา LINE ได้ทันที · ไม่จำเป็นต้องจำ LINE ID
                </div>
              </div>
              {hasSavedProfile && (
                <button
                  type="button"
                  onClick={clearSavedProfile}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-600"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  ล้างข้อมูลที่จำไว้
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPayerType('employee')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${
                  payerType === 'employee'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <div>
                  <div className="text-sm font-bold leading-tight">พนักงานบริษัท</div>
                  <div className={`text-[11px] ${payerType === 'employee' ? 'text-slate-300' : 'text-slate-500'}`}>
                    ทีมงานสำรองจ่ายหน้างาน
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPayerType('supplier')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-colors ${
                  payerType === 'supplier'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <div>
                  <div className="text-sm font-bold leading-tight">ซัพพลายเยอร์</div>
                  <div className={`text-[11px] ${payerType === 'supplier' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Vendor / ผู้รับเหมา
                  </div>
                </div>
              </button>
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">
                  {payerType === 'supplier' ? 'ชื่อซัพพลายเยอร์ / บริษัท *' : 'ชื่อ-นามสกุล พนักงานผู้ส่งเรื่อง *'}
                </label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={payerName}
                  onChange={(e) => setPayerName(e.target.value)}
                  placeholder="เช่น นายสมชาย ใจกล้า / บจก. เอวี"
                />
              </div>

              <div className="col-md-6">
                <label className="form-label flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-blue-700" />
                  เบอร์โทรศัพท์ติดต่อกลับ (หลัก) *
                </label>
                <input
                  type="tel"
                  className="form-control font-mono-num"
                  value={submitterPhone}
                  onChange={(e) => setSubmitterPhone(e.target.value)}
                  placeholder="เช่น 08x-xxx-xxxx (ใช้โทรกลับ/ค้นหา LINE ได้)"
                />
              </div>

              <div className="col-md-6">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="form-label m-0 flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                    LINE ID หรือ ชื่อที่ใช้ใน LINE (ไม่บังคับ)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLineIdGuide((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 bg-transparent border-0 p-0 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    {showLineIdGuide ? 'ซ่อนวิธีหา' : 'ดูวิธีหา LINE ID'}
                  </button>
                </div>
                <input
                  type="text"
                  className="form-control font-mono-num"
                  value={submitterLineId}
                  onChange={(e) => setSubmitterLineId(e.target.value)}
                  placeholder="เช่น somchai.jk หรือ ชื่อโปรไฟล์ LINE (ข้ามได้)"
                />
                {showLineIdGuide && (
                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950 space-y-1 leading-relaxed">
                    <div className="font-bold">วิธีดู LINE ID ใน 10 วินาที:</div>
                    <div>
                      เปิดแอป LINE &gt; แตะแท็บ <strong>หน้าหลัก (รูปบ้าน)</strong> &gt; แตะรูป{' '}
                      <strong>เฟืองตั้งค่า</strong> มุมขวาบน &gt; เลือก <strong>โปรไฟล์</strong> &gt; ดูช่อง <strong>ID</strong>
                    </div>
                    <div className="text-emerald-800">
                      * หากขึ้นว่า "ไม่ได้ตั้งค่า" ให้เว้นว่างช่องนี้ได้เลย แล้วกรอกเบอร์โทรด้านบนหรือกดส่งข้อความเข้า LINE OA {oaId} หลังบันทึกแทน
                    </div>
                  </div>
                )}
              </div>

              <div className="col-md-6">
                <label className="form-label flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-600" />
                  อีเมลผู้ส่งเรื่อง (ไม่บังคับ)
                </label>
                <input
                  type="email"
                  className="form-control"
                  value={submitterEmail}
                  onChange={(e) => setSubmitterEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
            </div>
          </div>

          {/* Step 3: Expense Details */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="text-sm font-bold text-slate-900">
              3. รายละเอียดงานและยอดค่าใช้จ่ายฉุกเฉิน
            </div>

            <div className="row g-3">
              <div className="col-md-7">
                <label className="form-label">ชื่องาน / โปรเจกต์ / Event *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="เช่น งานอีเวนต์เปิดตัวสินค้า / ถ่ายทำโฆษณา"
                />
              </div>
              <div className="col-md-5">
                <label className="form-label">วันที่จ่ายเงินสด *</label>
                <input
                  type="date"
                  className="form-control font-mono-num"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div className="col-md-7">
                <label className="form-label">ร้านค้า / ผู้รับเงินปลายทาง</label>
                <input
                  type="text"
                  className="form-control"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder="เช่น ร้านอุปกรณ์ไฟฟ้า / ปั๊มน้ำมัน / ค่าวิน"
                />
              </div>
              <div className="col-md-5">
                <label className="form-label">เลขผู้เสียภาษีร้านค้า (ถ้ามี)</label>
                <input
                  type="text"
                  className="form-control font-mono-num"
                  value={vendorTaxId}
                  onChange={(e) => setVendorTaxId(e.target.value)}
                  placeholder="13 หลัก"
                />
              </div>

              <div className="col-12">
                <label className="form-label">รายละเอียดค่าใช้จ่าย *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="เช่น ซื้อปลั๊กพ่วง สายสัญญาณ HDMI ค่าเดินทางเร่งด่วน"
                />
              </div>

              <div className="col-12">
                <label className="form-label">เหตุผลความจำเป็นเร่งด่วน</label>
                <input
                  type="text"
                  className="form-control"
                  value={urgencyReason}
                  onChange={(e) => setUrgencyReason(e.target.value)}
                  placeholder="เช่น อุปกรณ์หน้างานเสียก่อนเริ่มถ่ายทำ ต้องซื้อทดแทนทันที"
                />
              </div>

              <div className="col-md-4">
                <label className="form-label">จำนวนเงิน (ก่อน VAT) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className="form-control font-mono-num fw-bold"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">VAT (%)</label>
                <select
                  className="form-select font-mono-num"
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                >
                  <option value={0}>0% (ไม่มี VAT)</option>
                  <option value={7}>7% (ภาษีมูลค่าเพิ่ม)</option>
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">หัก ณ ที่จ่าย (%)</label>
                <select
                  className="form-select font-mono-num"
                  value={whtRate}
                  onChange={(e) => setWhtRate(Number(e.target.value))}
                >
                  <option value={0}>0% (ไม่หัก)</option>
                  <option value={1}>1% (ขนส่ง)</option>
                  <option value={2}>2% (โฆษณา)</option>
                  <option value={3}>3% (บริการ / จ้างทำของ)</option>
                  <option value={5}>5% (เช่าทรัพย์สิน / นักแสดง)</option>
                </select>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-2 text-xs sm:text-sm font-mono-num">
              <span>VAT ฿{formatTHB(vatAmount)} · หัก ณ ที่จ่าย -฿{formatTHB(whtAmount)}</span>
              <strong className="text-rose-700 text-base">
                ยอดเบิกคืนสุทธิ: ฿{formatTHB(netPaid)}
              </strong>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={onBackToLogin}
              className="figma-btn px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="figma-btn px-6 py-2.5 rounded-xl bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800 inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {submitting ? 'กำลังส่งข้อมูล & แจ้งเตือน LINE...' : `ส่งคำขอและแจ้งเตือน LINE ${oaId}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
