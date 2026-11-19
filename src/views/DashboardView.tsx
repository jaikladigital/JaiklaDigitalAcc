import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { AlertTriangle, Download, FileSpreadsheet, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { AccountingDocument, Expense, Project } from '../types/accounting';
import { exportMonthlyBudgetExcel, formatTHB, getMonthYearFromDate } from '../utils/formatters';
import { toastSuccess } from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';

interface DashboardViewProps {
  documents: AccountingDocument[];
  expenses: Expense[];
  projects: Project[];
  onNavigate: (tab: 'documents' | 'expenses' | 'emergency' | 'customers' | 'suppliers' | 'settings') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  documents,
  expenses,
  projects,
  onNavigate,
}) => {
  const [selectedYear, setSelectedYear] = useState<string>('all');

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    documents.forEach((d) => {
      if (d.docDate?.length >= 4) years.add(d.docDate.slice(0, 4));
    });
    expenses.forEach((e) => {
      if (e.monthYear?.length >= 4) years.add(e.monthYear.slice(0, 4));
    });
    if (years.size === 0) years.add(String(new Date().getFullYear()));
    return Array.from(years).sort().reverse();
  }, [documents, expenses]);

  // Revenue comes from issued/paid Invoices or Receipts (avoid double counting if REC references INV)
  const revenueDocs = useMemo(() => {
    const invIdsWithRec = new Set(
      documents.filter((d) => d.type === 'REC' && d.refDocId && d.status !== 'cancelled').map((d) => d.refDocId)
    );
    return documents.filter((d) => {
      if (d.status === 'cancelled' || d.type === 'QT') return false;
      if (d.type === 'INV' && invIdsWithRec.has(d.id)) return false;
      if (selectedYear !== 'all' && !d.docDate?.startsWith(selectedYear)) return false;
      return true;
    });
  }, [documents, selectedYear]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) =>
      selectedYear === 'all' ? true : e.monthYear?.startsWith(selectedYear)
    );
  }, [expenses, selectedYear]);

  const monthlyRows = useMemo(() => {
    const map = new Map<
      string,
      {
        monthYear: string;
        revenue: number;
        vatOutput: number;
        whtDeductedByClients: number;
        expenses: number;
        vatInput: number;
        whtWithheldFromSuppliers: number;
        netProfit: number;
      }
    >();

    const ensure = (m: string) => {
      if (!map.has(m)) {
        map.set(m, {
          monthYear: m,
          revenue: 0,
          vatOutput: 0,
          whtDeductedByClients: 0,
          expenses: 0,
          vatInput: 0,
          whtWithheldFromSuppliers: 0,
          netProfit: 0,
        });
      }
      return map.get(m)!;
    };

    revenueDocs.forEach((d) => {
      const m = getMonthYearFromDate(d.docDate);
      const row = ensure(m);
      row.revenue += d.subtotal;
      row.vatOutput += d.vatAmount;
      row.whtDeductedByClients += d.whtAmount;
    });

    filteredExpenses.forEach((e) => {
      const m = e.monthYear || getMonthYearFromDate(e.paymentDate);
      const row = ensure(m);
      row.expenses += e.amount;
      row.vatInput += e.vatAmount;
      row.whtWithheldFromSuppliers += e.whtAmount;
    });

    const arr = Array.from(map.values()).sort((a, b) => a.monthYear.localeCompare(b.monthYear));
    arr.forEach((r) => {
      r.netProfit = r.revenue - r.expenses;
    });
    return arr;
  }, [revenueDocs, filteredExpenses]);

  const totals = useMemo(() => {
    return monthlyRows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        vatOutput: acc.vatOutput + r.vatOutput,
        whtByClients: acc.whtByClients + r.whtDeductedByClients,
        expenses: acc.expenses + r.expenses,
        vatInput: acc.vatInput + r.vatInput,
        whtSuppliers: acc.whtSuppliers + r.whtWithheldFromSuppliers,
        netProfit: acc.netProfit + r.netProfit,
      }),
      {
        revenue: 0,
        vatOutput: 0,
        whtByClients: 0,
        expenses: 0,
        vatInput: 0,
        whtSuppliers: 0,
        netProfit: 0,
      }
    );
  }, [monthlyRows]);

  const handleExportExcel = () => {
    exportMonthlyBudgetExcel(
      selectedYear === 'all' ? 'All_Periods' : selectedYear,
      monthlyRows,
      documents,
      expenses
    );
    toastSuccess('ส่งออกไฟล์ Excel สำเร็จ', 'ดาวน์โหลดรายงานงบประมาณและภาษีรายเดือนแล้ว');
  };

  const pendingEmergency = useMemo(
    () =>
      expenses.filter(
        (e) =>
          e.isEmergencyCash &&
          (e.emergencyStatus === 'pending_reimburse' || !e.emergencyStatus)
      ),
    [expenses]
  );

  const pendingEmergencyTotal = useMemo(
    () => pendingEmergency.reduce((s, e) => s + e.netPaid, 0),
    [pendingEmergency]
  );

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      {/* Page Header & Action */}
      <div className="flex flex-col items-center text-center gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            {formatThaiLineBreaks('ภาพรวมงบประมาณและภาษีรายเดือน')}
          </h1>
          <p className="thai-prose text-xs sm:text-sm text-slate-500 mt-1.5 mb-0">
            {formatThaiLineBreaks(
              'สรุปรายรับ รายจ่าย กำไรสุทธิ ภาษีมูลค่าเพิ่ม (VAT ซื้อ-ขาย) และภาษีหัก ณ ที่จ่าย ของบริษัท'
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-2 w-full sm:w-auto">
          <select
            className="form-select w-full sm:w-auto sm:min-w-[150px]"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            aria-label="กรองตามปี"
          >
            <option value="all">ทุกปีงบประมาณ</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                ปี {y}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportExcel}
            className="figma-btn inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 rounded-xl hover:bg-emerald-800 whitespace-nowrap shrink-0 w-full sm:w-auto"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            Export Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Pending Emergency Cash Reimbursement Alert */}
      {pendingEmergency.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-xl border border-rose-200 bg-rose-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-rose-900 thai-prose">
                มีรายการค่าใช้จ่ายเงินสดฉุกเฉินรอตรวจสอบ / เบิกคืน {pendingEmergency.length} รายการ (รวม ฿{formatTHB(pendingEmergencyTotal)})
              </div>
              <div className="text-xs text-rose-700 mt-0.5 thai-prose">
                ตรวจสอบรูปใบเสร็จ พิมพ์ใบเบิก A4 หรือส่งแจ้งเตือน LINE @421khbew ได้ทันที
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('emergency')}
            className="figma-btn px-3.5 py-2 text-xs font-semibold text-white bg-rose-700 rounded-xl hover:bg-rose-800 whitespace-nowrap w-full sm:w-auto shrink-0"
          >
            จัดการเบิกจ่ายฉุกเฉิน
          </button>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>รายรับรวม (ก่อน VAT)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-num mt-2">
            ฿{formatTHB(totals.revenue)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            VAT ขาย: <span className="font-mono-num font-semibold">฿{formatTHB(totals.vatOutput)}</span>
          </div>
        </div>

        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>รายจ่ายโครงการ (ก่อน VAT)</span>
            <ArrowDownRight className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-num mt-2">
            ฿{formatTHB(totals.expenses)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            VAT ซื้อ: <span className="font-mono-num font-semibold">฿{formatTHB(totals.vatInput)}</span>
          </div>
        </div>

        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>กำไรสุทธิขั้นต้น (Net Profit)</span>
            <TrendingUp className="w-4 h-4 text-blue-700" />
          </div>
          <div
            className={`text-2xl font-bold font-mono-num mt-2 ${
              totals.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            ฿{formatTHB(totals.netProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            โครงการที่ดูแล: <span className="font-mono-num font-semibold">{projects.length}</span> งาน
          </div>
        </div>

        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>ภาษีหัก ณ ที่จ่าย (WHT)</span>
            <Download className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono-num mt-2">
            ฿{formatTHB(totals.whtSuppliers)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            ลูกค้าหักเรา: <span className="font-mono-num font-semibold">฿{formatTHB(totals.whtByClients)}</span>
          </div>
        </div>
      </div>

      {/* Chart + Quick Summary Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 figma-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 m-0">
                กราฟเปรียบเทียบรายรับ - รายจ่าย - กำไรรายเดือน
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-0">
                คำนวณอัตโนมัติจากเอกสารแจ้งหนี้/ใบเสร็จ และบันทึกรายจ่ายโครงการ
              </p>
            </div>
          </div>

          {monthlyRows.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50 text-center p-6">
              <p className="text-sm font-medium text-slate-700 mb-2">
                ยังไม่มีข้อมูลรายรับหรือรายจ่ายในระบบ
              </p>
              <p className="text-xs text-slate-500 mb-4">
                เริ่มต้นด้วยการออกใบเสนอราคา/ใบแจ้งหนี้ หรือบันทึกรายจ่ายโครงการ
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('documents')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  ไปหน้าออกเอกสาร
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('expenses')}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  บันทึกรายจ่าย
                </button>
              </div>
            </div>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="monthYear" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val) => `฿${formatTHB(Number(val ?? 0))}`}
                    contentStyle={{
                      borderRadius: '10px',
                      borderColor: '#e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="revenue" name="รายรับ" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="รายจ่าย" fill="#e11d48" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netProfit" name="กำไรสุทธิ" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Tax Position Panel */}
        <div className="lg:col-span-4 figma-card p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">
              สรุปสถานะภาษี (Tax Ledger)
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              เปรียบเทียบ VAT ขาย - VAT ซื้อ และยอดนำส่ง ภ.ง.ด. 3 / 53
            </p>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">ภาษีขาย (Output VAT)</span>
                <span className="font-mono-num font-semibold text-slate-900">
                  ฿{formatTHB(totals.vatOutput)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">ภาษีซื้อ (Input VAT)</span>
                <span className="font-mono-num font-semibold text-slate-900">
                  ฿{formatTHB(totals.vatInput)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2.5 bg-slate-50 px-3 rounded-lg">
                <span className="font-semibold text-slate-800">ส่วนต่าง VAT สุทธิ (ภ.พ.30)</span>
                <span className="font-mono-num font-bold text-blue-700">
                  ฿{formatTHB(totals.vatOutput - totals.vatInput)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-600">หัก ณ ที่จ่ายซัพพลายเยอร์ (ต้องนำส่ง)</span>
                <span className="font-mono-num font-semibold text-amber-700">
                  ฿{formatTHB(totals.whtSuppliers)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-slate-600">ลูกค้าหัก ณ ที่จ่ายเรา (เครดิตภาษี)</span>
                <span className="font-mono-num font-semibold text-emerald-700">
                  ฿{formatTHB(totals.whtByClients)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            ข้อมูลอัปเดตแบบ Real-time จาก Cloud Firestore
          </div>
        </div>
      </div>

      {/* Monthly Table Breakdown */}
      <div className="figma-card overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0 thai-heading">
            ตารางสรุปงบประมาณรายเดือน
          </h2>
          <span className="text-xs text-slate-500 font-mono-num shrink-0">{monthlyRows.length} เดือน</span>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-200">
          {monthlyRows.length === 0 ? (
            <div className="text-center py-8 px-4 text-sm text-slate-500">
              ยังไม่มีรายการสำหรับแสดงผล
            </div>
          ) : (
            monthlyRows.map((r) => (
              <div key={r.monthYear} className="p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono-num font-bold text-sm text-slate-900">{r.monthYear}</span>
                  <span
                    className={`font-mono-num font-bold text-sm ${
                      r.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    กำไรสุทธิ ฿{formatTHB(r.netProfit)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100 font-mono-num">
                  <div>
                    <span className="text-slate-500 block">รายรับ (ก่อน VAT)</span>
                    <span className="font-semibold text-slate-900">฿{formatTHB(r.revenue)}</span>
                  </div>
                  <div className="text-end">
                    <span className="text-slate-500 block">VAT ขาย</span>
                    <span className="text-slate-700">฿{formatTHB(r.vatOutput)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">รายจ่าย</span>
                    <span className="font-semibold text-rose-700">฿{formatTHB(r.expenses)}</span>
                  </div>
                  <div className="text-end">
                    <span className="text-slate-500 block">VAT ซื้อ</span>
                    <span className="text-slate-700">฿{formatTHB(r.vatInput)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">WHT หักซัพฯ</span>
                    <span className="text-amber-700 font-semibold">฿{formatTHB(r.whtWithheldFromSuppliers)}</span>
                  </div>
                  <div className="text-end">
                    <span className="text-slate-500 block">ลูกค้าหัก WHT</span>
                    <span className="text-emerald-700 font-semibold">฿{formatTHB(r.whtDeductedByClients)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Tablet & Desktop Table */}
        <div className="hidden md:block table-responsive">
          <table className="table table-hover align-middle mb-0 text-sm">
            <thead className="table-light">
              <tr>
                <th className="px-4 py-3">เดือน (YYYY-MM)</th>
                <th className="px-4 py-3 text-end">รายรับ (ก่อน VAT)</th>
                <th className="px-4 py-3 text-end">VAT ขาย</th>
                <th className="px-4 py-3 text-end">รายจ่าย</th>
                <th className="px-4 py-3 text-end">VAT ซื้อ</th>
                <th className="px-4 py-3 text-end">WHT หักซัพฯ</th>
                <th className="px-4 py-3 text-end">ลูกค้าหัก WHT</th>
                <th className="px-4 py-3 text-end">กำไรสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500">
                    ยังไม่มีรายการสำหรับแสดงผล
                  </td>
                </tr>
              ) : (
                monthlyRows.map((r) => (
                  <tr key={r.monthYear}>
                    <td className="px-4 py-3 font-mono-num font-semibold text-slate-900">
                      {r.monthYear}
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num">฿{formatTHB(r.revenue)}</td>
                    <td className="px-4 py-3 text-end font-mono-num text-slate-600">
                      ฿{formatTHB(r.vatOutput)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num text-rose-700">
                      ฿{formatTHB(r.expenses)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num text-slate-600">
                      ฿{formatTHB(r.vatInput)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num text-amber-700">
                      ฿{formatTHB(r.whtWithheldFromSuppliers)}
                    </td>
                    <td className="px-4 py-3 text-end font-mono-num text-emerald-700">
                      ฿{formatTHB(r.whtDeductedByClients)}
                    </td>
                    <td
                      className={`px-4 py-3 text-end font-mono-num font-bold ${
                        r.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      ฿{formatTHB(r.netProfit)}
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
};
