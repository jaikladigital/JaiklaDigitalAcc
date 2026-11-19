import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Save, ShieldCheck, Upload } from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  uploadAssetFile,
} from '../firebase';
import {
  CompanyProfile,
  DEFAULT_COMPANY_LOGO,
  UserProfile,
  UserRole,
} from '../types/accounting';
import { closeSwal, showUploadLoading, toastError, toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { JaiklaLogoSVG, JaiklaSignatureSVG, JaiklaStampSVG } from '../components/BrandAssets';

interface SettingsViewProps {
  company: CompanyProfile;
  currentUserProfile: UserProfile | null;
  teamMembers: UserProfile[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  company,
  currentUserProfile,
  teamMembers,
}) => {
  const isAdmin =
    currentUserProfile?.role === 'admin' ||
    auth.currentUser?.email === 'jaikladigital@gmail.com';

  const [form, setForm] = useState<CompanyProfile>(company);

  useEffect(() => {
    setForm(company);
  }, [company]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid || !isAdmin) {
      toastError('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่แก้ไขการตั้งค่าหลักได้');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'company_profile'), {
        companyNameTh: form.companyNameTh.trim(),
        companyNameEn: form.companyNameEn.trim(),
        taxId: form.taxId.trim(),
        branch: form.branch.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        bankName: form.bankName.trim(),
        bankBranch: form.bankBranch.trim(),
        bankAccountNo: form.bankAccountNo.trim(),
        bankAccountName: form.bankAccountName.trim(),
        defaultVatRate: Math.min(30, Math.max(0, Number(form.defaultVatRate) || 0)),
        defaultWhtRate: Math.min(30, Math.max(0, Number(form.defaultWhtRate) || 0)),
        logoUrl: form.logoUrl || '',
        watermarkUrl: form.watermarkUrl || '',
        stampUrl: form.stampUrl || '',
        signatureUrl: form.signatureUrl || '',
        lineOaId: (form.lineOaId || '@421khbew').trim().slice(0, 60),
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      toastSuccess('บันทึกการตั้งค่าบริษัทและอัตราภาษีเรียบร้อย');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/company_profile');
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
          {formatThaiLineBreaks('ตั้งค่าบริษัท ระบบภาษีหลังบ้าน และสินทรัพย์แบรนด์')}
        </h1>
        <p className="thai-prose text-sm text-slate-500 mt-1 mb-0">
          {formatThaiLineBreaks(
            'ปรับเพิ่ม/ลดอัตราภาษี VAT และ WHT เริ่มต้น, ข้อมูลบัญชีธนาคาร SCB, โลโก้/ลายน้ำ/ตราประทับ และสิทธิ์พนักงาน'
          )}
        </p>
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm">
          คุณกำลังเข้าใช้งานในระดับ <strong>Staff</strong> — สามารถดูข้อมูลบริษัทได้ แต่การแก้ไขอัตราภาษีและการตั้งค่าหลักสงวนสิทธิ์เฉพาะ Admin
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Company & Bank Info */}
          <div className="lg:col-span-7 figma-card p-5">
            <h2 className="text-base font-bold text-slate-900 mb-4">
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
                <label className="form-label">ที่อยู่จดทะเบียน</label>
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

          {/* Flexible Tax Engine & Brand Assets */}
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

            {isAdmin && (
              <button
                type="submit"
                className="figma-btn w-full py-2.5 px-4 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 inline-flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                บันทึกการตั้งค่าบริษัทและอัตราภาษี
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
