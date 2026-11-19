import React, { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Landmark,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  uploadAssetFile,
} from '../firebase';
import {
  AnnualFinancialLedger,
  CompanyProfile,
  DEFAULT_COMPANY_LOGO,
  DEFAULT_COMPANY_PROFILE,
  UserProfile,
  UserRole,
} from '../types/accounting';
import { formatTHB } from '../utils/formatters';
import { HISTORICAL_OFFICE_ADDRESS_2562_2568 } from '../utils/financialStatements';
import { closeSwal, showUploadLoading, toastError, toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { JaiklaLogoSVG, JaiklaSignatureSVG, JaiklaStampSVG } from '../components/BrandAssets';

interface DbdLookupResponse {
  juristicId: string;
  companyNameTh: string;
  companyNameEn: string;
  juristicType: string;
  juristicStatus: string;
  registerDateRaw: string;
  registerDateTh: string;
  registeredCapital: number;
  branch: string;
  objectiveCode: string;
  objectiveTextTh: string;
  address: string;
  addressParts?: {
    streetLine: string;
    subdistrict: string;
    district: string;
    province: string;
    isBangkok: boolean;
  };
  fetchedAt: string;
}

interface SettingsViewProps {
  company: CompanyProfile;
  currentUserProfile: UserProfile | null;
  teamMembers: UserProfile[];
  annualLedgers?: AnnualFinancialLedger[];
}

function mergePostalCodeIfMissing(newAddress: string, existingAddress: string, province?: string): string {
  const cleanNew = newAddress.trim();
  if (!cleanNew || /\b\d{5}\b/.test(cleanNew)) return cleanNew;
  const existingZipMatch = (existingAddress || '').match(/\b(\d{5})\b/);
  if (existingZipMatch && province && existingAddress.includes(province)) {
    return `${cleanNew} ${existingZipMatch[1]}`;
  }
  return cleanNew;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  company,
  currentUserProfile,
  teamMembers,
  annualLedgers = [],
}) => {
  const isAdmin =
    currentUserProfile?.role === 'admin' ||
    auth.currentUser?.email === 'jaikladigital@gmail.com';

  const [form, setForm] = useState<CompanyProfile>(company);
  const [saving, setSaving] = useState(false);
  const [syncOpenLedgers, setSyncOpenLedgers] = useState(true);

  const [dbdLoading, setDbdLoading] = useState(false);
  const [dbdError, setDbdError] = useState<string | null>(null);
  const [dbdResult, setDbdResult] = useState<DbdLookupResponse | null>(null);

  useEffect(() => {
    setForm(company);
  }, [company]);

  const openLedgers2569Plus = useMemo(
    () => annualLedgers.filter((l) => l.fiscalYearBe >= 2569),
    [annualLedgers]
  );

  const needsLatestOfficeUpgrade = useMemo(() => {
    const addr = (form.address || '').trim();
    const phone = (form.phone || '').trim();
    return (
      !addr ||
      addr === 'กรุงเทพมหานคร ประเทศไทย' ||
      addr === HISTORICAL_OFFICE_ADDRESS_2562_2568 ||
      phone === '02-000-0000'
    );
  }, [form.address, form.phone]);

  const dbdDiffItems = useMemo(() => {
    if (!dbdResult) return [];
    const diffs: Array<{ label: string; current: string; next: string }> = [];
    const mergedDbdAddr = mergePostalCodeIfMissing(
      dbdResult.address,
      form.address,
      dbdResult.addressParts?.province
    );

    if (dbdResult.companyNameTh && dbdResult.companyNameTh !== form.companyNameTh.trim()) {
      diffs.push({
        label: 'ชื่อนิติบุคคล (TH)',
        current: form.companyNameTh || '-',
        next: dbdResult.companyNameTh,
      });
    }
    if (dbdResult.companyNameEn && dbdResult.companyNameEn !== form.companyNameEn.trim()) {
      diffs.push({
        label: 'ชื่อนิติบุคคล (EN)',
        current: form.companyNameEn || '-',
        next: dbdResult.companyNameEn,
      });
    }
    if (mergedDbdAddr && mergedDbdAddr !== form.address.trim()) {
      diffs.push({
        label: 'ที่ตั้งสำนักงาน',
        current: form.address || '-',
        next: mergedDbdAddr,
      });
    }
    if (
      dbdResult.registeredCapital > 0 &&
      Number(form.registeredCapital || 0) !== dbdResult.registeredCapital
    ) {
      diffs.push({
        label: 'ทุนจดทะเบียน',
        current: form.registeredCapital ? `${formatTHB(form.registeredCapital)} บาท` : '-',
        next: `${formatTHB(dbdResult.registeredCapital)} บาท`,
      });
    }
    if (dbdResult.juristicStatus && dbdResult.juristicStatus !== (form.dbdStatus || '')) {
      diffs.push({
        label: 'สถานะนิติบุคคล',
        current: form.dbdStatus || '-',
        next: dbdResult.juristicStatus,
      });
    }
    return diffs;
  }, [dbdResult, form]);

  const handleFetchFromDbd = async () => {
    const targetTaxId = (form.taxId || DEFAULT_COMPANY_PROFILE.taxId).replace(/\D/g, '');
    if (targetTaxId.length !== 13) {
      setDbdError('กรุณากรอกเลขประจำตัวผู้เสียภาษี / ทะเบียนนิติบุคคล 13 หลักก่อนซิงค์ข้อมูล');
      return;
    }

    setDbdLoading(true);
    setDbdError(null);
    try {
      const res = await fetch(`/api/dbd-lookup?taxId=${encodeURIComponent(targetTaxId)}`);
      const payload = (await res.json()) as {
        ok?: boolean;
        data?: DbdLookupResponse;
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.data) {
        throw new Error(payload.error || `เชื่อมต่อ DBD Open API ไม่สำเร็จ (HTTP ${res.status})`);
      }
      setDbdResult(payload.data);
      toastSuccess(
        'ดึงข้อมูลล่าสุดจากกรมพัฒนาธุรกิจการค้า (DBD) สำเร็จ',
        'ตรวจสอบรายละเอียดและกด "นำข้อมูล DBD มาใช้" เพื่ออัปเดตฟอร์ม'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถดึงข้อมูลจาก DBD ได้';
      setDbdError(msg);
      toastError('ซิงค์ข้อมูล DBD ไม่สำเร็จ', msg);
    } finally {
      setDbdLoading(false);
    }
  };

  const handleApplyDbdResult = () => {
    if (!dbdResult) return;
    const mergedAddr = mergePostalCodeIfMissing(
      dbdResult.address,
      form.address,
      dbdResult.addressParts?.province
    );

    setForm((prev) => ({
      ...prev,
      companyNameTh: dbdResult.companyNameTh || prev.companyNameTh,
      companyNameEn: dbdResult.companyNameEn || prev.companyNameEn,
      taxId: dbdResult.juristicId || prev.taxId,
      branch: dbdResult.branch || prev.branch || 'สำนักงานใหญ่',
      address: mergedAddr || prev.address,
      registeredCapital: dbdResult.registeredCapital || prev.registeredCapital,
      dbdStatus: dbdResult.juristicStatus || prev.dbdStatus,
      dbdObjective: dbdResult.objectiveTextTh || prev.dbdObjective,
      lastDbdSyncAt: dbdResult.fetchedAt,
    }));

    toastSuccess(
      'นำข้อมูล DBD ใส่ลงในฟอร์มเรียบร้อย',
      'กดปุ่ม "บันทึกและเผยแพร่ข้อมูลบริษัท" ด้านล่างเพื่อให้มีผลกับทุกเอกสาร'
    );
  };

  const handleQuickApply2569Address = () => {
    setForm((prev) => ({
      ...prev,
      address: DEFAULT_COMPANY_PROFILE.address,
      phone:
        !prev.phone || prev.phone === '02-000-0000'
          ? DEFAULT_COMPANY_PROFILE.phone
          : prev.phone,
      taxId: prev.taxId || DEFAULT_COMPANY_PROFILE.taxId,
      directorName: prev.directorName || DEFAULT_COMPANY_PROFILE.directorName,
    }));
    toastSuccess(
      'ปรับที่ตั้งสำนักงานเป็น จ.ปทุมธานี 12120 (ปี 2569+) ในฟอร์มแล้ว',
      'กดปุ่ม "บันทึกและเผยแพร่ข้อมูลบริษัท" เพื่อซิงค์ไปยังเอกสารและงบปี 2569+ ทั้งระบบ'
    );
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !isAdmin) {
      toastError('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่แก้ไขการตั้งค่าหลักได้');
      return;
    }

    const cleanNameTh = form.companyNameTh.trim().slice(0, 200);
    const cleanNameEn = form.companyNameEn.trim().slice(0, 200);
    const cleanTaxId = form.taxId.trim().slice(0, 30);
    const cleanAddress = form.address.trim().slice(0, 500);
    const cleanBankAccNo = form.bankAccountNo.trim().slice(0, 50);

    if (!cleanNameTh || !cleanNameEn || cleanTaxId.length < 10 || !cleanAddress || !cleanBankAccNo) {
      toastError(
        'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน',
        'ชื่อบริษัทไทย/อังกฤษ, Tax ID (10–30 หลัก), ที่อยู่จดทะเบียน และเลขที่บัญชีธนาคาร'
      );
      return;
    }

    const changedParts: string[] = [];
    if (cleanNameTh !== company.companyNameTh) changedParts.push('ชื่อบริษัท (TH)');
    if (cleanNameEn !== company.companyNameEn) changedParts.push('ชื่อบริษัท (EN)');
    if (cleanTaxId !== company.taxId) changedParts.push('Tax ID');
    if (cleanAddress !== company.address) changedParts.push('ที่ตั้งสำนักงาน');
    if (form.phone.trim() !== company.phone) changedParts.push('เบอร์โทร');
    if (cleanBankAccNo !== company.bankAccountNo) changedParts.push('เลขบัญชีธนาคาร');
    if ((form.directorName || '').trim() !== (company.directorName || '').trim()) {
      changedParts.push('กรรมการผู้มีอำนาจ');
    }
    if (form.lastDbdSyncAt && form.lastDbdSyncAt !== company.lastDbdSyncAt) {
      changedParts.push('ซิงค์ฐานข้อมูล DBD');
    }

    const nowDateStr = new Date().toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const nextSummary =
      changedParts.length > 0
        ? `อัปเดต ${changedParts.join(', ')} (${nowDateStr})`.slice(0, 500)
        : (company.lastChangeSummary || '').slice(0, 500);

    const cleanDirector = (
      form.directorName ||
      DEFAULT_COMPANY_PROFILE.directorName ||
      'นายสาธิต จันทร์ทนต์'
    )
      .trim()
      .slice(0, 150);

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        companyNameTh: cleanNameTh,
        companyNameEn: cleanNameEn,
        taxId: cleanTaxId,
        branch: (form.branch || 'สำนักงานใหญ่').trim().slice(0, 100),
        address: cleanAddress,
        phone: form.phone.trim().slice(0, 100),
        email: form.email.trim().slice(0, 150),
        bankName: form.bankName.trim().slice(0, 150),
        bankBranch: form.bankBranch.trim().slice(0, 150),
        bankAccountNo: cleanBankAccNo,
        bankAccountName: form.bankAccountName.trim().slice(0, 200),
        defaultVatRate: Math.min(30, Math.max(0, Number(form.defaultVatRate) || 0)),
        defaultWhtRate: Math.min(30, Math.max(0, Number(form.defaultWhtRate) || 0)),
        logoUrl: (form.logoUrl || '').slice(0, 1000),
        watermarkUrl: (form.watermarkUrl || '').slice(0, 1000),
        stampUrl: (form.stampUrl || '').slice(0, 1000),
        signatureUrl: (form.signatureUrl || '').slice(0, 1000),
        lineOaId: (form.lineOaId || '@421khbew').trim().slice(0, 60),
        directorName: cleanDirector,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      };

      if (typeof form.registeredCapital === 'number' && !Number.isNaN(form.registeredCapital)) {
        payload.registeredCapital = form.registeredCapital;
      }
      if (form.dbdStatus) payload.dbdStatus = form.dbdStatus.trim().slice(0, 120);
      if (form.dbdObjective) payload.dbdObjective = form.dbdObjective.trim().slice(0, 300);
      if (form.lastDbdSyncAt) payload.lastDbdSyncAt = form.lastDbdSyncAt.trim().slice(0, 60);
      if (nextSummary) payload.lastChangeSummary = nextSummary;

      await setDoc(doc(db, 'settings', 'company_profile'), payload);

      let syncedLedgersCount = 0;
      if (syncOpenLedgers && openLedgers2569Plus.length > 0) {
        const cleanRegNo = cleanTaxId.replace(/\D/g, '').slice(0, 40) || cleanTaxId.slice(0, 40);
        for (const ledger of openLedgers2569Plus) {
          const needsUpdate =
            (ledger.businessAddress || '') !== cleanAddress ||
            (ledger.registrationNumber || '') !== cleanRegNo ||
            (ledger.directorName || '') !== cleanDirector;
          if (needsUpdate) {
            await updateDoc(doc(db, 'annual_ledgers', ledger.id), {
              businessAddress: cleanAddress,
              registrationNumber: cleanRegNo,
              directorName: cleanDirector,
              updatedAt: serverTimestamp(),
            });
            syncedLedgersCount += 1;
          }
        }
      }

      toastSuccess(
        'บันทึกและเผยแพร่ข้อมูลบริษัทเรียบร้อย',
        syncedLedgersCount > 0
          ? `อัปเดตเอกสารทั้งหมดและซิงค์งบการเงินปี 2569+ จำนวน ${syncedLedgersCount} ปีเรียบร้อยแล้ว`
          : 'เอกสารใหม่และเอกสารที่ใช้งานอยู่ (QT/INV/REC/50 ทวิ) ใช้ข้อมูลล่าสุดแล้ว'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/company_profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAssetUpload = async (
    field: 'logoUrl' | 'watermarkUrl' | 'stampUrl' | 'signatureUrl',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    showUploadLoading('กำลังอัปโหลดสินทรัพย์แบรนด์...');
    try {
      const url = await uploadAssetFile(`company_assets/${field}_${Date.now()}_${file.name}`, file);
      setForm((prev) => ({ ...prev, [field]: url }));
      closeSwal();
      toastSuccess('อัปโหลดรูปภาพเรียบร้อย', 'อย่าลืมกดปุ่มบันทึกการตั้งค่า');
    } catch (error) {
      closeSwal();
      toastError('อัปโหลดไม่สำเร็จ', error instanceof Error ? error.message : '');
    }
  };

  const handleRoleToggle = async (member: UserProfile, nextRole: UserRole) => {
    if (!isAdmin) return;
    if (member.email === 'jaikladigital@gmail.com' && nextRole !== 'admin') {
      toastError('ไม่สามารถถอดสิทธิ์ Admin หลักของบริษัทได้');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', member.uid), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
      if (nextRole === 'admin') {
        await setDoc(doc(db, 'admins', member.uid), {
          uid: member.uid,
          email: member.email,
          createdAt: serverTimestamp(),
        });
      } else {
        await deleteDoc(doc(db, 'admins', member.uid));
      }
      toastSuccess(`อัปเดตสิทธิ์ของ ${member.displayName} เป็น ${nextRole} แล้ว`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${member.uid}`);
    }
  };

  return (
    <div className="space-y-6 animate-figma-in">
      <div className="text-center max-w-2xl mx-auto pb-1">
        <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
          {formatThaiLineBreaks('ตั้งค่าบริษัท ระบบภาษีหลังบ้าน และซิงค์ข้อมูล DBD')}
        </h1>
        <p className="thai-prose text-sm text-slate-500 mt-1 mb-0">
          {formatThaiLineBreaks(
            'ศูนย์กลางข้อมูลนิติบุคคลที่ซิงค์จากกรมพัฒนาธุรกิจการค้า (DBD) และอัปเดตอัตโนมัติไปยังใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ 50 ทวิ และงบปี 2569+'
          )}
        </p>
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          คุณกำลังเข้าใช้งานในระดับ <strong>Staff</strong> — สามารถดูข้อมูลบริษัทได้ แต่การแก้ไขอัตราภาษีและการตั้งค่าหลักสงวนสิทธิ์เฉพาะ Admin
        </div>
      )}

      {needsLatestOfficeUpgrade && isAdmin && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-sm text-amber-950">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">ตรวจพบที่ตั้งสำนักงานหรือเบอร์โทรเดิมในระบบ</div>
              <div className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                แนะนำให้ปรับเป็นทีตั้งสำนักงานล่าสุดสำหรับปี 2569+ ({DEFAULT_COMPANY_PROFILE.address}) และโทร{' '}
                {DEFAULT_COMPANY_PROFILE.phone} หรือดึงข้อมูลสดจาก DBD ด้านล่าง
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickApply2569Address}
            className="px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold shrink-0"
          >
            ปรับใช้ที่อยู่ปทุมธานี 12120 ทันที
          </button>
        </div>
      )}

      {/* DBD Open Data Auto-Sync Card */}
      <div className="figma-card p-5 border-indigo-200 bg-gradient-to-br from-white via-white to-indigo-50/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0 flex flex-wrap items-center gap-2">
                <span>ซิงค์ข้อมูลนิติบุคคลอัตโนมัติจาก DBD (กรมพัฒนาธุรกิจการค้า)</span>
                {form.dbdStatus && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
                    {form.dbdStatus}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-1 mb-0 leading-relaxed">
                เชื่อมต่อ DBD Open Data API โดยตรงด้วยเลขทะเบียนนิติบุคคล 13 หลัก เพื่อดึงชื่อบริษัท ที่ตั้งสำนักงานใหญ่ล่าสุด ทุนจดทะเบียน และวัตถุประสงค์หลักเมื่อมีการเปลี่ยนแปลงทางทะเบียนในอนาคต
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={!isAdmin || dbdLoading}
            onClick={handleFetchFromDbd}
            className="figma-btn px-4 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${dbdLoading ? 'animate-spin' : ''}`} />
            {dbdLoading ? 'กำลังเชื่อมต่อ DBD...' : 'ดึงข้อมูลล่าสุดจาก DBD'}
          </button>
        </div>

        <div className="pt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600">
          <span>
            เลขทะเบียนที่ใช้ซิงค์:{' '}
            <strong className="font-mono-num text-slate-900">
              {(form.taxId || DEFAULT_COMPANY_PROFILE.taxId).replace(/\D/g, '') || form.taxId}
            </strong>
          </span>
          {form.registeredCapital ? (
            <span>
              ทุนจดทะเบียนปัจจุบัน:{' '}
              <strong className="font-mono-num text-slate-900">
                {formatTHB(form.registeredCapital)} บาท
              </strong>
            </span>
          ) : null}
          {form.lastDbdSyncAt && (
            <span>
              ซิงค์ DBD ล่าสุด:{' '}
              <strong className="text-slate-800">
                {new Date(form.lastDbdSyncAt).toLocaleString('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </strong>
            </span>
          )}
          {company.lastChangeSummary && (
            <span className="text-indigo-700 font-medium">{company.lastChangeSummary}</span>
          )}
        </div>

        {dbdError && (
          <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{dbdError}</span>
          </div>
        )}

        {dbdResult && (
          <div className="mt-4 p-4 rounded-xl bg-white border border-indigo-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>ข้อมูลทางการจาก DBD Open Data API ({dbdResult.juristicId})</span>
              </div>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={handleApplyDbdResult}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                นำข้อมูล DBD มาใส่ในฟอร์ม
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-slate-500">ชื่อนิติบุคคล (ไทย / อังกฤษ)</div>
                <div className="font-semibold text-slate-900 mt-0.5">{dbdResult.companyNameTh}</div>
                <div className="text-slate-600">{dbdResult.companyNameEn}</div>
              </div>
              <div>
                <div className="text-slate-500">สถานะ / วันที่จดทะเบียน / ทุนจดทะเบียน</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {dbdResult.juristicStatus} • จดทะเบียน {dbdResult.registerDateTh || '-'}
                </div>
                <div className="font-mono-num text-slate-700">
                  ทุนจดทะเบียน {formatTHB(dbdResult.registeredCapital)} บาท
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="text-slate-500">ที่ตั้งสำนักงานใหญ่ตามทะเบียน DBD</div>
                <div className="font-semibold text-slate-900 mt-0.5">{dbdResult.address}</div>
                {dbdResult.objectiveTextTh && (
                  <div className="text-slate-500 mt-1">
                    วัตถุประสงค์หลัก ({dbdResult.objectiveCode}): {dbdResult.objectiveTextTh}
                  </div>
                )}
              </div>
            </div>

            {dbdDiffItems.length > 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5">
                <div className="text-xs font-bold text-amber-900">
                  พบข้อมูลที่แตกต่างจากฟอร์มปัจจุบัน ({dbdDiffItems.length} รายการ):
                </div>
                {dbdDiffItems.map((diff) => (
                  <div
                    key={diff.label}
                    className="text-xs text-amber-950 flex flex-wrap items-center gap-1.5"
                  >
                    <span className="font-semibold">{diff.label}:</span>
                    <span className="line-through text-slate-500">{diff.current}</span>
                    <ArrowRight className="w-3 h-3 text-amber-700 shrink-0" />
                    <span className="font-semibold text-emerald-800">{diff.next}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                ข้อมูลในฟอร์มตรงกับฐานข้อมูลกรมพัฒนาธุรกิจการค้าล่าสุดแล้ว
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Company & Bank Info */}
          <div className="lg:col-span-7 figma-card p-5">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-700" />
              ข้อมูลนิติบุคคลและบัญชีรับชำระเงิน
            </h2>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">ชื่อบริษัท (ภาษาไทย)</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.companyNameTh}
                  onChange={(e) => setForm({ ...form, companyNameTh: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">ชื่อบริษัท (English)</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.companyNameEn}
                  onChange={(e) => setForm({ ...form, companyNameEn: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                <input
                  type="text"
                  className="form-control font-mono-num"
                  disabled={!isAdmin}
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">สาขา</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                />
              </div>
              <div className="col-12">
                <label className="form-label">
                  ที่ตั้งสำนักงานจดทะเบียนล่าสุด (ใช้กับเอกสารปัจจุบัน และงบการเงินปี 2569+)
                </label>
                <textarea
                  className="form-control"
                  rows={2}
                  disabled={!isAdmin}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">เบอร์โทรศัพท์</label>
                <input
                  type="text"
                  className="form-control font-mono-num"
                  disabled={!isAdmin}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">อีเมลติดต่อ</label>
                <input
                  type="email"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">กรรมการผู้มีอำนาจลงนาม</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.directorName || ''}
                  onChange={(e) => setForm({ ...form, directorName: e.target.value })}
                  placeholder="เช่น นายสาธิต จันทร์ทนต์"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">ทุนจดทะเบียน (บาท)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  className="form-control font-mono-num"
                  disabled={!isAdmin}
                  value={form.registeredCapital ?? 1000000}
                  onChange={(e) =>
                    setForm({ ...form, registeredCapital: Number(e.target.value) || 0 })
                  }
                />
              </div>

              <div className="col-12 pt-2 border-t border-slate-200">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  บัญชีธนาคารสำหรับรับโอนเงิน (แสดงบนใบแจ้งหนี้)
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">ธนาคาร</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">เลขที่บัญชี</label>
                <input
                  type="text"
                  className="form-control font-mono-num"
                  disabled={!isAdmin}
                  value={form.bankAccountNo}
                  onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })}
                />
              </div>
              <div className="col-12">
                <label className="form-label">ชื่อบัญชี</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={!isAdmin}
                  value={form.bankAccountName}
                  onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Flexible Tax Engine, Brand Assets & Propagation */}
          <div className="lg:col-span-5 space-y-5">
            <div className="figma-card p-5">
              <h2 className="text-base font-bold text-slate-900 mb-1">
                ตั้งค่าอัตราภาษีหลังบ้าน (Flexible Tax Engine)
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                ปรับเพิ่มหรือลดอัตราภาษีเริ่มต้นที่ระบบจะนำไปใช้เวลาสร้างเอกสารใหม่
              </p>

              <div className="row g-3">
                <div className="col-6">
                  <label className="form-label">อัตรา VAT เริ่มต้น (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    disabled={!isAdmin}
                    className="form-control font-mono-num fw-bold"
                    value={form.defaultVatRate}
                    onChange={(e) =>
                      setForm({ ...form, defaultVatRate: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">อัตราหัก ณ ที่จ่าย WHT (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    step="0.5"
                    disabled={!isAdmin}
                    className="form-control font-mono-num fw-bold"
                    value={form.defaultWhtRate}
                    onChange={(e) =>
                      setForm({ ...form, defaultWhtRate: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-12 pt-2 border-t border-slate-100">
                  <label className="form-label">
                    LINE Official Account ID รับแจ้งเตือนเบิกจ่ายฉุกเฉิน
                  </label>
                  <input
                    type="text"
                    disabled={!isAdmin}
                    className="form-control font-mono-num"
                    value={form.lineOaId || '@421khbew'}
                    onChange={(e) => setForm({ ...form, lineOaId: e.target.value })}
                    placeholder="@421khbew"
                  />
                  <div className="text-[11px] text-slate-500 mt-1">
                    ค่าเริ่มต้น: @421khbew (ใช้แจ้งเตือนค่าใช้จ่ายเงินสดฉุกเฉินของพนักงานและซัพพลายเยอร์)
                  </div>
                </div>
              </div>
            </div>

            <div className="figma-card p-5">
              <h2 className="text-base font-bold text-slate-900 mb-3">
                โลโก้ ลายน้ำ ตราประทับ และลายเซ็นดิจิทัล
              </h2>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="border border-slate-200 rounded-lg p-3 text-center flex flex-col justify-between">
                  <div>
                    <div className="h-16 flex items-center justify-center mb-2">
                      <JaiklaLogoSVG className="w-14 h-14" logoUrl={form.logoUrl} />
                    </div>
                    <div className="font-semibold mb-1.5">โลโก้บริษัท</div>
                  </div>
                  {isAdmin && (
                    <div className="space-y-1.5">
                      <label className="btn btn-outline-secondary btn-sm w-full cursor-pointer">
                        <Upload className="w-3 h-3 inline me-1" />
                        อัปโหลด
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleAssetUpload('logoUrl', e)}
                        />
                      </label>
                      {form.logoUrl !== DEFAULT_COMPANY_LOGO && (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, logoUrl: DEFAULT_COMPANY_LOGO }))}
                          className="btn btn-link btn-sm w-full text-decoration-none p-0 text-[11px] text-blue-700"
                        >
                          ใช้โลโก้บริษัท 2025 เริ่มต้น
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg p-3 text-center">
                  <div className="h-16 flex items-center justify-center mb-2">
                    <JaiklaStampSVG
                      companyNameTh={form.companyNameTh}
                      companyNameEn={form.companyNameEn}
                      stampUrl={form.stampUrl}
                    />
                  </div>
                  <div className="font-semibold mb-1.5">ตราประทับบริษัท</div>
                  {isAdmin && (
                    <label className="btn btn-outline-secondary btn-sm w-full cursor-pointer">
                      <Upload className="w-3 h-3 inline me-1" />
                      อัปโหลด
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleAssetUpload('stampUrl', e)}
                      />
                    </label>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg p-3 text-center">
                  <div className="h-16 flex items-center justify-center mb-2">
                    <JaiklaSignatureSVG signatureUrl={form.signatureUrl} />
                  </div>
                  <div className="font-semibold mb-1.5">ลายเซ็นผู้มีอำนาจ</div>
                  {isAdmin && (
                    <label className="btn btn-outline-secondary btn-sm w-full cursor-pointer">
                      <Upload className="w-3 h-3 inline me-1" />
                      อัปโหลด
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleAssetUpload('signatureUrl', e)}
                      />
                    </label>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg p-3 text-center">
                  <div className="h-16 flex items-center justify-center mb-2">
                    {form.watermarkUrl ? (
                      <img
                        src={form.watermarkUrl}
                        alt="Watermark"
                        referrerPolicy="no-referrer"
                        className="h-12 object-contain opacity-45"
                      />
                    ) : (
                      <span className="text-slate-400">ใช้ข้อความ/โลโก้หลัก</span>
                    )}
                  </div>
                  <div className="font-semibold mb-1.5">รูปภาพลายน้ำ</div>
                  {isAdmin && (
                    <label className="btn btn-outline-secondary btn-sm w-full cursor-pointer">
                      <Upload className="w-3 h-3 inline me-1" />
                      อัปโหลด
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleAssetUpload('watermarkUrl', e)}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Auto-Propagation Overview & Toggle */}
            <div className="figma-card p-4 border-emerald-200 bg-emerald-50/40 space-y-2.5 text-xs">
              <div className="font-bold text-slate-900">
                เอกสารที่จะอัปเดตข้อมูลล่าสุดโดยอัตโนมัติเมื่อบันทึก:
              </div>
              <ul className="space-y-1 text-slate-700 ps-4 mb-0">
                <li>ใบเสนอราคา (QT), ใบแจ้งหนี้ (INV) และใบเสร็จรับเงิน (REC)</li>
                <li>หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) และใบสำคัญเบิกจ่ายฉุกเฉิน</li>
                <li>ชุดข้อมูลหัวบิลบริษัทหน้าเข้าสู่ระบบ และงบการเงินปี 2569+</li>
              </ul>

              {isAdmin && (
                <label className="flex items-start gap-2 pt-2 border-t border-emerald-200 cursor-pointer">
                  <input
                    type="checkbox"
                    className="form-check-input mt-0.5 shrink-0"
                    checked={syncOpenLedgers}
                    onChange={(e) => setSyncOpenLedgers(e.target.checked)}
                  />
                  <span className="text-slate-800 leading-relaxed">
                    ซิงค์ที่อยู่ เลขทะเบียน และชื่อกรรมการไปยังงบการเงินปี 2569+ ที่บันทึกไว้โดยอัตโนมัติ (
                    {openLedgers2569Plus.length} ปี) โดยคงข้อมูลงบปี 2562–2568 ไว้ตามฉบับตรวจสอบแล้ว
                  </span>
                </label>
              )}
            </div>

            {isAdmin && (
              <button
                type="submit"
                disabled={saving}
                className="figma-btn w-full py-2.5 px-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'กำลังบันทึกและซิงค์เอกสาร...' : 'บันทึกและเผยแพร่ข้อมูลบริษัท'}
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Team RBAC Management */}
      {isAdmin && (
        <div className="figma-card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-700" />
            <h2 className="text-base font-bold text-slate-900 m-0">
              จัดการสิทธิ์ผู้ใช้งาน (Team &amp; Role Control)
            </h2>
          </div>
          <div className="table-responsive">
            <table className="table align-middle mb-0 text-sm">
              <thead className="table-light">
                <tr>
                  <th className="px-4 py-3">ชื่อผู้ใช้งาน</th>
                  <th className="px-4 py-3">อีเมล</th>
                  <th className="px-4 py-3">สิทธิ์ปัจจุบัน</th>
                  <th className="px-4 py-3 text-end">เปลี่ยนสิทธิ์</th>
                </tr>
              </thead>
              <tbody>
                {teamMembers.map((m) => (
                  <tr key={m.uid}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{m.displayName}</td>
                    <td className="px-4 py-3 font-mono-num text-slate-600">{m.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-bold uppercase ${
                          m.role === 'admin' ? 'text-blue-700' : 'text-slate-600'
                        }`}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <select
                        className="form-select form-select-sm d-inline-block w-auto"
                        value={m.role}
                        disabled={m.email === 'jaikladigital@gmail.com'}
                        onChange={(e) => handleRoleToggle(m, e.target.value as UserRole)}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

