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
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  Landmark,
  Printer,
  RefreshCw,
  Save,
  TrendingUp,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AccountingDocument,
  AnnualFinancialLedger,
  CompanyProfile,
  Expense,
} from '../types/accounting';
import { formatTHB } from '../utils/formatters';
import {
  AUDITED_BASELINES_BY_YEAR,
  buildLiveLedgerFromApp,
  computeStatementMetrics,
  exportAnnualDbdPackageExcel,
  HISTORICAL_YEARS_BE,
  LATEST_OFFICE_ADDRESS_2569_PLUS,
  LedgerDraft,
  resolveOfficeAddressForYear,
} from '../utils/financialStatements';
import { formatThaiLineBreaks } from '../utils/thaiText';
import { toastError, toastSuccess } from '../utils/swal';
import { FinancialStatementPrintModal } from '../components/FinancialStatementPrintModal';
import { ThaiText } from '../components/ThaiText';

interface AnnualReportsViewProps {
  documents: AccountingDocument[];
  expenses: Expense[];
  company: CompanyProfile;
  annualLedgers: AnnualFinancialLedger[];
  teamUids: string[];
}

function fmtDiffPct(cur: number, prev: number): string {
  if (Math.abs(prev) < 0.01) return cur === 0 ? '0.0%' : '+100%';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export const AnnualReportsView: React.FC<AnnualReportsViewProps> = ({
  documents,
  expenses,
  company,
  annualLedgers,
  teamUids,
}) => {
  const [selectedYearBe, setSelectedYearBe] = useState<number>(2568);
  const [subTab, setSubTab] = useState<'analysis' | 'statements' | 'notes' | 'filing'>('analysis');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAllHistory, setSavingAllHistory] = useState(false);

  // Resolve persisted or baseline ledger for any fiscal year BE (2562 - 2570)
  const getLedgerForYear = (yearBe: number): LedgerDraft => {
    const saved = annualLedgers.find((l) => l.fiscalYearBe === yearBe);
    if (saved) {
      const { id: _id, createdBy: _cb, teamUids: _tu, createdAt: _ca, updatedAt: _ua, ...rest } = saved;
      return rest;
    }
    if (AUDITED_BASELINES_BY_YEAR[yearBe]) {
      return AUDITED_BASELINES_BY_YEAR[yearBe];
    }
    if (yearBe < 2562) {
      return {
        ...AUDITED_BASELINES_BY_YEAR[2562],
        fiscalYearBe: yearBe,
        fiscalYearCe: yearBe - 543,
        cashOnHand: 0,
        cashAtBank: 0,
        tradeReceivables: 0,
        accruedInterestReceivable: 0,
        withholdingTaxAsset: 0,
        revenueDeptReceivable: 0,
        prepaidExpenses: 0,
        workInProgress: 0,
        otherCurrentAssets: 0,
        relatedPartyLoan: 0,
        equipmentOfficeCost: 0,
        equipmentOfficeAccumDep: 0,
        equipmentOfficeDepYear: 0,
        accruedExpenses: 0,
        withholdingTaxPayable: 0,
        paidUpCapital: 0,
        retainedEarningsOpening: 0,
        serviceRevenue: 0,
        otherIncome: 0,
        costOfServices: 0,
        sellingExpenses: 0,
        adminExpenses: 0,
      };
    }
    const prev =
      yearBe === 2569 ? AUDITED_BASELINES_BY_YEAR[2568] : undefined;
    return buildLiveLedgerFromApp(yearBe - 543, documents, expenses, company, prev);
  };

  const [draftOverride, setDraftOverride] = useState<Record<number, LedgerDraft>>({});

  const currentLedger: LedgerDraft =
    draftOverride[selectedYearBe] || getLedgerForYear(selectedYearBe);
  const previousLedger: LedgerDraft =
    draftOverride[selectedYearBe - 1] || getLedgerForYear(selectedYearBe - 1);

  const cur = useMemo(() => computeStatementMetrics(currentLedger), [currentLedger]);
  const prev = useMemo(() => computeStatementMetrics(previousLedger), [previousLedger]);

  const updateField = <K extends keyof LedgerDraft>(field: K, value: LedgerDraft[K]) => {
    setDraftOverride((p) => ({
      ...p,
      [selectedYearBe]: {
        ...currentLedger,
        [field]: value,
      },
    }));
  };

  const handleSyncFromLiveRecords = () => {
    const synced = buildLiveLedgerFromApp(
      selectedYearBe - 543,
      documents,
      expenses,
      company,
      previousLedger
    );
    setDraftOverride((p) => ({ ...p, [selectedYearBe]: synced }));
    toastSuccess(
      `ดึงยอดรายรับและรายจ่ายจริงปี ${selectedYearBe} จากระบบเรียบร้อย`,
      'ตรวจสอบยอดเงินสดปลายปีและค่าเสื่อมราคาในแท็บ "งบฐานะการเงินและงบกำไรขาดทุน" ก่อนบันทึก'
    );
  };

  const handleResetToAuditedBaseline = () => {
    const base = AUDITED_BASELINES_BY_YEAR[selectedYearBe];
    if (base) {
      setDraftOverride((p) => ({ ...p, [selectedYearBe]: base }));
      toastSuccess(`โหลดตัวเลขงบฐานะการเงินปี ${selectedYearBe} จากชุดข้อมูลบริษัทเรียบร้อย`);
    }
  };

  const latestExpectedAddress = useMemo(
    () => resolveOfficeAddressForYear(selectedYearBe, company),
    [selectedYearBe, company]
  );

  const isAddressOutdatedFor2569Plus =
    selectedYearBe >= 2569 &&
    (currentLedger.businessAddress || '').trim() !== latestExpectedAddress.trim();

  const handleApplyLatestCompanyToYear = async (saveImmediately = true) => {
    const cleanTaxId = (company.taxId || '0105562067888').replace(/\D/g, '') || '0105562067888';
    const nextAddress =
      selectedYearBe >= 2569
        ? latestExpectedAddress
        : company.address && company.address !== 'กรุงเทพมหานคร ประเทศไทย'
          ? company.address
          : LATEST_OFFICE_ADDRESS_2569_PLUS;
    const nextDirector = (company.directorName || '').trim() || currentLedger.directorName;

    const updatedLedger: LedgerDraft = {
      ...currentLedger,
      businessAddress: nextAddress,
      registrationNumber: cleanTaxId,
      directorName: nextDirector,
    };
    setDraftOverride((p) => ({ ...p, [selectedYearBe]: updatedLedger }));

    if (!saveImmediately) {
      toastSuccess(`อัปเดตที่ตั้งสำนักงานล่าสุดลงร่างงบปี ${selectedYearBe} แล้ว`);
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastSuccess(`อัปเดตที่ตั้งสำนักงานล่าสุดลงร่างงบปี ${selectedYearBe} แล้ว`);
      return;
    }

    setSaving(true);
    try {
      const ledgerId = `year_${selectedYearBe}`;
      const existing = annualLedgers.find((l) => l.id === ledgerId);
      const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, 30);

      await setDoc(doc(db, 'annual_ledgers', ledgerId), {
        ...updatedLedger,
        createdBy: existing?.createdBy || uid,
        teamUids: activeTeam,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toastSuccess(
        `อัปเดตที่ตั้งสำนักงานล่าสุดเข้าสู่งบปี ${selectedYearBe} เรียบร้อย`,
        nextAddress
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `annual_ledgers/year_${selectedYearBe}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLedger = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastError('กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล');
      return;
    }
    setSaving(true);
    try {
      const ledgerId = `year_${selectedYearBe}`;
      const existing = annualLedgers.find((l) => l.id === ledgerId);
      const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, 30);

      await setDoc(doc(db, 'annual_ledgers', ledgerId), {
        ...currentLedger,
        createdBy: existing?.createdBy || uid,
        teamUids: activeTeam,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toastSuccess(`บันทึกข้อมูลงบการเงินประจำปี ${selectedYearBe} ลงฐานข้อมูลเรียบร้อย`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `annual_ledgers/year_${selectedYearBe}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllHistoricalYears = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastError('กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล');
      return;
    }
    setSavingAllHistory(true);
    try {
      const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, 30);
      await Promise.all(
        HISTORICAL_YEARS_BE.map((yr) => {
          const ledgerId = `year_${yr}`;
          const existing = annualLedgers.find((l) => l.id === ledgerId);
          return setDoc(doc(db, 'annual_ledgers', ledgerId), {
            ...AUDITED_BASELINES_BY_YEAR[yr],
            createdBy: existing?.createdBy || uid,
            teamUids: activeTeam,
            createdAt: existing?.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        })
      );
      toastSuccess(
        'บันทึกงบการเงินย้อนหลัง 7 ปี (พ.ศ. 2562–2568) ลงฐานข้อมูลครบถ้วนแล้ว'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'annual_ledgers/batch_2562_2568');
    } finally {
      setSavingAllHistory(false);
    }
  };

  const sevenYearSeries = useMemo(() => {
    return HISTORICAL_YEARS_BE.map((yr) => {
      const saved = annualLedgers.find((l) => l.fiscalYearBe === yr);
      const draft: LedgerDraft =
        draftOverride[yr] ||
        (saved
          ? (() => {
              const { id: _id, createdBy: _cb, teamUids: _tu, createdAt: _ca, updatedAt: _ua, ...rest } = saved;
              return rest;
            })()
          : AUDITED_BASELINES_BY_YEAR[yr]);
      const m = computeStatementMetrics(draft);
      return {
        yearBe: yr,
        name: `${yr}`,
        isSavedInDb: Boolean(saved),
        cash: m.cashAndEquivalents,
        assets: m.totalAssets,
        relatedLoan: m.relatedPartyLoan,
        liabilities: m.totalLiabilities,
        equity: m.totalEquity,
        revenue: m.totalRevenue,
        expenses: m.totalExpenses,
        netProfitLoss: m.netProfitLoss,
        isBalanced: m.isBalanced,
      };
    });
  }, [annualLedgers, draftOverride]);

  const chartComparisonData = useMemo(
    () => [
      {
        name: `ปี ${previousLedger.fiscalYearBe}`,
        รายได้รวม: Number(prev.totalRevenue.toFixed(2)),
        ค่าใช้จ่ายรวม: Number(prev.totalExpenses.toFixed(2)),
        กำไรขาดทุนสุทธิ: Number(prev.netProfitLoss.toFixed(2)),
      },
      {
        name: `ปี ${currentLedger.fiscalYearBe}`,
        รายได้รวม: Number(cur.totalRevenue.toFixed(2)),
        ค่าใช้จ่ายรวม: Number(cur.totalExpenses.toFixed(2)),
        กำไรขาดทุนสุทธิ: Number(cur.netProfitLoss.toFixed(2)),
      },
    ],
    [cur, prev, currentLedger.fiscalYearBe, previousLedger.fiscalYearBe]
  );

  const revenueGrowthPct =
    prev.totalRevenue > 0
      ? ((cur.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100
      : 0;
  const lossImprovementPct =
    prev.netProfitLoss < 0 && cur.netProfitLoss > prev.netProfitLoss
      ? ((cur.netProfitLoss - prev.netProfitLoss) / Math.abs(prev.netProfitLoss)) * 100
      : 0;
  const shortfallToBreakeven = Math.max(0, cur.breakEvenRevenue - cur.serviceRevenue);

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      {/* Header */}
      <div className="flex flex-col items-center text-center gap-2.5 sm:gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            <ThaiText text="งบการเงินประจำปีและยื่นภาษี DBD" />
          </h1>
          <p className="thai-subtitle mt-1.5 mb-0">
            <ThaiText text="จัดทำงบฐานะการเงิน งบกำไรขาดทุน หมายเหตุประกอบงบ 1–8 พร้อมบทวิเคราะห์และแบบ ภ.ง.ด. 50 / ส.บช.3" />
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2 w-full lg:w-auto">
          <select
            className="form-select col-span-2 sm:col-span-1 w-full sm:w-auto font-semibold text-sm !rounded-xl min-h-[42px]"
            value={selectedYearBe}
            onChange={(e) => setSelectedYearBe(Number(e.target.value))}
          >
            <option value={2562}>พ.ศ. 2562 (2019 — ปีก่อตั้ง)</option>
            <option value={2563}>พ.ศ. 2563 (2020 — งบจริง)</option>
            <option value={2564}>พ.ศ. 2564 (2021 — งบจริง)</option>
            <option value={2565}>พ.ศ. 2565 (2022 — งบจริง)</option>
            <option value={2566}>พ.ศ. 2566 (2023 — งบจริง)</option>
            <option value={2567}>พ.ศ. 2567 (2024 — งบสอบบัญชี)</option>
            <option value={2568}>พ.ศ. 2568 (2025 — งบสอบบัญชี)</option>
            <option value={2569}>พ.ศ. 2569 (2026 — ดึงข้อมูลปัจจุบัน)</option>
            <option value={2570}>พ.ศ. 2570 (2027)</option>
          </select>

          <button
            type="button"
            onClick={handleSyncFromLiveRecords}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 !rounded-xl hover:bg-slate-50 min-h-[42px]"
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>ดึงยอดในระบบ</span>
          </button>

          {AUDITED_BASELINES_BY_YEAR[selectedYearBe] && (
            <button
              type="button"
              onClick={handleResetToAuditedBaseline}
              className="figma-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-blue-800 bg-blue-50 border border-blue-200 !rounded-xl hover:bg-blue-100 min-h-[42px]"
            >
              <span>ยอดปิดงบ {selectedYearBe}</span>
            </button>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={handleSaveLedger}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-700 !rounded-xl hover:bg-emerald-800 min-h-[42px]"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span>{saving ? 'กำลังบันทึก...' : 'บันทึกงบปีนี้'}</span>
          </button>

          <button
            type="button"
            disabled={savingAllHistory}
            onClick={handleSaveAllHistoricalYears}
            className="figma-btn col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-semibold text-emerald-900 bg-emerald-100 border border-emerald-300 !rounded-xl hover:bg-emerald-200 min-h-[42px]"
            title="บันทึกชุดข้อมูลงบการเงินตั้งแต่ปีก่อตั้ง 2562 ถึง 2568 ลงฐานข้อมูลครั้งเดียว"
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>{savingAllHistory ? 'กำลังบันทึก 7 ปี...' : 'อัพเดตฐานข้อมูล 2562–2568'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 !rounded-xl hover:bg-slate-800 min-h-[42px]"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>พิมพ์งบ A4</span>
          </button>

          <button
            type="button"
            onClick={() => exportAnnualDbdPackageExcel(currentLedger, previousLedger, company)}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 !rounded-xl hover:bg-emerald-100 min-h-[42px]"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Balance Check & CPA Banner */}
      <div
        className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 ${
          cur.isBalanced
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : 'bg-rose-50 border-rose-300 text-rose-950'
        }`}
      >
        <div className="flex items-start gap-2.5 text-xs sm:text-sm">
          {cur.isBalanced ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <div className="font-bold leading-[1.45]">
              {cur.isBalanced
                ? `งบดุลสมดุลถูกต้อง (สินทรัพย์รวม ฿${formatTHB(cur.totalAssets)} = หนี้สิน + ส่วนของผู้ถือหุ้น ฿${formatTHB(cur.totalLiabilitiesAndEquity)})`
                : `งบดุลยังไม่สมดุล ต่างอยู่ ฿${formatTHB(cur.balanceDiff)} — กรุณาปรับปรุงรายการเงินสด/ลูกหนี้/ค้างจ่ายในแท็บ "งบฐานะการเงิน"`}
            </div>
            <div className="text-xs opacity-80 mt-0.5 leading-[1.5]">
              ผู้สอบบัญชีอ้างอิง: {currentLedger.cpaAuditorName || '-'} (CPA {currentLedger.cpaLicenseNo || '-'}) ·{' '}
              {currentLedger.cpaFirmName || '-'} · ทะเบียนนิติบุคคล {currentLedger.registrationNumber}
            </div>
          </div>
        </div>
        <div className="text-xs font-mono-num font-bold shrink-0">
          {currentLedger.dataSourceMode === 'audited' ? 'โหมด: งบตรวจสอบแล้ว' : 'โหมด: ร่างจากข้อมูลสด'}
        </div>
      </div>

      {isAddressOutdatedFor2569Plus && (
        <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-amber-950">
          <div className="space-y-0.5 min-w-0">
            <div className="font-bold">
              พบที่ตั้งสำนักงานล่าสุดสำหรับงบปี {selectedYearBe} (หลังย้ายที่ตั้งสำนักงาน)
            </div>
            <div className="text-xs text-amber-900 leading-[1.5]">
              ที่อยู่ในงบปีนี้ยังเป็น "{currentLedger.businessAddress}" → แนะนำเปลี่ยนเป็น "{latestExpectedAddress}"
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleApplyLatestCompanyToYear(true)}
            className="figma-btn w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 !rounded-xl whitespace-nowrap min-h-[40px] shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            อัพเดตที่อยู่ล่าสุดเข้าปี {selectedYearBe}
          </button>
        </div>
      )}

      {/* 4 KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="figma-card p-4">
          <div className="text-xs font-medium text-slate-500">สินทรัพย์รวม (Total Assets)</div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
            ฿{formatTHB(cur.totalAssets)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-num">
            ปี {previousLedger.fiscalYearBe}: ฿{formatTHB(prev.totalAssets)} ({fmtDiffPct(cur.totalAssets, prev.totalAssets)})
          </div>
        </div>

        <div className="figma-card p-4">
          <div className="text-xs font-medium text-slate-500">รายได้รวมประจำปี</div>
          <div className="text-2xl font-bold font-mono-num text-emerald-700 mt-1">
            ฿{formatTHB(cur.totalRevenue)}
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1 font-mono-num">
            ปี {previousLedger.fiscalYearBe}: ฿{formatTHB(prev.totalRevenue)} ({revenueGrowthPct >= 0 ? '+' : ''}
            {revenueGrowthPct.toFixed(1)}%)
          </div>
        </div>

        <div className="figma-card p-4">
          <div className="text-xs font-medium text-slate-500">กำไร (ขาดทุน) สุทธิ</div>
          <div
            className={`text-2xl font-bold font-mono-num mt-1 ${
              cur.netProfitLoss >= 0 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {cur.netProfitLoss < 0
              ? `(฿${formatTHB(Math.abs(cur.netProfitLoss))})`
              : `฿${formatTHB(cur.netProfitLoss)}`}
          </div>
          <div className="text-xs text-slate-600 mt-1 font-mono-num">
            {lossImprovementPct > 0
              ? `ผลขาดทุนลดลง ${lossImprovementPct.toFixed(1)}% เทียบปีก่อน`
              : `ปีก่อน: ${prev.netProfitLoss < 0 ? `(฿${formatTHB(Math.abs(prev.netProfitLoss))})` : `฿${formatTHB(prev.netProfitLoss)}`}`}
          </div>
        </div>

        <div className="figma-card p-4">
          <div className="text-xs font-medium text-slate-500">สภาพคล่อง (Current Ratio)</div>
          <div className="text-2xl font-bold font-mono-num text-blue-700 mt-1">
            {cur.currentRatio.toFixed(2)} เท่า
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-num">
            เงินสดต่อสินทรัพย์ {cur.cashToAssetsPct.toFixed(1)}% · D/E {cur.debtToEquity.toFixed(3)}x
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:inline-flex gap-1.5 p-1.5 sm:p-1 bg-slate-200/70 rounded-xl w-full lg:w-auto">
        <button
          type="button"
          onClick={() => setSubTab('analysis')}
          className={`px-3.5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-left sm:text-center min-h-[40px] ${
            subTab === 'analysis' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          1. บทวิเคราะห์และกราฟ
        </button>
        <button
          type="button"
          onClick={() => setSubTab('statements')}
          className={`px-3.5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-left sm:text-center min-h-[40px] ${
            subTab === 'statements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          2. งบฐานะการเงินและกำไรขาดทุน
        </button>
        <button
          type="button"
          onClick={() => setSubTab('notes')}
          className={`px-3.5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-left sm:text-center min-h-[40px] ${
            subTab === 'notes' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          3. หมายเหตุประกอบงบ (1–8)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('filing')}
          className={`px-3.5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors text-left sm:text-center min-h-[40px] ${
            subTab === 'filing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          4. ความพร้อมยื่น DBD / ภ.ง.ด. 50
        </button>
      </div>

      {/* TAB 1: EXECUTIVE ANALYSIS */}
      {subTab === 'analysis' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* YoY Chart */}
            <div className="lg:col-span-7 figma-card p-5">
              <div className="mb-3">
                <h2 className="text-base font-bold text-slate-900 m-0 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-700" />
                  กราฟเปรียบเทียบผลการดำเนินงาน ปี {previousLedger.fiscalYearBe} เทียบ ปี {currentLedger.fiscalYearBe}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 mb-0">
                  เปรียบเทียบรายได้รวม ค่าใช้จ่ายรวม และกำไร (ขาดทุน) สุทธิ หน่วย: บาท
                </p>
              </div>
              <div className="h-[290px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartComparisonData} margin={{ top: 10, right: 16, left: 6, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val: unknown) => `฿${formatTHB(Number(val) || 0)}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="รายได้รวม" fill="#16A34A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ค่าใช้จ่ายรวม" fill="#DC2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="กำไรขาดทุนสุทธิ" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Key Ratios */}
            <div className="lg:col-span-5 figma-card p-4 sm:p-5 space-y-3">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                อัตราส่วนทางการเงินที่สำคัญ (Financial Ratios)
              </h2>
              <div className="divide-y divide-slate-100 text-xs sm:text-sm">
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">อัตรากำไรขั้นต้น (Gross Margin)</span>
                  <strong className="font-mono-num text-slate-900">
                    {cur.grossMarginPct.toFixed(2)}% (฿{formatTHB(cur.grossProfit)})
                  </strong>
                </div>
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">เงินทุนหมุนเวียนสุทธิ (Working Capital)</span>
                  <strong className="font-mono-num text-emerald-700">
                    ฿{formatTHB(cur.workingCapital)}
                  </strong>
                </div>
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">อัตราส่วนสภาพคล่อง (Current Ratio)</span>
                  <strong className="font-mono-num text-blue-700">
                    {cur.currentRatio.toFixed(2)} เท่า
                  </strong>
                </div>
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">อัตราส่วนหนี้สินต่อทุน (D/E Ratio)</span>
                  <strong className="font-mono-num text-slate-900">
                    {cur.debtToEquity.toFixed(3)} เท่า
                  </strong>
                </div>
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">จุดคุ้มทุนรายได้บริการ (Break-Even Point)</span>
                  <strong className="font-mono-num text-slate-900">
                    ฿{formatTHB(cur.breakEvenRevenue)}
                  </strong>
                </div>
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">สัดส่วนส่วนผู้ถือหุ้นต่อทุนจดทะเบียน</span>
                  <strong className="font-mono-num text-slate-900">
                    {cur.capitalRemainingPct.toFixed(2)}% (เกณฑ์ &gt; 50%)
                  </strong>
                </div>
                <div className="py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-0.5 sm:gap-2">
                  <span className="text-slate-600">สิทธิประโยชน์ขาดทุนสะสมทางภาษี (5 ปี)</span>
                  <strong className="font-mono-num text-blue-700">
                    ฿{formatTHB(Math.abs(Math.min(0, cur.retainedEarningsEnding)))}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Narrative 5-Dimension Analysis */}
          <div className="figma-card p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 m-0">
              บทวิเคราะห์เจาะลึก 5 มิติ สำหรับผู้บริหาร บริษัท ใจกล้า ดิจิตอล จำกัด (ปี {currentLedger.fiscalYearBe})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm leading-[1.65]">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="font-bold text-emerald-800 mb-1">
                  1. การเติบโตของรายได้แบบก้าวกระโดด
                </div>
                <p className="text-slate-700 m-0 text-xs sm:text-sm">
                  รายได้จากการให้บริการขยายตัวจาก{' '}
                  <strong className="font-mono-num">฿{formatTHB(prev.serviceRevenue)}</strong> ในปี {previousLedger.fiscalYearBe}{' '}
                  เป็น <strong className="font-mono-num">฿{formatTHB(cur.serviceRevenue)}</strong> ในปี {currentLedger.fiscalYearBe}{' '}
                  (เติบโต <strong className="font-mono-num">{fmtDiffPct(cur.serviceRevenue, prev.serviceRevenue)}</strong>)
                  แสดงถึงการกลับมารับงานผลิตสื่อและการตลาดอย่างต่อเนื่อง และช่วยลดผลขาดทุนสุทธิลงถึง{' '}
                  <strong className="font-mono-num">{lossImprovementPct.toFixed(1)}%</strong> เหลือขาดทุนเพียง{' '}
                  <strong className="font-mono-num">฿{formatTHB(Math.abs(cur.netProfitLoss))}</strong>
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="font-bold text-blue-800 mb-1">
                  2. โครงสร้างต้นทุนและเป้าหมายจุดคุ้มทุน (Break-Even)
                </div>
                <p className="text-slate-700 m-0 text-xs sm:text-sm">
                  ปีนี้มีอัตรากำไรขั้นต้น <strong className="font-mono-num">{cur.grossMarginPct.toFixed(2)}%</strong>{' '}
                  (กำไรขั้นต้น <strong className="font-mono-num">฿{formatTHB(cur.grossProfit)}</strong>)
                  ขณะที่ค่าใช้จ่ายขายและบริหารควบคุมได้คงที่ที่{' '}
                  <strong className="font-mono-num">฿{formatTHB(cur.sellingExpenses + cur.adminExpenses)}</strong>{' '}
                  หากรักษาอัตรากำไรขั้นต้นระดับเดิม บริษัทต้องการรายได้เพิ่มอีก{' '}
                  <strong className="font-mono-num">฿{formatTHB(shortfallToBreakeven)}</strong>{' '}
                  (รวม ~<strong className="font-mono-num">฿{formatTHB(cur.breakEvenRevenue)}</strong>/ปี) ก็จะเข้าสู่จุดคุ้มทุนและมีกำไรสุทธิทันที
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="font-bold text-slate-900 mb-1">
                  3. สภาพคล่องและความมั่นคงทางการเงินสูงมาก
                </div>
                <p className="text-slate-700 m-0 text-xs sm:text-sm">
                  บริษัทมีเงินสดและเงินฝากธนาคารรวม{' '}
                  <strong className="font-mono-num">฿{formatTHB(cur.cashAndEquivalents)}</strong> คิดเป็น{' '}
                  <strong className="font-mono-num">{cur.cashToAssetsPct.toFixed(2)}%</strong> ของสินทรัพย์ทั้งหมด
                  โดยมีหนี้สินรวมเพียง <strong className="font-mono-num">฿{formatTHB(cur.totalLiabilities)}</strong>{' '}
                  (ค่าใช้จ่ายค้างจ่าย) ทำให้อัตราส่วนสภาพคล่องสูงถึง{' '}
                  <strong className="font-mono-num">{cur.currentRatio.toFixed(2)} เท่า</strong> และไร้ภาระหนี้เงินกู้ดอกเบี้ย
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <div className="font-bold text-amber-800 mb-1">
                  4. ภาษีเงินได้นิติบุคคลและขาดทุนสะสมทางภาษี 5 ปี
                </div>
                <p className="text-slate-700 m-0 text-xs sm:text-sm">
                  แม้ปี {currentLedger.fiscalYearBe} มีค่าใช้จ่ายค่าเสื่อมราคาอุปกรณ์จำนวน{' '}
                  <strong className="font-mono-num">฿{formatTHB(cur.totalDepYear)}</strong> เป็นรายจ่ายที่ไม่ต้องจ่ายเงินสดจริง
                  และขาดทุนสะสมจำนวน <strong className="font-mono-num">฿{formatTHB(Math.abs(Math.min(0, cur.retainedEarningsEnding)))}</strong>{' '}
                  สามารถยกไปหักลดหย่อนกำไรสุทธิในปีถัดไปได้นานถึง 5 รอบบัญชีตามประมวลรัษฎากร มาตรา 65 ตรี (12)
                </p>
              </div>
            </div>
          </div>

          {/* 7-Year Historical Chart + Clickable Summary Table (2562 - 2568) */}
          <div className="figma-card p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 m-0">
                  ประวัติฐานะการเงินและผลการดำเนินงานตั้งแต่วันก่อตั้งบริษัท (พ.ศ. 2562–2568)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 mb-0">
                  จดทะเบียน 10 เมษายน 2562 · กดที่แถวปี พ.ศ. เพื่อเปิดดูงบดุลและหมายเหตุประกอบงบของปีนั้นได้ทันที
                </p>
              </div>
              <span className="text-xs font-mono-num font-semibold text-slate-600">
                บันทึกลง Cloud แล้ว {sevenYearSeries.filter((s) => s.isSavedInDb).length}/7 ปี
              </span>
            </div>

            <div className="h-[270px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sevenYearSeries} margin={{ top: 10, right: 16, left: 6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: unknown) => `฿${formatTHB(Number(val) || 0)}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="assets" name="สินทรัพย์รวม" fill="#0F172A" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cash" name="เงินสดและธนาคาร" fill="#0284C7" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="revenue" name="รายได้รวม" fill="#16A34A" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="netProfitLoss" name="กำไร (ขาดทุน) สุทธิ" fill="#D97706" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Mobile Card View (< md) */}
            <div className="md:hidden space-y-2.5">
              {sevenYearSeries.map((row) => {
                const isSelected = row.yearBe === selectedYearBe;
                return (
                  <button
                    key={row.yearBe}
                    type="button"
                    onClick={() => setSelectedYearBe(row.yearBe)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                      <span className="font-mono-num font-bold text-sm text-slate-900">
                        พ.ศ. {row.yearBe}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                          row.isSavedInDb
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {row.isSavedInDb ? 'บันทึกแล้ว ✓' : 'ฐานข้อมูลงบจริง'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 text-xs font-mono-num">
                      <div>
                        <span className="text-[11px] text-slate-500 block font-sans">สินทรัพย์รวม</span>
                        <span className="font-semibold text-slate-900">฿{formatTHB(row.assets)}</span>
                      </div>
                      <div className="text-end">
                        <span className="text-[11px] text-slate-500 block font-sans">รายได้รวม</span>
                        <span className="font-semibold text-emerald-700">฿{formatTHB(row.revenue)}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block font-sans">เงินสดและธนาคาร</span>
                        <span className="text-slate-700">฿{formatTHB(row.cash)}</span>
                      </div>
                      <div className="text-end">
                        <span className="text-[11px] text-slate-500 block font-sans">กำไร (ขาดทุน) สุทธิ</span>
                        <span className={`font-bold ${row.netProfitLoss >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {row.netProfitLoss < 0
                            ? `(฿${formatTHB(Math.abs(row.netProfitLoss))})`
                            : `฿${formatTHB(row.netProfitLoss)}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Tablet & Desktop Table (>= md) */}
            <div className="hidden md:block table-responsive">
              <table className="table table-sm table-hover align-middle text-xs sm:text-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th>ปี พ.ศ.</th>
                    <th className="text-end font-mono-num">เงินสดและธนาคาร</th>
                    <th className="text-end font-mono-num">เงินกู้ยืมเกี่ยวข้อง</th>
                    <th className="text-end font-mono-num">สินทรัพย์รวม</th>
                    <th className="text-end font-mono-num">หนี้สินรวม</th>
                    <th className="text-end font-mono-num">ส่วนผู้ถือหุ้น</th>
                    <th className="text-end font-mono-num">รายได้รวม</th>
                    <th className="text-end font-mono-num">กำไร (ขาดทุน) สุทธิ</th>
                    <th className="text-center">สถานะข้อมูล</th>
                  </tr>
                </thead>
                <tbody>
                  {sevenYearSeries.map((row) => {
                    const isSelected = row.yearBe === selectedYearBe;
                    return (
                      <tr
                        key={row.yearBe}
                        onClick={() => setSelectedYearBe(row.yearBe)}
                        className={`cursor-pointer ${isSelected ? 'table-primary fw-semibold' : ''}`}
                      >
                        <td className="font-mono-num font-bold">พ.ศ. {row.yearBe}</td>
                        <td className="text-end font-mono-num">฿{formatTHB(row.cash)}</td>
                        <td className="text-end font-mono-num text-slate-600">
                          {row.relatedLoan > 0 ? `฿${formatTHB(row.relatedLoan)}` : '-'}
                        </td>
                        <td className="text-end font-mono-num font-semibold">฿{formatTHB(row.assets)}</td>
                        <td className="text-end font-mono-num">฿{formatTHB(row.liabilities)}</td>
                        <td className="text-end font-mono-num">฿{formatTHB(row.equity)}</td>
                        <td className="text-end font-mono-num text-emerald-700">฿{formatTHB(row.revenue)}</td>
                        <td
                          className={`text-end font-mono-num font-bold ${
                            row.netProfitLoss >= 0 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {row.netProfitLoss < 0
                            ? `(฿${formatTHB(Math.abs(row.netProfitLoss))})`
                            : `฿${formatTHB(row.netProfitLoss)}`}
                        </td>
                        <td className="text-center text-xs">
                          <span
                            className={`px-2 py-0.5 rounded border ${
                              row.isSavedInDb
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {row.isSavedInDb ? 'บันทึกแล้ว ✓' : 'ฐานข้อมูลงบจริง'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BALANCE SHEET & INCOME STATEMENT */}
      {subTab === 'statements' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Comparative Statement Tables */}
          <div className="lg:col-span-7 figma-card p-4 sm:p-5 space-y-6">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 mb-1.5">
                งบฐานะการเงิน (Balance Sheet) ณ 31 ธันวาคม {currentLedger.fiscalYearBe}
              </h2>
              <p className="md:hidden text-[11px] text-slate-400 mb-2">
                เลื่อนตารางซ้าย–ขวาเพื่อดูยอดเปรียบเทียบ →
              </p>
              <div className="table-responsive">
                <table className="table table-sm align-middle text-xs sm:text-sm">
                  <thead className="table-light">
                    <tr>
                      <th>รายการ (หน่วย: บาท)</th>
                      <th className="text-end font-mono-num">{currentLedger.fiscalYearBe}</th>
                      <th className="text-end font-mono-num">{previousLedger.fiscalYearBe}</th>
                      <th className="text-end font-mono-num">เปลี่ยนแปลง</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="table-secondary fw-bold">
                      <td colSpan={4}>สินทรัพย์</td>
                    </tr>
                    <tr>
                      <td className="ps-4">เงินสดและรายการเทียบเท่าเงินสด (หมายเหตุ 4)</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.cashAndEquivalents)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.cashAndEquivalents)}</td>
                      <td className="text-end font-mono-num text-slate-500">
                        {fmtDiffPct(cur.cashAndEquivalents, prev.cashAndEquivalents)}
                      </td>
                    </tr>
                    <tr>
                      <td className="ps-4">ลูกหนี้การค้าและลูกหนี้หมุนเวียนอื่น (หมายเหตุ 5)</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.receivablesTotal)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.receivablesTotal)}</td>
                      <td className="text-end font-mono-num text-slate-500">
                        {fmtDiffPct(cur.receivablesTotal, prev.receivablesTotal)}
                      </td>
                    </tr>
                    {(cur.workInProgress > 0 || prev.workInProgress > 0) && (
                      <tr>
                        <td className="ps-4">งานระหว่างทำ</td>
                        <td className="text-end font-mono-num">{formatTHB(cur.workInProgress)}</td>
                        <td className="text-end font-mono-num">{formatTHB(prev.workInProgress)}</td>
                        <td className="text-end font-mono-num text-slate-500">-</td>
                      </tr>
                    )}
                    <tr>
                      <td className="ps-4">สินทรัพย์หมุนเวียนอื่น</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.otherCurrentAssets)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.otherCurrentAssets)}</td>
                      <td className="text-end font-mono-num text-slate-500">-</td>
                    </tr>
                    {(cur.relatedPartyLoan > 0 || prev.relatedPartyLoan > 0) && (
                      <tr>
                        <td className="ps-4">เงินให้กู้ยืมระยะยาวแก่บุคคลที่เกี่ยวข้องกัน</td>
                        <td className="text-end font-mono-num">{formatTHB(cur.relatedPartyLoan)}</td>
                        <td className="text-end font-mono-num">{formatTHB(prev.relatedPartyLoan)}</td>
                        <td className="text-end font-mono-num text-slate-500">
                          {fmtDiffPct(cur.relatedPartyLoan, prev.relatedPartyLoan)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="ps-4">อุปกรณ์สุทธิ (หมายเหตุ 6)</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.netEquipment)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.netEquipment)}</td>
                      <td className="text-end font-mono-num text-slate-500">
                        {fmtDiffPct(cur.netEquipment, prev.netEquipment)}
                      </td>
                    </tr>
                    <tr className="fw-bold bg-slate-100">
                      <td>รวมสินทรัพย์</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.totalAssets)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.totalAssets)}</td>
                      <td className="text-end font-mono-num">{fmtDiffPct(cur.totalAssets, prev.totalAssets)}</td>
                    </tr>

                    <tr className="table-secondary fw-bold">
                      <td colSpan={4}>หนี้สินและส่วนของผู้ถือหุ้น</td>
                    </tr>
                    <tr>
                      <td className="ps-4">เจ้าหนี้การค้าและค่าใช้จ่ายค้างจ่าย (หมายเหตุ 7)</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.totalLiabilities)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.totalLiabilities)}</td>
                      <td className="text-end font-mono-num text-slate-500">
                        {fmtDiffPct(cur.totalLiabilities, prev.totalLiabilities)}
                      </td>
                    </tr>
                    <tr>
                      <td className="ps-4">ทุนที่ออกและชำระแล้ว (10,000 หุ้น x 100 บ.)</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.paidUpCapital)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.paidUpCapital)}</td>
                      <td className="text-end font-mono-num text-slate-500">0.0%</td>
                    </tr>
                    <tr>
                      <td className="ps-4">กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร</td>
                      <td className="text-end font-mono-num text-amber-700">
                        {cur.retainedEarningsEnding < 0
                          ? `(${formatTHB(Math.abs(cur.retainedEarningsEnding))})`
                          : formatTHB(cur.retainedEarningsEnding)}
                      </td>
                      <td className="text-end font-mono-num text-amber-700">
                        {prev.retainedEarningsEnding < 0
                          ? `(${formatTHB(Math.abs(prev.retainedEarningsEnding))})`
                          : formatTHB(prev.retainedEarningsEnding)}
                      </td>
                      <td className="text-end font-mono-num text-slate-500">-</td>
                    </tr>
                    <tr className="fw-bold bg-slate-100">
                      <td>รวมหนี้สินและส่วนของผู้ถือหุ้น</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.totalLiabilitiesAndEquity)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.totalLiabilitiesAndEquity)}</td>
                      <td className="text-end font-mono-num">
                        {fmtDiffPct(cur.totalLiabilitiesAndEquity, prev.totalLiabilitiesAndEquity)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-900 mb-2">
                งบกำไรขาดทุน (Income Statement) สำหรับปีสิ้นสุด 31 ธันวาคม {currentLedger.fiscalYearBe}
              </h2>
              <div className="table-responsive">
                <table className="table table-sm align-middle text-xs sm:text-sm">
                  <thead className="table-light">
                    <tr>
                      <th>รายการ</th>
                      <th className="text-end font-mono-num">{currentLedger.fiscalYearBe}</th>
                      <th className="text-end font-mono-num">{previousLedger.fiscalYearBe}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="ps-3">รายได้จากการให้บริการ</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.serviceRevenue)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.serviceRevenue)}</td>
                    </tr>
                    <tr>
                      <td className="ps-3">รายได้อื่น</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.otherIncome)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.otherIncome)}</td>
                    </tr>
                    <tr className="fw-semibold bg-slate-50">
                      <td>รวมรายได้</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.totalRevenue)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.totalRevenue)}</td>
                    </tr>
                    <tr>
                      <td className="ps-3">ต้นทุนการให้บริการ</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.costOfServices)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.costOfServices)}</td>
                    </tr>
                    <tr>
                      <td className="ps-3">ค่าใช้จ่ายในการขาย</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.sellingExpenses)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.sellingExpenses)}</td>
                    </tr>
                    <tr>
                      <td className="ps-3">ค่าใช้จ่ายในการบริหาร</td>
                      <td className="text-end font-mono-num">{formatTHB(cur.adminExpenses)}</td>
                      <td className="text-end font-mono-num">{formatTHB(prev.adminExpenses)}</td>
                    </tr>
                    <tr className="fw-bold bg-slate-100">
                      <td>กำไร (ขาดทุน) สุทธิ</td>
                      <td className="text-end font-mono-num">
                        {cur.netProfitLoss < 0
                          ? `(${formatTHB(Math.abs(cur.netProfitLoss))})`
                          : formatTHB(cur.netProfitLoss)}
                      </td>
                      <td className="text-end font-mono-num">
                        {prev.netProfitLoss < 0
                          ? `(${formatTHB(Math.abs(prev.netProfitLoss))})`
                          : formatTHB(prev.netProfitLoss)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Editable Accounting Adjustments */}
          <div className="lg:col-span-5 figma-card p-4 sm:p-5 space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
              ปรับปรุงตัวเลขปิดงบประจำปี พ.ศ. {selectedYearBe}
            </h2>
            <p className="text-xs text-slate-500 m-0 leading-[1.55]">
              กรอกยอดเงินสด เงินฝาก ค่าเสื่อมราคา และค่าใช้จ่ายค้างจ่าย ณ วันสิ้นรอบบัญชีเพื่อให้สมการงบดุลสมดุล
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="form-label mb-1">เงินสดในมือ (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.cashOnHand}
                  onChange={(e) => updateField('cashOnHand', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">เงินฝากธนาคาร (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.cashAtBank}
                  onChange={(e) => updateField('cashAtBank', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ลูกหนี้การค้า</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.tradeReceivables}
                  onChange={(e) => updateField('tradeReceivables', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ดอกเบี้ยค้างรับ</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.accruedInterestReceivable}
                  onChange={(e) => updateField('accruedInterestReceivable', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ภาษีถูกหัก ณ ที่จ่าย (สินทรัพย์)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.withholdingTaxAsset || 0}
                  onChange={(e) => updateField('withholdingTaxAsset', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ลูกหนี้กรมสรรพากร</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.revenueDeptReceivable}
                  onChange={(e) => updateField('revenueDeptReceivable', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">งานระหว่างทำ (WIP)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.workInProgress || 0}
                  onChange={(e) => updateField('workInProgress', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">เงินให้กู้ยืมบุคคลเกี่ยวข้อง</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.relatedPartyLoan || 0}
                  onChange={(e) => updateField('relatedPartyLoan', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ค่าใช้จ่ายค้างจ่าย (หนี้สิน)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.accruedExpenses}
                  onChange={(e) => updateField('accruedExpenses', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">รายได้รับล่วงหน้า / มัดจำรับ</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={(currentLedger.unearnedRevenue || 0) + (currentLedger.customerDeposits || 0)}
                  onChange={(e) => {
                    updateField('unearnedRevenue', Number(e.target.value));
                    updateField('customerDeposits', 0);
                  }}
                />
              </div>
              <div>
                <label className="form-label mb-1">ภาษีหัก ณ ที่จ่ายค้างจ่าย</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.withholdingTaxPayable || 0}
                  onChange={(e) => updateField('withholdingTaxPayable', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">รายได้จากการให้บริการ</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.serviceRevenue}
                  onChange={(e) => updateField('serviceRevenue', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ต้นทุนการให้บริการ</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.costOfServices}
                  onChange={(e) => updateField('costOfServices', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ค่าใช้จ่ายในการขาย</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.sellingExpenses}
                  onChange={(e) => updateField('sellingExpenses', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ค่าใช้จ่ายในการบริหาร</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.adminExpenses}
                  onChange={(e) => updateField('adminExpenses', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">กำไร (ขาดทุน) สะสมต้นปี</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.retainedEarningsOpening}
                  onChange={(e) => updateField('retainedEarningsOpening', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="form-label mb-1">ทุนชำระแล้ว</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.paidUpCapital}
                  onChange={(e) => updateField('paidUpCapital', Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: NOTES TO FINANCIAL STATEMENTS */}
      {subTab === 'notes' && (
        <div className="figma-card p-5 space-y-4 text-sm leading-[1.65]">
          <h2 className="text-base font-bold text-slate-900 m-0">
            หมายเหตุประกอบงบการเงิน (ข้อ 1–8 ตามมาตรฐาน TFRS for NPAEs และประกาศกรมพัฒนาธุรกิจการค้า)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900">1. ข้อมูลทั่วไปของนิติบุคคล</div>
                {selectedYearBe >= 2569 ? (
                  currentLedger.businessAddress === latestExpectedAddress ? (
                    <span className="text-[11px] font-semibold text-emerald-700">
                      ✓ ใช้ที่ตั้งสำนักงานล่าสุดแล้ว
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleApplyLatestCompanyToYear(true)}
                      className="btn btn-sm btn-outline-primary text-[11px] py-0.5 px-2"
                    >
                      ปรับใช้ที่ตั้งล่าสุด (ปทุมธานี 12120)
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleApplyLatestCompanyToYear(false)}
                    className="btn btn-link btn-sm text-[11px] p-0 text-decoration-none text-slate-500 hover:text-blue-700"
                  >
                    เปลี่ยนเป็นที่อยู่ปัจจุบัน
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-700 space-y-1">
                <div><strong>ชื่อบริษัท:</strong> {company.companyNameTh}</div>
                <div><strong>ทะเบียนนิติบุคคล:</strong> {currentLedger.registrationNumber} (จดทะเบียน {currentLedger.registrationDateTh})</div>
                <div><strong>ที่ตั้งสำนักงาน:</strong> {currentLedger.businessAddress}</div>
                <div><strong>กรรมการผู้มีอำนาจลงนาม:</strong> {currentLedger.directorName}</div>
                {selectedYearBe <= 2568 && (
                  <div className="text-[11px] text-slate-500 pt-1">
                    * ปี 2562–2568 แสดงที่ตั้งตามงบที่ปิดและยื่น DBD ไปแล้ว (สำหรับปี 2569+ ระบบใช้ที่อยู่ล่าสุด {LATEST_OFFICE_ADDRESS_2569_PLUS} อัตโนมัติ)
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900">2–3. เกณฑ์การจัดทำและนโยบายบัญชี</div>
              <div className="text-xs text-slate-700 space-y-1">
                <div>จัดทำตาม TFRS for NPAEs และประกาศ DBD ลงวันที่ 27 ต.ค. 2566</div>
                <div><strong>ค่าเสื่อมราคา:</strong> วิธีเส้นตรง อายุการให้ประโยชน์ 5 ปี (เครื่องมือ 5 ปี, อุปกรณ์สำนักงาน 5 ปี)</div>
                <div><strong>เกณฑ์คงค้าง:</strong> รายได้จากการให้บริการรับรู้เมื่อส่งมอบงานเสร็จสิ้น</div>
              </div>
            </div>
          </div>

          {/* Note 6 Fixed Assets Table */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-2">
              หมายเหตุ 6. ทะเบียนอุปกรณ์และค่าเสื่อมราคาสะสม (ปี {currentLedger.fiscalYearBe})
            </h3>

            {/* Mobile Cards (< md) */}
            <div className="md:hidden space-y-2.5">
              {[
                {
                  name: 'เครื่องมือ (อายุ 5 ปี)',
                  cost: cur.toolsCost,
                  depYear: currentLedger.equipmentToolsDepYear,
                  accum: cur.toolsAccumDep,
                  net: cur.toolsCost - cur.toolsAccumDep,
                  total: false,
                },
                {
                  name: 'อุปกรณ์สำนักงาน (อายุ 5 ปี)',
                  cost: cur.officeCost,
                  depYear: currentLedger.equipmentOfficeDepYear,
                  accum: cur.officeAccumDep,
                  net: cur.officeCost - cur.officeAccumDep,
                  total: false,
                },
                {
                  name: 'รวมอุปกรณ์สุทธิ',
                  cost: cur.totalEquipmentCost,
                  depYear: cur.totalDepYear,
                  accum: cur.totalAccumDep,
                  net: cur.netEquipment,
                  total: true,
                },
              ].map((asset) => (
                <div
                  key={asset.name}
                  className={`p-3 rounded-xl border ${
                    asset.total ? 'bg-slate-100 border-slate-300 font-semibold' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900 mb-1.5">{asset.name}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-mono-num">
                    <div className="text-slate-600">
                      ราคาทุน: <strong className="text-slate-900">฿{formatTHB(asset.cost)}</strong>
                    </div>
                    <div className="text-end text-slate-600">
                      เสื่อมปีนี้: <strong className="text-slate-900">฿{formatTHB(asset.depYear)}</strong>
                    </div>
                    <div className="text-rose-700">สะสม: (฿{formatTHB(asset.accum)})</div>
                    <div className="text-end font-bold text-slate-900">
                      สุทธิ: ฿{formatTHB(asset.net)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet & Desktop Table (>= md) */}
            <div className="hidden md:block table-responsive">
              <table className="table table-sm align-middle text-xs sm:text-sm">
                <thead className="table-light">
                  <tr>
                    <th>ประเภทสินทรัพย์</th>
                    <th className="text-end font-mono-num">ราคาทุน</th>
                    <th className="text-end font-mono-num">ค่าเสื่อมราคาประจำปี</th>
                    <th className="text-end font-mono-num">ค่าเสื่อมสะสมปลายปี</th>
                    <th className="text-end font-mono-num">มูลค่าสุทธิ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>เครื่องมือ (อายุ 5 ปี)</td>
                    <td className="text-end font-mono-num">฿{formatTHB(cur.toolsCost)}</td>
                    <td className="text-end font-mono-num">฿{formatTHB(currentLedger.equipmentToolsDepYear)}</td>
                    <td className="text-end font-mono-num text-rose-700">(฿{formatTHB(cur.toolsAccumDep)})</td>
                    <td className="text-end font-mono-num font-bold">
                      ฿{formatTHB(cur.toolsCost - cur.toolsAccumDep)}
                    </td>
                  </tr>
                  <tr>
                    <td>อุปกรณ์สำนักงาน (อายุ 5 ปี)</td>
                    <td className="text-end font-mono-num">฿{formatTHB(cur.officeCost)}</td>
                    <td className="text-end font-mono-num">฿{formatTHB(currentLedger.equipmentOfficeDepYear)}</td>
                    <td className="text-end font-mono-num text-rose-700">(฿{formatTHB(cur.officeAccumDep)})</td>
                    <td className="text-end font-mono-num font-bold">
                      ฿{formatTHB(cur.officeCost - cur.officeAccumDep)}
                    </td>
                  </tr>
                  <tr className="bg-slate-100 fw-bold">
                    <td>รวมอุปกรณ์สุทธิ</td>
                    <td className="text-end font-mono-num">฿{formatTHB(cur.totalEquipmentCost)}</td>
                    <td className="text-end font-mono-num">฿{formatTHB(cur.totalDepYear)}</td>
                    <td className="text-end font-mono-num text-rose-700">(฿{formatTHB(cur.totalAccumDep)})</td>
                    <td className="text-end font-mono-num text-slate-900">
                      ฿{formatTHB(cur.netEquipment)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DBD & REVENUE DEPARTMENT READINESS + PND50 TAX CALCULATOR */}
      {subTab === 'filing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Capability Matrix */}
            <div className="lg:col-span-7 figma-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-700" />
                <h2 className="text-base font-bold text-slate-900 m-0">
                  สถานะความสามารถในการจัดทำและยื่นเอกสารประจำปีต่อ DBD และกรมสรรพากร
                </h2>
              </div>

              <div className="space-y-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60">
                  <div className="font-bold text-emerald-900">
                    ✓ กรมพัฒนาธุรกิจการค้า (DBD e-Filing) — จัดทำชุดร่างและพิมพ์ส่งได้ครบ 4 งบหลัก
                  </div>
                  <ul className="mt-1.5 mb-0 ps-4 space-y-1 text-emerald-950">
                    <li>งบฐานะการเงิน (งบดุล), งบกำไรขาดทุน, งบเปลี่ยนแปลงส่วนผู้ถือหุ้น และหมายเหตุประกอบงบ 1–8 — <strong>ระบบจัดทำและ Export PDF/Excel ได้ทันที</strong></li>
                    <li><strong>ส.บช.3 และ บอจ.5 (บัญชีรายชื่อผู้ถือหุ้น):</strong> เตรียมตัวเลขทุน 10,000 หุ้น มูลค่า 1,000,000 บาท และติดตามสถานะส่งได้ (กำหนดยื่น บอจ.5 ภายใน 14 วันหลังวันประชุมผู้ถือหุ้น AGM และยื่น DBD e-Filing ภายใน 1 เดือนหลัง AGM)</li>
                    <li className="text-amber-900">
                      <strong>ข้อกำหนดสำคัญทางกฎหมาย (CPA Signature):</strong> บริษัทจำกัดทุกแห่งต้องส่งร่างงบการเงินจากระบบนี้ให้ <strong>ผู้สอบบัญชีรับอนุญาต (CPA เช่น ทะเบียน {currentLedger.cpaLicenseNo || '10355'})</strong> ตรวจสอบและลงนามรับรองอิสระก่อนอัปโหลดขึ้นพอร์ทัล DBD e-Filing จริง
                    </li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50">
                  <div className="font-bold text-blue-900">
                    ✓ กรมสรรพากร (RD e-Filing) — คำนวณ ภ.ง.ด. 50 / ภ.ง.ด. 51 / ภ.ง.ด. 3 / ภ.ง.ด. 53 ได้ครบ
                  </div>
                  <ul className="mt-1.5 mb-0 ps-4 space-y-1 text-blue-950">
                    <li><strong>ภ.ง.ด. 50 (ภาษีเงินได้นิติบุคคลประจำปี):</strong> คำนวณกำไรทางภาษี, ยอดขาดทุนสะสม 5 ปียกมา, และเครดิตภาษี 3% ที่ถูกหักไว้ (ยื่นภายใน 150 วันนับจากวันสิ้นรอบบัญชี ~30 พ.ค. หรือ +8 วันผ่าน e-Filing)</li>
                    <li><strong>ภ.ง.ด. 51 (ครึ่งปี):</strong> คำนวณจากประมาณการกำไรสุทธิ 6 เดือนแรก (ยื่นภายใน 2 เดือนหลังสิ้นรอบครึ่งปี ~ส.ค.)</li>
                    <li><strong>ภ.ง.ด. 3 และ ภ.ง.ด. 53 (รายเดือน):</strong> แยกบุคคลธรรมดา/นิติบุคคลพร้อมใบแนบ Excel ในเมนูรายจ่ายและ 50 ทวิ</li>
                  </ul>
                </div>
              </div>

              {/* Filing Checkboxes */}
              <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-semibold text-slate-800">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentLedger.dbdSubmitted)}
                    onChange={(e) => updateField('dbdSubmitted', e.target.checked)}
                  />
                  ยื่น DBD e-Filing (งบ + ส.บช.3 + บอจ.5) แล้ว
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentLedger.rdPnd50Submitted)}
                    onChange={(e) => updateField('rdPnd50Submitted', e.target.checked)}
                  />
                  ยื่น ภ.ง.ด. 50 (กรมสรรพากร) แล้ว
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(currentLedger.rdPnd51Submitted)}
                    onChange={(e) => updateField('rdPnd51Submitted', e.target.checked)}
                  />
                  ยื่น ภ.ง.ด. 51 (ครึ่งปี) แล้ว
                </label>
              </div>
            </div>

            {/* PND50 SME Corporate Tax Calculator */}
            <div className="lg:col-span-5 figma-card p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-700 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 m-0">
                  คำนวณภาษีเงินได้นิติบุคคล ภ.ง.ด. 50 (SMEs)
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="form-label mb-1">รายการบวกกลับทางภาษี (ม.65 ตรี)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm font-mono-num"
                    value={currentLedger.taxNonDeductibleAddBack || 0}
                    onChange={(e) =>
                      updateField('taxNonDeductibleAddBack', Number(e.target.value))
                    }
                  />
                </div>
                <div>
                  <label className="form-label mb-1">ขาดทุนสะสมยกมา (ไม่เกิน 5 ปี)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control form-control-sm font-mono-num"
                    value={currentLedger.taxLossCarryforward5Yr || 0}
                    onChange={(e) =>
                      updateField('taxLossCarryforward5Yr', Number(e.target.value))
                    }
                  />
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs font-mono-num">
                <div className="flex justify-between">
                  <span className="text-slate-600">กำไร (ขาดทุน) ทางบัญชีก่อนภาษี</span>
                  <strong className="text-slate-900">
                    {cur.accountingProfit < 0
                      ? `(฿${formatTHB(Math.abs(cur.accountingProfit))})`
                      : `฿${formatTHB(cur.accountingProfit)}`}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">+ รายจ่ายต้องห้ามบวกกลับทางภาษี</span>
                  <span className="text-slate-800">+฿{formatTHB(cur.taxAddBack)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">- หักขาดทุนสะสม 5 ปีที่ใช้ได้</span>
                  <span className="text-blue-700">-฿{formatTHB(cur.taxLossCarryforwardUsed)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                  <span>กำไรสุทธิเพื่อคำนวณภาษี (Taxable Income)</span>
                  <span className="text-slate-900">฿{formatTHB(cur.netTaxableIncome)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>ภาษี ภ.ง.ด. 50 (เกณฑ์ SME: 0% / 15% / 20%)</span>
                  <span className="text-emerald-700">฿{formatTHB(cur.estimatedSmeCitTax)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>หัก: เครดิตภาษีถูกหัก ณ ที่จ่ายไว้ (ลูกหนี้สรรพากร)</span>
                  <span>-฿{formatTHB(currentLedger.revenueDeptReceivable)}</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 leading-[1.55]">
                เงื่อนไข SME (ทุนชำระแล้วไม่เกิน 5 ล้านบาท และรายได้ไม่เกิน 30 ล้านบาท): กำไรสุทธิ 0–300,000 บาทแรก ยกเว้นภาษี 0% · ส่วนที่เกิน 300,000–3,000,000 บาท เสีย 15% · เกิน 3,000,000 บาท เสีย 20%
              </div>
            </div>
          </div>

          {/* Governance / CPA / AGM Metadata */}
          <div className="figma-card p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-slate-900 m-0 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-slate-700 shrink-0" />
                <span>ข้อมูลนิติบุคคล ผู้สอบบัญชีรับอนุญาต (CPA) และการประชุมผู้ถือหุ้น (AGM)</span>
              </h3>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleApplyLatestCompanyToYear(false)}
                className="btn btn-sm btn-outline-secondary text-xs w-full sm:w-auto min-h-[36px]"
              >
                <RefreshCw className="w-3.5 h-3.5 inline me-1" />
                ดึงที่ตั้งและข้อมูลบริษัทล่าสุดมาใส่ปี {selectedYearBe}
              </button>
            </div>
            <div className="row g-3 text-xs">
              <div className="col-12">
                <label className="form-label">
                  ที่ตั้งสำนักงาน (แสดงในหมายเหตุประกอบงบ ข้อ 1 ของปี พ.ศ. {selectedYearBe})
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.businessAddress}
                  onChange={(e) => updateField('businessAddress', e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">สำนักงานสอบบัญชี</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.cpaFirmName || ''}
                  onChange={(e) => updateField('cpaFirmName', e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">ชื่อผู้สอบบัญชีรับอนุญาต (CPA)</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.cpaAuditorName || ''}
                  onChange={(e) => updateField('cpaAuditorName', e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">เลขทะเบียน CPA</label>
                <input
                  type="text"
                  className="form-control form-control-sm font-mono-num"
                  value={currentLedger.cpaLicenseNo || ''}
                  onChange={(e) => updateField('cpaLicenseNo', e.target.value)}
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">วันที่ในรายงานผู้สอบฯ</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.auditDateTh || ''}
                  onChange={(e) => updateField('auditDateTh', e.target.value)}
                  placeholder="เช่น 9 เมษายน 2569"
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">กรรมการผู้ลงนามรับรองงบ</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.directorName}
                  onChange={(e) => updateField('directorName', e.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">การประชุมสามัญผู้ถือหุ้นครั้งที่</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.agmMeetingNo || ''}
                  onChange={(e) => updateField('agmMeetingNo', e.target.value)}
                  placeholder="เช่น 1/2569"
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">วันที่ประชุม AGM อนุมัติงบ</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={currentLedger.agmDateTh || ''}
                  onChange={(e) => updateField('agmDateTh', e.target.value)}
                  placeholder="เช่น 30 เมษายน 2569"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {showPrintModal && (
        <FinancialStatementPrintModal
          current={currentLedger}
          previous={previousLedger}
          company={company}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
};
