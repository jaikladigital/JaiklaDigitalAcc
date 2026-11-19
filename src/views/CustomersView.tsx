import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Building2, FilePlus2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountingDocument,
  Customer,
  FIELD_LIMITS,
  Project,
  clampString,
} from '../types/accounting';
import { formatTHB } from '../utils/formatters';
import { confirmDelete, toastError, toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { ThaiText } from '../components/ThaiText';

interface CustomersViewProps {
  customers: Customer[];
  documents: AccountingDocument[];
  projects: Project[];
  teamUids: string[];
  onCreateQuotationForCustomer: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  documents,
  projects,
  teamUids,
  onCreateQuotationForCustomer,
}) => {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selectedAnalyticsId, setSelectedAnalyticsId] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyName: '',
    taxId: '',
    branch: 'สำนักงานใหญ่',
    address: '',
    contactName: '',
    phone: '',
    email: '',
    notes: '',
  });

  // Compute Customer Lifetime Analytics (Total Spend, VAT, WHT, Project Count)
  const customerStats = useMemo(() => {
    const map = new Map<
      string,
      {
        totalRevenue: number;
        totalVat: number;
        totalWht: number;
        docCount: number;
        projectCount: number;
      }
    >();

    customers.forEach((c) => {
      map.set(c.id, {
        totalRevenue: 0,
        totalVat: 0,
        totalWht: 0,
        docCount: 0,
        projectCount: 0,
      });
    });

    const invIdsWithRec = new Set(
      documents.filter((d) => d.type === 'REC' && d.refDocId && d.status !== 'cancelled').map((d) => d.refDocId)
    );

    documents.forEach((d) => {
      const s = map.get(d.customerId);
      if (!s || d.status === 'cancelled') return;
      s.docCount += 1;
      if (d.type === 'QT') return;
      if (d.type === 'INV' && invIdsWithRec.has(d.id)) return;
      s.totalRevenue += d.subtotal;
      s.totalVat += d.vatAmount;
      s.totalWht += d.whtAmount;
    });

    projects.forEach((p) => {
      const s = map.get(p.customerId);
      if (s) s.projectCount += 1;
    });

    return map;
  }, [customers, documents, projects]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        (c.taxId || '').toLowerCase().includes(q) ||
        (c.contactName || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const selectedCustomer = customers.find((c) => c.id === selectedAnalyticsId) || null;
  const selectedCustomerDocs = useMemo(
    () => documents.filter((d) => d.customerId === selectedAnalyticsId),
    [documents, selectedAnalyticsId]
  );

  const openCreateModal = () => {
    setEditing(null);
    setForm({
      companyName: '',
      taxId: '',
      branch: 'สำนักงานใหญ่',
      address: '',
      contactName: '',
      phone: '',
      email: '',
      notes: '',
    });
    setShowModal(true);
  };

  const openEditModal = (c: Customer) => {
    setEditing(c);
    setForm({
      companyName: c.companyName,
      taxId: c.taxId || '',
      branch: c.branch || 'สำนักงานใหญ่',
      address: c.address,
      contactName: c.contactName || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const companyName = clampString(form.companyName, FIELD_LIMITS.companyName);
    const address = clampString(form.address, FIELD_LIMITS.address);
    if (!companyName || !address) {
      toastError('กรุณากรอกข้อมูลให้ครบ', 'ชื่อบริษัท/ลูกค้า และที่อยู่เป็นข้อมูลบังคับ');
      return;
    }

    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    const payload = {
      companyName,
      taxId: clampString(form.taxId, FIELD_LIMITS.taxId),
      branch: clampString(form.branch, 100),
      address,
      contactName: clampString(form.contactName, FIELD_LIMITS.contactName),
      phone: clampString(form.phone, FIELD_LIMITS.phone),
      email: clampString(form.email, FIELD_LIMITS.email),
      notes: clampString(form.notes, FIELD_LIMITS.notes),
      teamUids: activeTeam,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editing) {
        await updateDoc(doc(db, 'customers', editing.id), payload);
        toastSuccess('อัปเดตข้อมูลลูกค้าเรียบร้อย');
      } else {
        await addDoc(collection(db, 'customers'), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        toastSuccess('เพิ่มลูกค้าใหม่เรียบร้อย');
      }
      setShowModal(false);
    } catch (error) {
      handleFirestoreError(error, editing ? OperationType.UPDATE : OperationType.CREATE, 'customers');
    }
  };

  const handleDelete = async (c: Customer) => {
    const ok = await confirmDelete(c.companyName);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'customers', c.id));
      if (selectedAnalyticsId === c.id) setSelectedAnalyticsId(null);
      toastSuccess('ลบข้อมูลลูกค้าแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `customers/${c.id}`);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      <div className="flex flex-col items-center text-center gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            <ThaiText text="ฐานข้อมูลลูกค้าและวิเคราะห์ภาษี" />
          </h1>
          <p className="thai-subtitle mt-1.5 mb-0">
            <ThaiText text="บันทึกข้อมูลลูกค้าเพื่อดึงอัตโนมัติในใบเสนอราคา ใบแจ้งหนี้ และวิเคราะห์ยอดใช้บริการสะสม" />
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="figma-btn inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 whitespace-nowrap w-full sm:w-auto"
        >
          <Plus className="w-4 h-4 shrink-0" />
          เพิ่มลูกค้าใหม่
        </button>
      </div>

      {/* Search Bar */}
      <div className="figma-card p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            className="form-control !pl-9"
            placeholder="ค้นหาชื่อบริษัท, Tax ID, หรือชื่อผู้ติดต่อ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-500 font-mono-num shrink-0 text-end">
          ทั้งหมด {filteredCustomers.length} ราย
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Customer Table & Mobile Cards */}
        <div className={selectedCustomer ? 'xl:col-span-7' : 'xl:col-span-12'}>
          <div className="figma-card overflow-hidden">
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-200">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-10 px-4 text-sm text-slate-500">
                  <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  ยังไม่มีข้อมูลลูกค้าในระบบ
                </div>
              ) : (
                filteredCustomers.map((c) => {
                  const st = customerStats.get(c.id);
                  const isSelected = selectedAnalyticsId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setSelectedAnalyticsId(c.id)}
                      className={`p-4 space-y-2.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-slate-900 thai-prose">
                            {formatThaiLineBreaks(c.companyName)}
                          </div>
                          <div className="text-xs text-slate-500 font-mono-num mt-0.5">
                            Tax ID: {c.taxId || '-'} · {c.branch || 'สำนักงานใหญ่'}
                          </div>
                        </div>
                        <div className="text-end shrink-0 font-mono-num">
                          <div className="text-[11px] text-slate-500">ยอดสะสม</div>
                          <div className="text-sm font-bold text-slate-900">
                            ฿{formatTHB(st?.totalRevenue || 0)}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-[11px]">
                        <div>
                          <span className="text-slate-500 block">ผู้ติดต่อ</span>
                          <span className="font-medium text-slate-800 truncate block">
                            {c.contactName || '-'}
                          </span>
                          <span className="text-slate-500 font-mono-num">{c.phone || '-'}</span>
                        </div>
                        <div className="text-end font-mono-num">
                          <span className="text-slate-500 block">VAT สะสม</span>
                          <span className="font-semibold text-blue-700">฿{formatTHB(st?.totalVat || 0)}</span>
                        </div>
                        <div className="text-end font-mono-num">
                          <span className="text-slate-500 block">WHT สะสม</span>
                          <span className="font-semibold text-amber-700">฿{formatTHB(st?.totalWht || 0)}</span>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-2 pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onCreateQuotationForCustomer(c)}
                          className="btn btn-sm btn-outline-primary inline-flex items-center justify-center gap-1 flex-1 whitespace-nowrap"
                        >
                          <FilePlus2 className="w-3.5 h-3.5" />
                          ออกใบเสนอราคา
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className="btn btn-sm btn-light border"
                          title="แก้ไข"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="btn btn-sm btn-light border text-danger"
                          title="ลบ"
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
                    <th className="px-4 py-3">ชื่อบริษัท / ลูกค้า</th>
                    <th className="px-4 py-3">ผู้ติดต่อ</th>
                    <th className="px-4 py-3 text-end">ยอดใช้บริการสะสม</th>
                    <th className="px-4 py-3 text-end">VAT / WHT</th>
                    <th className="px-4 py-3 text-end">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-500">
                        <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        ยังไม่มีข้อมูลลูกค้าในระบบ
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => {
                      const st = customerStats.get(c.id);
                      const isSelected = selectedAnalyticsId === c.id;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedAnalyticsId(c.id)}
                          className={`cursor-pointer ${isSelected ? 'table-active' : ''}`}
                        >
                          <td className="px-4 py-3 wrap-cell">
                            <div className="font-semibold text-slate-900 thai-prose">
                              {formatThaiLineBreaks(c.companyName)}
                            </div>
                            <div className="text-xs text-slate-500 font-mono-num">
                              Tax ID: {c.taxId || '-'} · {c.branch || 'สำนักงานใหญ่'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-800">{c.contactName || '-'}</div>
                            <div className="text-xs text-slate-500 font-mono-num">{c.phone || '-'}</div>
                          </td>
                          <td className="px-4 py-3 text-end font-mono-num font-bold text-slate-900">
                            ฿{formatTHB(st?.totalRevenue || 0)}
                            <div className="text-xs font-normal text-slate-500">
                              {st?.projectCount || 0} โครงการ · {st?.docCount || 0} เอกสาร
                            </div>
                          </td>
                          <td className="px-4 py-3 text-end font-mono-num text-xs text-slate-600">
                            <div>VAT: ฿{formatTHB(st?.totalVat || 0)}</div>
                            <div>WHT: ฿{formatTHB(st?.totalWht || 0)}</div>
                          </td>
                          <td
                            className="px-4 py-3 text-end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onCreateQuotationForCustomer(c)}
                                className="btn btn-sm btn-outline-primary inline-flex items-center gap-1 whitespace-nowrap"
                                title="สร้างใบเสนอราคา"
                              >
                                <FilePlus2 className="w-3.5 h-3.5" />
                                ออกใบเสนอราคา
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(c)}
                                className="btn btn-sm btn-light border"
                                title="แก้ไข"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(c)}
                                className="btn btn-sm btn-light border text-danger"
                                title="ลบ"
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
        </div>

        {/* Customer Analytics Detail Drawer */}
        {selectedCustomer && (
          <div className="xl:col-span-5 figma-card p-4 sm:p-5 animate-figma-in">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-blue-700">Customer Tax &amp; Revenue Profile</div>
                <h3 className="thai-heading text-base font-bold text-slate-900 mt-0.5 mb-0">
                  {formatThaiLineBreaks(selectedCustomer.companyName)}
                </h3>
                <div className="thai-prose text-xs text-slate-500 mt-1">
                  {formatThaiLineBreaks(selectedCustomer.address)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAnalyticsId(null)}
                className="btn btn-sm btn-light border shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3 my-4">
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] sm:text-xs text-slate-500">รายได้สะสม</div>
                <div className="text-xs sm:text-sm font-bold font-mono-num text-slate-900 mt-1">
                  ฿{formatTHB(customerStats.get(selectedCustomer.id)?.totalRevenue || 0)}
                </div>
              </div>
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] sm:text-xs text-slate-500">VAT รวม</div>
                <div className="text-xs sm:text-sm font-bold font-mono-num text-blue-700 mt-1">
                  ฿{formatTHB(customerStats.get(selectedCustomer.id)?.totalVat || 0)}
                </div>
              </div>
              <div className="p-2.5 sm:p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[11px] sm:text-xs text-slate-500">ถูกหัก WHT</div>
                <div className="text-xs sm:text-sm font-bold font-mono-num text-amber-700 mt-1">
                  ฿{formatTHB(customerStats.get(selectedCustomer.id)?.totalWht || 0)}
                </div>
              </div>
            </div>

            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              ประวัติเอกสารกับลูกค้ารายนี้ ({selectedCustomerDocs.length})
            </h4>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {selectedCustomerDocs.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  ยังไม่มีเอกสารสำหรับลูกค้ารายนี้
                </div>
              ) : (
                selectedCustomerDocs.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 border border-slate-200 rounded-lg flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold font-mono-num text-slate-900">
                        {d.docNumber} · {d.type}
                      </div>
                      <div className="text-slate-500 truncate max-w-[220px]">{d.eventName}</div>
                    </div>
                    <div className="text-end font-mono-num">
                      <div className="font-bold text-slate-900">฿{formatTHB(d.grandTotal)}</div>
                      <div className="text-slate-500">{d.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Customer Modal (Bootstrap 5 Form) */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-xl animate-figma-modal overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">
                {editing ? 'แก้ไขข้อมูลลูกค้า' : 'เพิ่มข้อมูลลูกค้าใหม่'}
              </h3>
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
                <div className="col-md-8">
                  <label className="form-label">ชื่อบริษัท / ชื่อลูกค้า *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="เช่น บริษัท ตัวอย่าง จำกัด"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">สาขา</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="สำนักงานใหญ่"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                  <input
                    type="text"
                    className="form-control font-mono-num"
                    value={form.taxId}
                    onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                    placeholder="0-1055-00000-00-0"
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">ชื่อผู้ติดต่อ (Contact Person)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    className="form-control font-mono-num"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">อีเมล</label>
                  <input
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">ที่อยู่สำหรับออกเอกสารภาษี *</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    required
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">หมายเหตุเพิ่มเติม</label>
                  <input
                    type="text"
                    className="form-control"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
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
                  {editing ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูลลูกค้า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
