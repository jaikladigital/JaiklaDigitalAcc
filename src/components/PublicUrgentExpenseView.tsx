import React, { useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import Swal from 'sweetalert2';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  History,
  Mail,
  MessageCircle,
  Phone,
  QrCode,
  RotateCcw,
  Smartphone,
  Upload,
  UserCheck,
  Users,
  X,
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
import {
  calculateExpenseAmounts,
  formatShortDate,
  formatTHB,
  getDaysInMonth,
  getTodayISO,
  sanitizeDecimalInput,
} from '../utils/formatters';
import {
  ClientLineNotifyResult,
  sendPublicUrgentLineAlert,
} from '../utils/lineClient';
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
const FORM_MEMORY_STORAGE_KEY = 'jkd_urgent_form_memory_v1';

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const DEFAULT_PROJECT_PRESETS = [
  'กิจกรรมสำนักงาน',
  'งานอีเวนต์หน้างาน',
  'งานถ่ายทำ / โปรดักชัน',
];

const DEFAULT_DESCRIPTION_PRESETS = [
  'ค่าชาร์จไฟฟ้ารถยนต์เดินทาง',
  'ค่าน้ำมัน / ค่าทางด่วน',
  'ค่าอาหารและเครื่องดื่มทีมงาน',
  'ค่าอุปกรณ์หน้างาน',
];

interface SavedSubmitterProfile {
  payerType: EmergencyPayerType;
  payerName: string;
  submitterPhone: string;
  submitterLineId: string;
  submitterEmail: string;
}

interface SavedUrgentFormMemory {
  lastProjectName: string;
  lastDescription: string;
  lastVendorName: string;
  recentProjects: string[];
  recentDescriptions: string[];
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

function loadUrgentFormMemory(): SavedUrgentFormMemory {
  const empty: SavedUrgentFormMemory = {
    lastProjectName: '',
    lastDescription: '',
    lastVendorName: '',
    recentProjects: [],
    recentDescriptions: [],
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(FORM_MEMORY_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<SavedUrgentFormMemory>;
    return {
      lastProjectName: typeof parsed.lastProjectName === 'string' ? parsed.lastProjectName : '',
      lastDescription: typeof parsed.lastDescription === 'string' ? parsed.lastDescription : '',
      lastVendorName: typeof parsed.lastVendorName === 'string' ? parsed.lastVendorName : '',
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 6)
        : [],
      recentDescriptions: Array.isArray(parsed.recentDescriptions)
        ? parsed.recentDescriptions.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 6)
        : [],
    };
  } catch {
    return empty;
  }
}

function mergeUniqueStrings(primary: string[], fallback: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...primary, ...fallback]) {
    const clean = item.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
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

  const [formMemory, setFormMemory] = useState<SavedUrgentFormMemory>(() => loadUrgentFormMemory());

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

  const [projectName, setProjectName] = useState(() => loadUrgentFormMemory().lastProjectName);
  const [vendorName, setVendorName] = useState(() => loadUrgentFormMemory().lastVendorName);
  const [vendorTaxId, setVendorTaxId] = useState('');
  const [description, setDescription] = useState(() => loadUrgentFormMemory().lastDescription);
  const [urgencyReason, setUrgencyReason] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayISO());
  const [amountMode, setAmountMode] = useState<'before_vat' | 'gross_total'>('gross_total');
  const [rawAmountValue, setRawAmountValue] = useState<number>(0);
  const [amountInput, setAmountInput] = useState<string>('');
  const [vatRate, setVatRate] = useState<number>(0);
  const [whtRate, setWhtRate] = useState<number>(0);
  const [grossIncludesWhtDeduction, setGrossIncludesWhtDeduction] = useState<boolean>(false);

  const [receiptUrl, setReceiptUrl] = useState('');
  const [extraPhotoUrl, setExtraPhotoUrl] = useState('');
  const [processingTarget, setProcessingTarget] = useState<'receipt' | 'extra' | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submittedReceipt, setSubmittedReceipt] = useState<{
    request: UrgentExpenseRequest;
    lineResult: ClientLineNotifyResult | null;
  } | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [lineLaunchStatus, setLineLaunchStatus] = useState<
    'idle' | 'launching' | 'opened' | 'fallback_qr'
  >('idle');
  const [lineQrDataUrl, setLineQrDataUrl] = useState<string>('');
  const [showQrPanel, setShowQrPanel] = useState<boolean>(false);
  const recheckCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (recheckCleanupRef.current) {
        recheckCleanupRef.current();
        recheckCleanupRef.current = null;
      }
    };
  }, []);

  const taxBreakdown = calculateExpenseAmounts({
    mode: amountMode,
    inputAmount: rawAmountValue,
    vatRate,
    whtRate,
    grossIncludesWhtDeduction,
  });
  const amount = taxBreakdown.amountBeforeVat;
  const vatAmount = taxBreakdown.vatAmount;
  const whtAmount = taxBreakdown.whtAmount;
  const netPaid = taxBreakdown.netPaid;

  const projectSuggestions = mergeUniqueStrings(
    formMemory.recentProjects,
    DEFAULT_PROJECT_PRESETS,
    6
  );
  const descriptionSuggestions = mergeUniqueStrings(
    formMemory.recentDescriptions,
    DEFAULT_DESCRIPTION_PRESETS,
    6
  );

  const parsedDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(paymentDate);
  const selectedYear = parsedDateMatch ? Number(parsedDateMatch[1]) : new Date().getFullYear();
  const selectedMonth = parsedDateMatch ? Number(parsedDateMatch[2]) : new Date().getMonth() + 1;
  const selectedDay = parsedDateMatch ? Number(parsedDateMatch[3]) : new Date().getDate();
  const daysInSelectedMonth = getDaysInMonth(selectedYear, selectedMonth);
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    currentYear - 2,
    currentYear - 1,
    currentYear,
    currentYear + 1,
    currentYear + 2,
  ];

  const updatePaymentDateParts = (nextYear: number, nextMonth: number, nextDay: number) => {
    const maxDay = getDaysInMonth(nextYear, nextMonth);
    const clampedDay = Math.min(Math.max(1, nextDay), maxDay);
    const yyyy = String(nextYear).padStart(4, '0');
    const mm = String(nextMonth).padStart(2, '0');
    const dd = String(clampedDay).padStart(2, '0');
    setPaymentDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleImagePick = async (
    target: 'receipt' | 'extra',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProcessingTarget(target);
    try {
      const compressed = await compressImageFileToLimit(file, 52000);
      if (target === 'receipt') {
        setReceiptUrl(compressed);
        toastSuccess('แนบรูปใบเสร็จเรียบร้อยแล้ว');
      } else {
        setExtraPhotoUrl(compressed);
        toastSuccess('แนบรูปหน้างานเรียบร้อยแล้ว');
      }
    } catch (err) {
      toastError(
        'ไม่สามารถประมวลผลรูปภาพได้',
        err instanceof Error && err.message
          ? err.message
          : 'กรุณาลองเลือกไฟล์ภาพ JPG/PNG หรือถ่ายภาพใหม่อีกครั้ง'
      );
    } finally {
      setProcessingTarget(null);
    }
  };

  const resetForm = () => {
    setSubmittedReceipt(null);
    setProjectName(formMemory.lastProjectName || '');
    setVendorName(formMemory.lastVendorName || '');
    setVendorTaxId('');
    setDescription(formMemory.lastDescription || '');
    setUrgencyReason('');
    setPaymentDate(getTodayISO());
    setRawAmountValue(0);
    setAmountInput('');
    setVatRate(0);
    setWhtRate(0);
    setGrossIncludesWhtDeduction(false);
    setReceiptUrl('');
    setExtraPhotoUrl('');
    setProcessingTarget(null);
    setCopiedMsg(false);
    setLineLaunchStatus('idle');
    setShowQrPanel(false);
    setLineQrDataUrl('');
    if (recheckCleanupRef.current) {
      recheckCleanupRef.current();
      recheckCleanupRef.current = null;
    }
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

        const nextMemory: SavedUrgentFormMemory = {
          lastProjectName: cleanProject,
          lastDescription: cleanDesc,
          lastVendorName: clampString(vendorName, FIELD_LIMITS.companyName),
          recentProjects: mergeUniqueStrings([cleanProject], formMemory.recentProjects, 6),
          recentDescriptions: mergeUniqueStrings([cleanDesc], formMemory.recentDescriptions, 6),
        };
        window.localStorage.setItem(FORM_MEMORY_STORAGE_KEY, JSON.stringify(nextMemory));
        setFormMemory(nextMemory);
      } catch {
        // ignore storage errors
      }

      const lineResult = await sendPublicUrgentLineAlert(savedRequest, company);

      setSubmittedReceipt({
        request: savedRequest,
        lineResult,
      });
      setLineLaunchStatus('idle');
      setShowQrPanel(false);
      setCopiedMsg(false);

      if (lineResult) {
        await promptBeforeAutoLineLaunch(savedRequest, lineResult);
      } else {
        toastSuccess(`บันทึกคำขอเบิกด่วน ${voucherNo} สำเร็จ`);
      }
    } catch (err) {
      toastError(
        'บันทึกคำขอไม่สำเร็จ',
        err instanceof Error ? err.message : 'กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const generateShortLineQr = async (
    savedRequest: UrgentExpenseRequest,
    lineRes: ClientLineNotifyResult
  ) => {
    try {
      const shortPrompt = `แจ้งเบิกด่วน ${savedRequest.voucherNo} (${savedRequest.payerName} ฿${formatTHB(savedRequest.netPaid)})`;
      const shortDeepLink = `https://line.me/R/oaMessage/${encodeURIComponent(
        lineRes.oaId
      )}/?${encodeURIComponent(shortPrompt)}`;
      const qrData = await QRCode.toDataURL(shortDeepLink, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setLineQrDataUrl(qrData);
    } catch {
      setLineQrDataUrl('');
    }
  };

  const startLineVisibilityRecheck = () => {
    if (recheckCleanupRef.current) {
      recheckCleanupRef.current();
      recheckCleanupRef.current = null;
    }

    setLineLaunchStatus('launching');

    let settled = false;
    const finishCheck = (nextStatus: 'opened' | 'fallback_qr') => {
      if (settled) return;
      settled = true;
      if (recheckCleanupRef.current) {
        recheckCleanupRef.current();
        recheckCleanupRef.current = null;
      }
      setLineLaunchStatus(nextStatus);
      if (nextStatus === 'fallback_qr') {
        setShowQrPanel(true);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        finishCheck('opened');
      }
    };
    const onBlur = () => {
      window.setTimeout(() => {
        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          finishCheck('opened');
        }
      }, 250);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        finishCheck('fallback_qr');
      } else {
        finishCheck('opened');
      }
    }, 2600);

    recheckCleanupRef.current = () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  };

  const launchLineChatWithRecheck = (deepLink: string) => {
    startLineVisibilityRecheck();

    // Trigger via an anchor element rather than window.open
    const anchor = document.createElement('a');
    anchor.href = deepLink;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const promptBeforeAutoLineLaunch = async (
    savedRequest: UrgentExpenseRequest,
    lineRes: ClientLineNotifyResult
  ) => {
    void generateShortLineQr(savedRequest, lineRes);

    let autoCopied = false;
    try {
      await navigator.clipboard.writeText(lineRes.formattedMessage);
      autoCopied = true;
      setCopiedMsg(true);
    } catch {
      autoCopied = false;
    }

    if (lineRes.sentViaApi) {
      await Swal.fire({
        icon: 'success',
        title: `ส่งคำขอ ${savedRequest.voucherNo} เข้า LINE ${lineRes.oaId} แล้ว`,
        customClass: { popup: 'jkd-swal-popup' },
        html: `
          <div class="text-left text-xs sm:text-sm text-slate-700 space-y-2 leading-relaxed">
            <div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
              ✓ บันทึกข้อมูลและรูปใบเสร็จเข้าฝ่ายบัญชีแล้ว<br/>
              ✓ ระบบส่งแจ้งเตือนเข้าห้องแชท <strong>LINE OA ${lineRes.oaId}</strong> อัตโนมัติเรียบร้อย
            </div>
            <div class="text-xs text-slate-500">
              หากต้องการส่งหลักฐานเพิ่มเติมหรือพูดคุยกับฝ่ายบัญชี สามารถกดเปิดแชทได้จากหน้าจอถัดไป
            </div>
          </div>
        `,
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#0f766e',
      });
      return;
    }

    let countdownTimer: number | undefined;
    let remaining = 3;
    let shouldAutoLaunch = false;

    const modalResult = await Swal.fire({
      icon: 'success',
      title: `บันทึกคำขอ ${savedRequest.voucherNo} เรียบร้อยแล้ว`,
      customClass: { popup: 'jkd-swal-popup' },
      showCancelButton: true,
      confirmButtonText: `เปิดแอป LINE ส่งเข้า ${lineRes.oaId} ทันที`,
      confirmButtonColor: '#06C755',
      cancelButtonText: 'ไม่มีแอป LINE / ดู QR สำรอง',
      cancelButtonColor: '#475569',
      allowOutsideClick: false,
      html: `
        <div class="text-left text-xs sm:text-sm text-slate-700 space-y-2.5 leading-relaxed">
          <div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs">
            ✓ ข้อมูลคำขอเบิกและรูปใบเสร็จถูกบันทึกเข้าฝ่ายบัญชีแล้ว<br/>
            ${autoCopied ? '✓ คัดลอกข้อความสรุปคำขอไว้ให้ในคลิปบอร์ดแล้ว' : '✓ เตรียมข้อความสำหรับส่งเข้าห้องแชท LINE เรียบร้อย'}
          </div>
          <div class="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-1">
            <div class="font-bold">ขั้นตอนถัดไป: เปิดแชท LINE OA ${lineRes.oaId}</div>
            <div>ระบบกำลังจะเปิดแอป LINE พร้อมข้อความคำขอให้คุณกด <strong>"ส่ง"</strong> ในแชท ${lineRes.oaId}</div>
            <div class="font-semibold text-teal-800 pt-1">
              กำลังเปิดแอป LINE อัตโนมัติใน <span id="jkd-line-countdown">3</span> วินาที...
            </div>
            <div class="text-[11px] text-slate-600">
              * หากอุปกรณ์นี้ไม่ได้ติดตั้งแอป LINE ระบบจะรีเช็คและแสดง QR Code สำหรับสแกนจากมือถืออีกเครื่องให้ทันที
            </div>
          </div>
        </div>
      `,
      didOpen: () => {
        const countEl = document.getElementById('jkd-line-countdown');
        countdownTimer = window.setInterval(() => {
          remaining -= 1;
          if (countEl) {
            countEl.textContent = String(Math.max(0, remaining));
          }
          if (remaining <= 0) {
            if (countdownTimer) {
              window.clearInterval(countdownTimer);
              countdownTimer = undefined;
            }
            shouldAutoLaunch = true;
            Swal.close();
          }
        }, 1000);
      },
      willClose: () => {
        if (countdownTimer) {
          window.clearInterval(countdownTimer);
          countdownTimer = undefined;
        }
      },
    });

    if (modalResult.isConfirmed || shouldAutoLaunch) {
      launchLineChatWithRecheck(lineRes.oaDeepLink);
    } else if (modalResult.dismiss === Swal.DismissReason.cancel) {
      setLineLaunchStatus('fallback_qr');
      setShowQrPanel(true);
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
                    หากต้องการทักคุยหรือส่งหลักฐานเพิ่มเติม สามารถกดปุ่มสีเขียวด้านล่างเพื่อเปิดห้องแชท{' '}
                    <strong className="font-mono-num">{lineResult.oaId}</strong> ได้ทันที
                  </div>
                </div>
              ) : lineLaunchStatus === 'launching' ? (
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm space-y-1">
                  <div className="font-semibold">
                    กำลังเปิดแอป LINE เพื่อส่งเข้าแชท {lineResult.oaId} และตรวจสอบอุปกรณ์...
                  </div>
                  <div className="text-xs text-blue-800">
                    หากแอป LINE ไม่เปิดขึ้นภายใน 3 วินาที ระบบจะแสดง QR Code และทางเลือกสำรองให้อัตโนมัติ
                  </div>
                </div>
              ) : lineLaunchStatus === 'opened' ? (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm space-y-1">
                  <div className="font-semibold">
                    ✓ เปิดแอป LINE สำเร็จแล้ว — อย่าลืมกดปุ่ม &ldquo;ส่ง (Send)&rdquo; ในห้องแชท {lineResult.oaId}
                  </div>
                  <div className="text-xs text-emerald-800">
                    ข้อความสรุปคำขอ <strong className="font-mono-num">{request.voucherNo}</strong> ถูกคัดลอกไว้ให้แล้ว สามารถวางซ้ำในแชทได้ทันทีหากข้อความไม่ขึ้นอัตโนมัติ
                  </div>
                </div>
              ) : lineLaunchStatus === 'fallback_qr' ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs leading-relaxed space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>รีเช็คอุปกรณ์: ยังไม่พบการเปิดแอป LINE อัตโนมัติ</span>
                  </div>
                  <div>
                    อุปกรณ์นี้อาจ <strong>ไม่ได้ติดตั้งแอป LINE</strong> (เช่น คอมพิวเตอร์/แท็บเล็ต) หรือเบราว์เซอร์บล็อกการสลับแอปอัตโนมัติ
                  </div>
                  <div className="text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 font-medium">
                    ✓ ไม่ต้องกังวล: คำขอ <strong>{request.voucherNo}</strong> และรูปใบเสร็จถูกบันทึกเข้าสู่ระบบบัญชีเรียบร้อยแล้ว 100%
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

              {(showQrPanel || lineLaunchStatus === 'fallback_qr') && (
                <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50 space-y-3">
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    {lineQrDataUrl ? (
                      <div className="p-2 bg-white rounded-xl border border-slate-200 shrink-0">
                        <img
                          src={lineQrDataUrl}
                          alt={`QR Code เปิดแชท LINE ${lineResult.oaId}`}
                          className="w-36 h-36 object-contain"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-1.5 text-xs text-slate-700 text-center sm:text-left">
                      <div className="font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                        <Smartphone className="w-4 h-4 text-teal-700 shrink-0" />
                        <span>วิธีส่งต่อเมื่อเครื่องนี้ไม่มีแอป LINE</span>
                      </div>
                      <ol className="m-0 pl-4 space-y-1 text-left">
                        <li>ใช้มือถือที่มีแอป LINE สแกน QR Code นี้เพื่อเปิดแชท <strong>{lineResult.oaId}</strong> พร้อมเลขคำขอ</li>
                        <li>หรือกดปุ่ม <strong>&ldquo;คัดลอกข้อความ&rdquo;</strong> ด้านล่าง แล้วส่งเข้า LINE บนเครื่องอื่น/อีเมล</li>
                        <li>หรือกดปุ่มสีเขียวด้านล่างอีกครั้งเพื่ออนุญาตเปิดแอป LINE บนเครื่องนี้</li>
                      </ol>
                      <div className="pt-1">
                        <a
                          href={lineResult.addFriendLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-teal-700 font-semibold underline"
                        >
                          เปิดหน้าเพิ่มเพื่อน LINE OA {lineResult.oaId}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
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
                  onClick={startLineVisibilityRecheck}
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
                {lineQrDataUrl && lineLaunchStatus !== 'fallback_qr' && (
                  <button
                    type="button"
                    onClick={() => setShowQrPanel((v) => !v)}
                    className="figma-btn py-2.5 px-3.5 rounded-xl border border-teal-300 bg-teal-50 text-teal-900 font-semibold text-sm inline-flex items-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4" />
                    {showQrPanel ? 'ซ่อน QR' : 'QR สแกนเครื่องอื่น'}
                  </button>
                )}
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

          {/* Step 1: Upload Receipt / Evidence */}
          <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900">
                <Camera className="w-4 h-4 text-teal-700 shrink-0" />
                <span>1. ถ่ายรูปหรืออัปโหลดหลักฐานใบเสร็จ</span>
              </div>
              {processingTarget && (
                <span className="text-xs font-semibold text-teal-700">
                  กำลังเตรียมรูปภาพ...
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
                      onClick={() => setReceiptUrl('')}
                      className="btn btn-sm btn-outline-danger w-full"
                    >
                      ลบรูปใบเสร็จนี้
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="btn btn-sm btn-primary flex-1 inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] whitespace-nowrap px-2">
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>ถ่ายรูป</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleImagePick('receipt', e)}
                      />
                    </label>
                    <label className="btn btn-sm btn-outline-secondary flex-1 inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] whitespace-nowrap px-2">
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>เลือกรูป</span>
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
                    <label className="btn btn-sm btn-outline-primary flex-1 inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] whitespace-nowrap px-2">
                      <Camera className="w-3.5 h-3.5 shrink-0" />
                      <span>ถ่ายหน้างาน</span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleImagePick('extra', e)}
                      />
                    </label>
                    <label className="btn btn-sm btn-outline-secondary flex-1 inline-flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] whitespace-nowrap px-2">
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>เลือกรูป</span>
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
          </div>

          {/* Step 2: Submitter Identity & Callback Contacts */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-slate-900">
                  2. ข้อมูลผู้เบิกจ่าย และช่องทางติดต่อกลับ
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  กรอกเบอร์โทรศัพท์เป็นหลักเพื่อให้ทีมบัญชีติดต่อกลับได้รวดเร็ว (LINE ID และอีเมลกรอกเสริมได้)
                </div>
              </div>
              {hasSavedProfile && (
                <button
                  type="button"
                  onClick={clearSavedProfile}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-600 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  ล้างข้อมูลที่จำไว้
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="form-label mb-1.5 flex items-center gap-1.5 min-h-[22px]">
                  <span className="truncate">
                    {payerType === 'supplier' ? 'ชื่อซัพพลายเยอร์ / บริษัท *' : 'ชื่อ-นามสกุล ผู้เบิกจ่าย *'}
                  </span>
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

              <div>
                <label className="form-label mb-1.5 flex items-center gap-1.5 min-h-[22px] whitespace-nowrap">
                  <Phone className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>เบอร์โทรศัพท์ติดต่อกลับ (หลัก) *</span>
                </label>
                <input
                  type="tel"
                  className="form-control font-mono-num"
                  value={submitterPhone}
                  onChange={(e) => setSubmitterPhone(e.target.value)}
                  placeholder="เช่น 08x-xxx-xxxx"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[22px]">
                  <label className="form-label m-0 inline-flex items-center gap-1.5 whitespace-nowrap">
                    <MessageCircle className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                    <span>LINE ID / ชื่อ LINE</span>
                    <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLineIdGuide((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-transparent border-0 p-0 cursor-pointer whitespace-nowrap shrink-0 underline underline-offset-2 decoration-teal-300"
                  >
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{showLineIdGuide ? 'ซ่อนวิธีหา' : 'วิธีดู LINE ID'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  className="form-control font-mono-num"
                  value={submitterLineId}
                  onChange={(e) => setSubmitterLineId(e.target.value)}
                  placeholder="เช่น somchai.jk (ข้ามได้)"
                />
                {showLineIdGuide && (
                  <div className="mt-2 p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-950 space-y-1 leading-relaxed">
                    <div className="font-bold">วิธีดู LINE ID ใน 10 วินาที</div>
                    <div>
                      เปิดแอป LINE &gt; แตะแท็บ <strong>หน้าหลัก</strong> &gt; แตะรูป{' '}
                      <strong>เฟืองตั้งค่า</strong> มุมขวาบน &gt; เลือก <strong>โปรไฟล์</strong> &gt; ดูช่อง <strong>ID</strong>
                    </div>
                    <div className="text-teal-800">
                      หากขึ้นว่า &ldquo;ไม่ได้ตั้งค่า&rdquo; ให้เว้นว่างช่องนี้ได้เลย แล้วใช้เบอร์โทรด้านบนหรือทักแชท LINE OA {oaId} หลังบันทึก
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label mb-1.5 flex items-center gap-1.5 min-h-[22px] whitespace-nowrap">
                  <Mail className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>อีเมลผู้ส่งเรื่อง</span>
                  <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
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
              3. รายละเอียดงานและยอดค่าใช้จ่ายโครงการ
            </div>

            <div className="row g-3">
              <div className="col-md-7">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="form-label m-0">ชื่องาน / โปรเจกต์ / Event *</label>
                  {formMemory.lastProjectName && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-teal-700 font-medium">
                      <History className="w-3 h-3" />
                      จำค่าล่าสุดแล้ว
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    className="form-control pr-9"
                    required
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="เช่น กิจกรรมสำนักงาน / งานอีเวนต์ / ถ่ายทำโฆษณา"
                  />
                  {projectName && (
                    <button
                      type="button"
                      onClick={() => setProjectName('')}
                      aria-label="ล้างชื่องาน"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {projectSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setProjectName(item)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                        projectName.trim() === item
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-md-5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="form-label m-0">วันที่จ่ายเงินสด (ว/ด/ป) *</label>
                  <button
                    type="button"
                    onClick={() => setPaymentDate(getTodayISO())}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 border border-teal-200 rounded-md px-2 py-0.5 cursor-pointer"
                  >
                    วันนี้
                  </button>
                </div>
                <div className="grid grid-cols-[0.9fr_1.3fr_1.2fr] gap-1.5">
                  <select
                    aria-label="วัน"
                    className="form-select font-mono-num px-2 text-sm"
                    value={selectedDay}
                    onChange={(e) =>
                      updatePaymentDateParts(selectedYear, selectedMonth, Number(e.target.value))
                    }
                  >
                    {Array.from({ length: daysInSelectedMonth }, (_, idx) => idx + 1).map((d) => (
                      <option key={d} value={d}>
                        {String(d).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="เดือน"
                    className="form-select px-2 text-sm"
                    value={selectedMonth}
                    onChange={(e) =>
                      updatePaymentDateParts(selectedYear, Number(e.target.value), selectedDay)
                    }
                  >
                    {THAI_SHORT_MONTHS.map((label, idx) => (
                      <option key={label} value={idx + 1}>
                        {String(idx + 1).padStart(2, '0')} {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="ปี"
                    className="form-select font-mono-num px-2 text-sm"
                    value={selectedYear}
                    onChange={(e) =>
                      updatePaymentDateParts(Number(e.target.value), selectedMonth, selectedDay)
                    }
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y + 543}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono-num">
                  ว/ด/ป ที่เลือก: <strong className="text-slate-700">{formatShortDate(paymentDate)}</strong> (พ.ศ.{' '}
                  {selectedYear + 543})
                </div>
              </div>

              <div className="col-md-7">
                <label className="form-label">ร้านค้า / ผู้รับเงินปลายทาง</label>
                <div className="relative">
                  <input
                    type="text"
                    className="form-control pr-9"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    placeholder="เช่น ร้านอุปกรณ์ไฟฟ้า / ปั๊มน้ำมัน / ค่าวิน"
                  />
                  {vendorName && (
                    <button
                      type="button"
                      onClick={() => setVendorName('')}
                      aria-label="ล้างชื่อร้านค้า"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="form-label m-0">รายละเอียดค่าใช้จ่าย *</label>
                  {formMemory.lastDescription && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-teal-700 font-medium">
                      <History className="w-3 h-3" />
                      จำค่าล่าสุดแล้ว
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    className="form-control pr-9"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="เช่น ค่าชาร์จไฟฟ้ารถยนต์เดินทาง / ซื้อปลั๊กพ่วง / ค่าวิน"
                  />
                  {description && (
                    <button
                      type="button"
                      onClick={() => setDescription('')}
                      aria-label="ล้างรายละเอียดค่าใช้จ่าย"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 bg-transparent border-0 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {descriptionSuggestions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setDescription(item)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                        description.trim() === item
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
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

              {/* Amount & Auto Tax Split Calculator */}
              <div className="col-12">
                <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs sm:text-sm font-bold text-slate-900">
                      วิธีกรอกยอดเงินและการคำนวณภาษี
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-200/75">
                      <button
                        type="button"
                        onClick={() => setAmountMode('gross_total')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border-0 cursor-pointer ${
                          amountMode === 'gross_total'
                            ? 'bg-teal-700 text-white shadow-xs'
                            : 'bg-transparent text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        กรอกยอดราคาเต็ม (แยก VAT อัตโนมัติ)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAmountMode('before_vat')}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border-0 cursor-pointer ${
                          amountMode === 'before_vat'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'bg-transparent text-slate-700 hover:text-slate-900'
                        }`}
                      >
                        กรอกยอดก่อน VAT
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="form-label">
                      {amountMode === 'gross_total'
                        ? 'ยอดราคาจำนวนเต็มตามบิล / ที่จ่ายจริง (บาท) *'
                        : 'จำนวนเงิน (ก่อน VAT) *'}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      className="form-control font-mono-num fw-bold text-base"
                      placeholder="0.00"
                      value={amountInput}
                      onChange={(e) => {
                        const { text, value } = sanitizeDecimalInput(e.target.value);
                        setAmountInput(text);
                        setRawAmountValue(value);
                      }}
                    />
                  </div>

                  {amountMode === 'gross_total' ? (
                    <div className="space-y-2.5 pt-1">
                      <div className="text-xs font-semibold text-slate-700">
                        ติ๊กเลือกรายการภาษีเพื่อคำนวณแยกจากยอดเต็ม:
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-teal-400">
                          <input
                            type="checkbox"
                            className="form-check-input mt-0.5 shrink-0"
                            checked={vatRate === 7}
                            onChange={(e) => setVatRate(e.target.checked ? 7 : 0)}
                          />
                          <div className="text-xs leading-snug">
                            <div className="font-bold text-slate-900">รวม VAT 7% แล้ว</div>
                            <div className="text-slate-500">
                              ระบบจะถอด VAT 7% ออกจากยอดเต็มอัตโนมัติ (÷ 1.07)
                            </div>
                          </div>
                        </label>

                        <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:border-teal-400">
                          <input
                            type="checkbox"
                            className="form-check-input mt-0.5 shrink-0"
                            checked={whtRate > 0}
                            onChange={(e) => setWhtRate(e.target.checked ? 3 : 0)}
                          />
                          <div className="text-xs leading-snug">
                            <div className="font-bold text-slate-900">มีหัก ณ ที่จ่าย (WHT)</div>
                            <div className="text-slate-500">
                              ติ๊กเพื่อเลือกอัตราหัก ณ ที่จ่าย (1% / 2% / 3% / 5%)
                            </div>
                          </div>
                        </label>
                      </div>

                      {whtRate > 0 && (
                        <div className="p-3 rounded-lg bg-white border border-teal-200 space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-700 mr-1">
                              อัตราหัก ณ ที่จ่าย:
                            </span>
                            {[
                              { rate: 1, label: '1% ขนส่ง' },
                              { rate: 2, label: '2% โฆษณา' },
                              { rate: 3, label: '3% บริการ' },
                              { rate: 5, label: '5% เช่า/นักแสดง' },
                            ].map((opt) => (
                              <button
                                key={opt.rate}
                                type="button"
                                onClick={() => setWhtRate(opt.rate)}
                                className={`px-2.5 py-1 rounded-md border text-xs font-semibold cursor-pointer ${
                                  whtRate === opt.rate
                                    ? 'bg-teal-700 text-white border-teal-700'
                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>

                          <label className="flex items-start gap-2 pt-1 border-t border-slate-100 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              className="form-check-input mt-0.5 shrink-0"
                              checked={grossIncludesWhtDeduction}
                              onChange={(e) => setGrossIncludesWhtDeduction(e.target.checked)}
                            />
                            <span className="text-slate-700 leading-snug">
                              <strong>ยอดเต็มที่กรอกเป็นยอดจ่ายสุทธิหลังหักภาษีแล้ว</strong>{' '}
                              <span className="text-slate-500">
                                (เช่น จ่ายสดให้ผู้รับ 970 บาทหลังหัก 3% ระบบจะย้อนหาฐาน 1,000 บาทให้)
                              </span>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="row g-2 pt-1">
                      <div className="col-sm-6">
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
                      <div className="col-sm-6">
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
                  )}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 space-y-1.5 text-xs sm:text-sm font-mono-num">
              <div className="flex flex-wrap justify-between gap-2 text-slate-700">
                <span>จำนวนเงินก่อน VAT (ฐานภาษี):</span>
                <strong>฿{formatTHB(amount)}</strong>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-slate-700">
                <span>VAT {vatRate}% · หัก ณ ที่จ่าย {whtRate}%:</span>
                <span>
                  +฿{formatTHB(vatAmount)} / -฿{formatTHB(whtAmount)}
                </span>
              </div>
              <div className="pt-1.5 border-t border-teal-200/80 flex flex-wrap justify-between items-center gap-2">
                <span className="font-sans font-semibold text-teal-900">ยอดเบิกคืนสุทธิ:</span>
                <strong className="text-teal-900 text-base">
                  ฿{formatTHB(netPaid)}
                </strong>
              </div>
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
              className="figma-btn px-6 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              {submitting ? 'กำลังส่งข้อมูล & แจ้งเตือน LINE...' : `ส่งคำขอเบิกและแจ้งเตือน LINE ${oaId}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
