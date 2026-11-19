import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Layers, Pencil, Plus, Scale, Search, Star, Trash2, X } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  Expense,
  FIELD_LIMITS,
  ServiceCategory,
  Supplier,
  clampString,
} from '../types/accounting';
import { formatTHB } from '../utils/formatters';
import { confirmDelete, toastError, toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { ThaiText } from '../components/ThaiText';

interface SuppliersViewProps {
  suppliers: Supplier[];
  categories: ServiceCategory[];
  expenses: Expense[];
  teamUids: string[];
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  categories,
  expenses,
  teamUids,
}) => {
  const [subTab, setSubTab] = useState<'directory' | 'compare' | 'categories'>('directory');
  const [search, setSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Supplier Modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    taxId: '',
    entityType: 'corporate' as 'corporate' | 'individual',
    address: '',
    contactName: '',
    phone: '',
    email: '',
    categoryId: '',
    baseRate: 0,
    unit: 'งาน',
    rating: 5,
    notes: '',
  });

  // Category Modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<ServiceCategory | null>(null);
  const [catForm, setCatForm] = useState({
    name: '',
    description: '',
    defaultWhtRate: 3,
  });

  const workCountBySupplier = useMemo(() => {
    const map = new Map<string, { jobs: number; totalPaid: number }>();
    expenses.forEach((e) => {
      if (!e.supplierId) return;
      const cur = map.get(e.supplierId) || { jobs: 0, totalPaid: 0 };
      cur.jobs += 1;
      cur.totalPaid += e.amount;
      map.set(e.supplierId, cur);
    });
    return map;
  }, [expenses]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (selectedCategoryFilter !== 'all' && s.categoryId !== selectedCategoryFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.taxId || '').toLowerCase().includes(q) ||
        (s.categoryName || '').toLowerCase().includes(q)
      );
    });
  }, [suppliers, search, selectedCategoryFilter]);

  const compareSuppliers = useMemo(() => {
    const list =
      selectedCategoryFilter === 'all'
        ? suppliers
        : suppliers.filter((s) => s.categoryId === selectedCategoryFilter);
    return [...list].sort((a, b) => a.baseRate - b.baseRate);
  }, [suppliers, selectedCategoryFilter]);

  const lowestRate = compareSuppliers.length > 0 ? compareSuppliers[0].baseRate : null;

  const openAddSupplier = () => {
    if (categories.length === 0) {
      toastError('กรุณาสร้างประเภทบริการก่อน', 'เพิ่มประเภทบริการในแท็บ "จัดการประเภทบริการ" อย่างน้อย 1 รายการ');
      setSubTab('categories');
      return;
    }
    setEditingSupplier(null);
    setSupplierForm({
      name: '',
      taxId: '',
      entityType: 'corporate',
      address: '',
      contactName: '',
      phone: '',
      email: '',
      categoryId: categories[0].id,
      baseRate: 0,
      unit: 'งาน',
      rating: 5,
      notes: '',
    });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name,
      taxId: s.taxId || '',
      entityType: s.entityType,
      address: s.address || '',
      contactName: s.contactName || '',
      phone: s.phone || '',
      email: s.email || '',
      categoryId: s.categoryId,
      baseRate: s.baseRate,
      unit: s.unit || 'งาน',
      rating: s.rating ?? 5,
      notes: s.notes || '',
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const cat = categories.find((c) => c.id === supplierForm.categoryId);
    if (!cat) {
      toastError('กรุณาเลือกประเภทบริการ');
      return;
    }

    const name = clampString(supplierForm.name, FIELD_LIMITS.companyName);
    if (!name) {
      toastError('กรุณากรอกชื่อซัพพลายเยอร์');
      return;
    }

    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    const payload = {
      name,
      taxId: clampString(supplierForm.taxId, FIELD_LIMITS.taxId),
      entityType: supplierForm.entityType,
      address: clampString(supplierForm.address, FIELD_LIMITS.address),
      contactName: clampString(supplierForm.contactName, FIELD_LIMITS.contactName),
      phone: clampString(supplierForm.phone, FIELD_LIMITS.phone),
      email: clampString(supplierForm.email, FIELD_LIMITS.email),
      categoryId: cat.id,
      categoryName: clampString(cat.name, 150),
      baseRate: Number(supplierForm.baseRate) || 0,
      unit: clampString(supplierForm.unit, 60) || 'งาน',
      rating: Math.min(5, Math.max(1, Number(supplierForm.rating) || 5)),
      notes: clampString(supplierForm.notes, FIELD_LIMITS.notes),
      teamUids: activeTeam,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), payload);
        toastSuccess('อัปเดตข้อมูลซัพพลายเยอร์เรียบร้อย');
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        toastSuccess('เพิ่มซัพพลายเยอร์เรียบร้อย');
      }
      setShowSupplierModal(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingSupplier ? OperationType.UPDATE : OperationType.CREATE,
        'suppliers'
      );
    }
  };

  const handleDeleteSupplier = async (s: Supplier) => {
    const ok = await confirmDelete(s.name);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'suppliers', s.id));
      toastSuccess('ลบซัพพลายเยอร์แล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${s.id}`);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const name = clampString(catForm.name, 150);
    if (!name) {
      toastError('กรุณากรอกชื่อประเภทบริการ');
      return;
    }

    const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);

    const payload = {
      name,
      description: clampString(catForm.description, 500),
      defaultWhtRate: Math.min(30, Math.max(0, Number(catForm.defaultWhtRate) || 0)),
      teamUids: activeTeam,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingCat) {
        await updateDoc(doc(db, 'service_categories', editingCat.id), payload);
        toastSuccess('อัปเดตประเภทบริการแล้ว');
      } else {
        await addDoc(collection(db, 'service_categories'), {
          ...payload,
          createdBy: uid,
          createdAt: serverTimestamp(),
        });
        toastSuccess('เพิ่มประเภทบริการใหม่แล้ว');
      }
      setShowCatModal(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingCat ? OperationType.UPDATE : OperationType.CREATE,
        'service_categories'
      );
    }
  };

  const handleDeleteCategory = async (c: ServiceCategory) => {
    const ok = await confirmDelete(c.name);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'service_categories', c.id));
      toastSuccess('ลบประเภทบริการแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `service_categories/${c.id}`);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      <div className="flex flex-col items-center text-center gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            <ThaiText text="ซัพพลายเยอร์และเปรียบเทียบราคา" />
          </h1>
          <p className="thai-subtitle mt-1.5 mb-0">
            <ThaiText text="จัดการฐานข้อมูลคู่ค้า เทียบเรทราคาตามประเภทบริการ และปรับแต่งหมวดหมู่ค่าใช้จ่ายได้เอง" />
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setEditingCat(null);
              setCatForm({ name: '', description: '', defaultWhtRate: 3 });
              setShowCatModal(true);
            }}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 whitespace-nowrap"
          >
            <Layers className="w-4 h-4 shrink-0" />
            เพิ่มประเภทบริการ
          </button>
          <button
            type="button"
            onClick={openAddSupplier}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            เพิ่มซัพพลายเยอร์
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:inline-flex items-center gap-1.5 sm:gap-1 p-1.5 sm:p-1 bg-slate-200/70 rounded-xl w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('directory')}
            className={`min-h-[40px] sm:min-h-0 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap text-center ${
              subTab === 'directory' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            รายชื่อซัพพลายเยอร์ ({suppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('compare')}
            className={`min-h-[40px] sm:min-h-0 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
              subTab === 'compare' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Scale className="w-3.5 h-3.5 shrink-0" />
            เปรียบเทียบราคาตามบริการ
          </button>
          <button
            type="button"
            onClick={() => setSubTab('categories')}
            className={`min-h-[40px] sm:min-h-0 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap text-center ${
              subTab === 'categories' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            จัดการประเภทบริการ ({categories.length})
          </button>
        </div>

        {subTab !== 'categories' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
            <select
              className="form-select w-full sm:w-auto sm:min-w-[190px]"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="all">ทุกประเภทบริการ</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {subTab === 'directory' && (
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  className="form-control !pl-9"
                  placeholder="ค้นหาซัพพลายเยอร์..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Directory Tab */}
      {subTab === 'directory' && (
        <div className="figma-card overflow-hidden">
          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-slate-200">
            {filteredSuppliers.length === 0 ? (
              <div className="text-center py-10 px-4 text-sm text-slate-500">
                ยังไม่มีข้อมูลซัพพลายเยอร์ในหมวดที่เลือก
              </div>
            ) : (
              filteredSuppliers.map((s) => {
                const stats = workCountBySupplier.get(s.id);
                return (
                  <div key={s.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 thai-prose">
                          {formatThaiLineBreaks(s.name)}
                        </div>
                        <div className="text-xs text-slate-500 font-mono-num mt-0.5">
                          {s.entityType === 'corporate' ? 'นิติบุคคล (ภ.ง.ด.53)' : 'บุคคลธรรมดา (ภ.ง.ด.3)'} · Tax: {s.taxId || '-'}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold font-mono-num shrink-0">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        {s.rating || 5}/5
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">หมวดบริการ</span>
                        <span className="font-medium text-slate-800 truncate block">
                          {s.categoryName || '-'}
                        </span>
                      </div>
                      <div className="text-end font-mono-num">
                        <span className="text-slate-500 block">เรทมาตรฐาน</span>
                        <span className="font-bold text-slate-900">
                          ฿{formatTHB(s.baseRate)}/{s.unit || 'งาน'}
                        </span>
                      </div>
                      <div className="text-end font-mono-num">
                        <span className="text-slate-500 block">จ้างงาน ({stats?.jobs || 0})</span>
                        <span className="font-semibold text-slate-700">฿{formatTHB(stats?.totalPaid || 0)}</span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditSupplier(s)}
                        className="btn btn-sm btn-light border inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSupplier(s)}
                        className="btn btn-sm btn-light border text-danger inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        ลบ
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
                  <th className="px-4 py-3">ชื่อซัพพลายเยอร์ / นิติบุคคล</th>
                  <th className="px-4 py-3">ประเภทบริการ</th>
                  <th className="px-4 py-3 text-end">เรทราคามาตรฐาน</th>
                  <th className="px-4 py-3 text-center">ประวัติจ้างงาน</th>
                  <th className="px-4 py-3 text-center">คะแนน</th>
                  <th className="px-4 py-3 text-end">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-500">
                      ยังไม่มีข้อมูลซัพพลายเยอร์ในหมวดที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s) => {
                    const stats = workCountBySupplier.get(s.id);
                    return (
                      <tr key={s.id}>
                        <td className="px-4 py-3 wrap-cell">
                          <div className="font-semibold text-slate-900 thai-prose">
                            {formatThaiLineBreaks(s.name)}
                          </div>
                          <div className="text-xs text-slate-500 font-mono-num">
                            {s.entityType === 'corporate' ? 'นิติบุคคล (ภ.ง.ด.53)' : 'บุคคลธรรมดา (ภ.ง.ด.3)'} ·
                            Tax ID: {s.taxId || '-'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 wrap-cell">
                          {formatThaiLineBreaks(s.categoryName || '-')}
                        </td>
                        <td className="px-4 py-3 text-end font-mono-num font-bold text-slate-900">
                          ฿{formatTHB(s.baseRate)}
                          <span className="text-xs font-normal text-slate-500"> / {s.unit || 'งาน'}</span>
                        </td>
                        <td className="px-4 py-3 text-center font-mono-num">
                          <div className="font-semibold">{stats?.jobs || 0} ครั้ง</div>
                          <div className="text-xs text-slate-500">
                            ฿{formatTHB(stats?.totalPaid || 0)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-amber-600 font-semibold font-mono-num">
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            {s.rating || 5}/5
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditSupplier(s)}
                              className="btn btn-sm btn-light border"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSupplier(s)}
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
      )}

      {/* Comparison Matrix Tab */}
      {subTab === 'compare' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {compareSuppliers.length === 0 ? (
            <div className="col-span-full figma-card p-8 text-center text-slate-500">
              ยังไม่มีซัพพลายเยอร์สำหรับเปรียบเทียบราคาในหมวดนี้
            </div>
          ) : (
            compareSuppliers.map((s) => {
              const isCheapest = lowestRate !== null && s.baseRate === lowestRate;
              const stats = workCountBySupplier.get(s.id);
              return (
                <div
                  key={s.id}
                  className={`figma-card figma-card-interactive p-5 flex flex-col justify-between ${
                    isCheapest ? 'border-emerald-500' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{s.categoryName || '-'}</span>
                      {isCheapest && (
                        <span className="font-semibold text-emerald-700">ราคาต่ำสุดในหมวด</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1.5 mb-1">{s.name}</h3>
                    <div className="text-xs text-slate-500">
                      {s.contactName ? `ผู้ติดต่อ: ${s.contactName}` : ''} · {s.phone || '-'}
                    </div>

                    <div className="my-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-xs text-slate-500">เรทราคาเปรียบเทียบ</div>
                      <div className="text-xl font-bold font-mono-num text-slate-900 mt-0.5">
                        ฿{formatTHB(s.baseRate)}{' '}
                        <span className="text-xs font-normal text-slate-500">/ {s.unit || 'งาน'}</span>
                      </div>
                    </div>

                    {s.notes && <p className="text-xs text-slate-600 mb-3">{s.notes}</p>}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>ประวัติจ้างงาน: {stats?.jobs || 0} ครั้ง</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      {s.rating || 5}/5
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Dynamic Service Categories Tab */}
      {subTab === 'categories' && (
        <div className="figma-card overflow-hidden">
          <div className="md:hidden divide-y divide-slate-200">
            {categories.map((c) => {
              const count = suppliers.filter((s) => s.categoryId === c.id).length;
              return (
                <div key={c.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 thai-prose">{c.name}</div>
                    <div className="text-xs text-slate-500 thai-prose mt-0.5">{c.description || '-'}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs font-mono-num text-slate-600">
                      <span>WHT เริ่มต้น: <strong className="text-slate-900">{c.defaultWhtRate}%</strong></span>
                      <span>ซัพพลายเยอร์: <strong className="text-slate-900">{count}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCat(c);
                        setCatForm({
                          name: c.name,
                          description: c.description || '',
                          defaultWhtRate: c.defaultWhtRate,
                        });
                        setShowCatModal(true);
                      }}
                      className="btn btn-sm btn-light border"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c)}
                      className="btn btn-sm btn-light border text-danger"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block table-responsive">
            <table className="table table-hover align-middle mb-0 text-sm">
              <thead className="table-light">
                <tr>
                  <th className="px-4 py-3">ชื่อประเภทบริการ</th>
                  <th className="px-4 py-3">รายละเอียด</th>
                  <th className="px-4 py-3 text-center">อัตรา WHT เริ่มต้น</th>
                  <th className="px-4 py-3 text-center">จำนวนซัพพลายเยอร์</th>
                  <th className="px-4 py-3 text-end">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const count = suppliers.filter((s) => s.categoryId === c.id).length;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                      <td className="px-4 py-3 text-slate-600">{c.description || '-'}</td>
                      <td className="px-4 py-3 text-center font-mono-num font-semibold">
                        {c.defaultWhtRate}%
                      </td>
                      <td className="px-4 py-3 text-center font-mono-num">{count}</td>
                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCat(c);
                              setCatForm({
                                name: c.name,
                                description: c.description || '',
                                defaultWhtRate: c.defaultWhtRate,
                              });
                              setShowCatModal(true);
                            }}
                            className="btn btn-sm btn-light border"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(c)}
                            className="btn btn-sm btn-light border text-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl shadow-xl animate-figma-modal overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">
                {editingSupplier ? 'แก้ไขข้อมูลซัพพลายเยอร์' : 'เพิ่มซัพพลายเยอร์ใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="p-5">
              <div className="row g-3">
                <div className="col-md-7">
                  <label className="form-label">ชื่อซัพพลายเยอร์ / ฟรีแลนซ์ *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  />
                </div>
                <div className="col-md-5">
                  <label className="form-label">ประเภทผู้เสียภาษี (สำหรับ 50 ทวิ) *</label>
                  <select
                    className="form-select"
                    value={supplierForm.entityType}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        entityType: e.target.value as 'corporate' | 'individual',
                      })
                    }
                  >
                    <option value="corporate">นิติบุคคล (ภ.ง.ด. 53)</option>
                    <option value="individual">บุคคลธรรมดา (ภ.ง.ด. 3)</option>
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">ประเภทบริการ *</label>
                  <select
                    className="form-select"
                    value={supplierForm.categoryId}
                    onChange={(e) => setSupplierForm({ ...supplierForm, categoryId: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (WHT {c.defaultWhtRate}%)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label">เลขประจำตัวผู้เสียภาษี / บัตรประชาชน</label>
                  <input
                    type="text"
                    className="form-control font-mono-num"
                    value={supplierForm.taxId}
                    onChange={(e) => setSupplierForm({ ...supplierForm, taxId: e.target.value })}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">เรทราคามาตรฐาน (บาท)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control font-mono-num"
                    value={supplierForm.baseRate}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, baseRate: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">หน่วย</label>
                  <input
                    type="text"
                    className="form-control"
                    value={supplierForm.unit}
                    onChange={(e) => setSupplierForm({ ...supplierForm, unit: e.target.value })}
                    placeholder="งาน / วัน / ชิ้น"
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label">คะแนนคุณภาพ (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    className="form-control font-mono-num"
                    value={supplierForm.rating}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, rating: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">ผู้ติดต่อ</label>
                  <input
                    type="text"
                    className="form-control"
                    value={supplierForm.contactName}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, contactName: e.target.value })
                    }
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    className="form-control font-mono-num"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">ที่อยู่ (สำหรับออกหนังสือรับรอง 50 ทวิ)</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">หมายเหตุ / จุดเด่น</label>
                  <input
                    type="text"
                    className="form-control"
                    value={supplierForm.notes}
                    onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="btn btn-light border"
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary px-4 fw-semibold">
                  บันทึกข้อมูลซัพพลายเยอร์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service Category Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md shadow-xl animate-figma-modal overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 m-0">
                {editingCat ? 'แก้ไขประเภทบริการ' : 'เพิ่มประเภทบริการใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="p-5 space-y-3">
              <div>
                <label className="form-label">ชื่อประเภทบริการ *</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  placeholder="เช่น Production & Video Shooting"
                />
              </div>
              <div>
                <label className="form-label">อัตราหัก ณ ที่จ่ายเริ่มต้น (%)</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="0.5"
                  className="form-control font-mono-num"
                  value={catForm.defaultWhtRate}
                  onChange={(e) =>
                    setCatForm({ ...catForm, defaultWhtRate: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="form-label">คำอธิบาย</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCatModal(false)}
                  className="btn btn-light border"
                >
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary px-4 fw-semibold">
                  บันทึกประเภทบริการ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
