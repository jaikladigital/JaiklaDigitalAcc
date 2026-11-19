import * as XLSX from 'xlsx';
import {
  AccountingDocument,
  AnnualFinancialLedger,
  CompanyProfile,
  Expense,
} from '../types/accounting';

export type LedgerDraft = Omit<
  AnnualFinancialLedger,
  'id' | 'createdBy' | 'teamUids' | 'createdAt' | 'updatedAt'
>;

const BASE_CORP_META = {
  dataSourceMode: 'audited' as const,
  registeredCapitalShares: 10000,
  parValuePerShare: 100,
  paidUpCapital: 1000000.0,
  incomeTaxExpense: 0,
  registrationNumber: '0105562067888',
  registrationDateTh: '10 เมษายน 2562',
  businessAddress: '2365/209 ถนนอ่อนนุช แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร',
  directorName: 'นายสาธิต จันทร์ทนต์',
  cpaFirmName: 'บริษัท สปิค ออดิทแอนด์แท็กซ์ จำกัด',
  cpaAuditorName: 'สุภานดา โพธิพิทักษ์',
  cpaLicenseNo: '10355',
  dbdSubmitted: true,
  rdPnd50Submitted: true,
  rdPnd51Submitted: true,
  taxNonDeductibleAddBack: 0,
};

/**
 * ข้อมูลฐานงบการเงินตั้งแต่วันก่อตั้งบริษัท (พ.ศ. 2562 – 2568)
 * ของ บริษัท ใจกล้า ดิจิตอล จำกัด ตรงตามไฟล์งบฐานะการเงินทุกบาททุกสตางค์
 */
export const AUDITED_BASELINE_2562: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2562,
  fiscalYearCe: 2019,
  cashOnHand: 562435.5,
  cashAtBank: 575.52,
  tradeReceivables: 40000.0,
  accruedInterestReceivable: 0,
  withholdingTaxAsset: 3200.12,
  revenueDeptReceivable: 0,
  prepaidExpenses: 0,
  workInProgress: 0,
  otherCurrentAssets: 0,
  relatedPartyLoan: 500000.0,
  equipmentToolsCost: 0,
  equipmentToolsAccumDep: 0,
  equipmentToolsDepYear: 0,
  equipmentOfficeCost: 3990.0,
  equipmentOfficeAccumDep: 533.32,
  equipmentOfficeDepYear: 533.32,
  tradePayables: 0,
  unearnedRevenue: 0,
  customerDeposits: 0,
  accruedExpenses: 7000.0,
  withholdingTaxPayable: 225.0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: 0,
  serviceRevenue: 303010.0,
  otherIncome: 62.64,
  costOfServices: 134000.0,
  sellingExpenses: 0,
  adminExpenses: 66629.82,
  auditDateTh: '',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 0,
  notesSummary: 'งบการเงินปีแรกหลังจดทะเบียนบริษัท (10 เม.ย. 2562) กำไรสุทธิ 102,442.82 บาท',
};

export const AUDITED_BASELINE_2563: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2563,
  fiscalYearCe: 2020,
  cashOnHand: 574140.23,
  cashAtBank: 152602.91,
  tradeReceivables: 0,
  accruedInterestReceivable: 0,
  withholdingTaxAsset: 5953.13,
  revenueDeptReceivable: 0,
  prepaidExpenses: 0,
  workInProgress: 36817.8,
  otherCurrentAssets: 0,
  relatedPartyLoan: 500000.0,
  equipmentToolsCost: 0,
  equipmentToolsAccumDep: 0,
  equipmentToolsDepYear: 0,
  equipmentOfficeCost: 16480.0,
  equipmentOfficeAccumDep: 3631.01,
  equipmentOfficeDepYear: 3097.69,
  tradePayables: 0,
  unearnedRevenue: 194530.0,
  customerDeposits: 0,
  accruedExpenses: 17000.0,
  withholdingTaxPayable: 0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: 102442.82,
  serviceRevenue: 81752.58,
  otherIncome: 40.26,
  costOfServices: 10330.0,
  sellingExpenses: 0,
  adminExpenses: 103072.6,
  auditDateTh: '',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 0,
  notesSummary: 'งบการเงินปี 2563 มีงานระหว่างทำ 36,817.80 บาท และรายได้รับล่วงหน้า 194,530.00 บาท',
};

export const AUDITED_BASELINE_2564: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2564,
  fiscalYearCe: 2021,
  cashOnHand: 638944.58,
  cashAtBank: 5308.11,
  tradeReceivables: 750.0,
  accruedInterestReceivable: 0,
  withholdingTaxAsset: 12943.33,
  revenueDeptReceivable: 0,
  prepaidExpenses: 0,
  workInProgress: 0,
  otherCurrentAssets: 0,
  relatedPartyLoan: 500000.0,
  equipmentToolsCost: 0,
  equipmentToolsAccumDep: 0,
  equipmentToolsDepYear: 0,
  equipmentOfficeCost: 16480.0,
  equipmentOfficeAccumDep: 6926.61,
  equipmentOfficeDepYear: 3295.6,
  tradePayables: 0,
  unearnedRevenue: 0,
  customerDeposits: 33000.0,
  accruedExpenses: 140000.0,
  withholdingTaxPayable: 90.0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: 70833.06,
  serviceRevenue: 372290.0,
  otherIncome: 770.59,
  costOfServices: 232430.36,
  sellingExpenses: 0,
  adminExpenses: 217053.88,
  auditDateTh: '',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 0,
  notesSummary: 'งบการเงินปี 2564 รายได้ขยายตัวเป็น 372,290.00 บาท และมีเงินมัดจำรับ 33,000.00 บาท',
};

export const AUDITED_BASELINE_2565: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2565,
  fiscalYearCe: 2022,
  cashOnHand: 289261.18,
  cashAtBank: 188992.66,
  tradeReceivables: 0,
  accruedInterestReceivable: 3250.0,
  withholdingTaxAsset: 12943.87,
  revenueDeptReceivable: 0,
  prepaidExpenses: 0,
  workInProgress: 0,
  otherCurrentAssets: 0,
  relatedPartyLoan: 500000.0,
  equipmentToolsCost: 0,
  equipmentToolsAccumDep: 0,
  equipmentToolsDepYear: 0,
  equipmentOfficeCost: 16480.0,
  equipmentOfficeAccumDep: 10222.21,
  equipmentOfficeDepYear: 3295.6,
  tradePayables: 0,
  unearnedRevenue: 0,
  customerDeposits: 0,
  accruedExpenses: 19000.0,
  withholdingTaxPayable: 690.0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: -5590.59,
  serviceRevenue: 220700.0,
  otherIncome: 2554.22,
  costOfServices: 60747.5,
  sellingExpenses: 0,
  adminExpenses: 175900.63,
  auditDateTh: '',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 5590.59,
  notesSummary: 'งบการเงินปี 2565 ขาดทุนสุทธิลดลงเหลือ 13,393.91 บาท',
};

export const AUDITED_BASELINE_2566: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2566,
  fiscalYearCe: 2023,
  cashOnHand: 284570.05,
  cashAtBank: 136828.59,
  tradeReceivables: 0,
  accruedInterestReceivable: 8500.0,
  withholdingTaxAsset: 5242.99,
  revenueDeptReceivable: 0,
  prepaidExpenses: 2066.62,
  workInProgress: 0,
  otherCurrentAssets: 0,
  relatedPartyLoan: 500000.0,
  equipmentToolsCost: 0,
  equipmentToolsAccumDep: 0,
  equipmentToolsDepYear: 0,
  equipmentOfficeCost: 56215.0,
  equipmentOfficeAccumDep: 18503.61,
  equipmentOfficeDepYear: 8281.4,
  tradePayables: 0,
  unearnedRevenue: 0,
  customerDeposits: 0,
  accruedExpenses: 19000.0,
  withholdingTaxPayable: 1260.0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: -18984.5,
  serviceRevenue: 242240.21,
  otherIncome: 5716.09,
  costOfServices: 57038.6,
  sellingExpenses: 0,
  adminExpenses: 217273.56,
  auditDateTh: '',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 18984.5,
  notesSummary: 'งบการเงินปี 2566 ลงทุนอุปกรณ์สำนักงานเพิ่ม 39,735.00 บาท',
};

export const AUDITED_BASELINE_2567: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2567,
  fiscalYearCe: 2024,
  cashOnHand: 660058.25,
  cashAtBank: 42250.51,
  tradeReceivables: 0,
  accruedInterestReceivable: 8500.0,
  withholdingTaxAsset: 0,
  revenueDeptReceivable: 0,
  prepaidExpenses: 0,
  workInProgress: 0,
  otherCurrentAssets: 6020.46,
  relatedPartyLoan: 0,
  equipmentToolsCost: 43630.0,
  equipmentToolsAccumDep: 4170.59,
  equipmentToolsDepYear: 4170.59,
  equipmentOfficeCost: 56215.0,
  equipmentOfficeAccumDep: 29212.69,
  equipmentOfficeDepYear: 10709.08,
  tradePayables: 0,
  unearnedRevenue: 0,
  customerDeposits: 0,
  accruedExpenses: 19000.0,
  withholdingTaxPayable: 0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: -45340.36,
  serviceRevenue: 25773.2,
  otherIncome: 426.19,
  costOfServices: 38627.05,
  sellingExpenses: 2066.62,
  adminExpenses: 175874.42,
  auditDateTh: '9 เมษายน 2569',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 45340.36,
  notesSummary:
    'งบการเงินปี 2567 รับชำระคืนเงินให้กู้ยืมระยะยาวแก่บุคคลที่เกี่ยวข้องกัน 500,000.00 บาท ครบถ้วน และลงทุนเครื่องมือ 43,630.00 บาท',
};

export const AUDITED_BASELINE_2568: LedgerDraft = {
  ...BASE_CORP_META,
  fiscalYearBe: 2568,
  fiscalYearCe: 2025,
  cashOnHand: 531870.24,
  cashAtBank: 158913.49,
  tradeReceivables: 0,
  accruedInterestReceivable: 8500.0,
  withholdingTaxAsset: 0,
  revenueDeptReceivable: 1.68,
  prepaidExpenses: 0,
  workInProgress: 0,
  otherCurrentAssets: 0,
  relatedPartyLoan: 0,
  equipmentToolsCost: 43630.0,
  equipmentToolsAccumDep: 12895.59,
  equipmentToolsDepYear: 8725.0,
  equipmentOfficeCost: 56215.0,
  equipmentOfficeAccumDep: 37357.4,
  equipmentOfficeDepYear: 8144.71,
  tradePayables: 0,
  unearnedRevenue: 0,
  customerDeposits: 0,
  accruedExpenses: 19000.0,
  withholdingTaxPayable: 0,
  otherCurrentLiabilities: 0,
  retainedEarningsOpening: -235709.06,
  serviceRevenue: 741507.4,
  otherIncome: 167.26,
  costOfServices: 601061.21,
  sellingExpenses: 2075.8,
  adminExpenses: 172951.17,
  auditDateTh: '9 เมษายน 2569',
  agmMeetingNo: '',
  agmDateTh: '',
  taxLossCarryforward5Yr: 235709.06,
  notesSummary:
    'งบการเงินสำหรับปีสิ้นสุดวันที่ 31 ธันวาคม 2568 ตรวจสอบรับรองโดยผู้สอบบัญชีรับอนุญาต (ไม่มีเงื่อนไข)',
};

export const HISTORICAL_YEARS_BE = [2562, 2563, 2564, 2565, 2566, 2567, 2568] as const;

export const AUDITED_BASELINES_BY_YEAR: Record<number, LedgerDraft> = {
  2562: AUDITED_BASELINE_2562,
  2563: AUDITED_BASELINE_2563,
  2564: AUDITED_BASELINE_2564,
  2565: AUDITED_BASELINE_2565,
  2566: AUDITED_BASELINE_2566,
  2567: AUDITED_BASELINE_2567,
  2568: AUDITED_BASELINE_2568,
};

export interface ComputedStatementMetrics {
  // Balance sheet
  cashAndEquivalents: number;
  receivablesTotal: number;
  workInProgress: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;
  relatedPartyLoan: number;
  toolsCost: number;
  toolsAccumDep: number;
  officeCost: number;
  officeAccumDep: number;
  totalEquipmentCost: number;
  totalAccumDep: number;
  totalDepYear: number;
  netEquipment: number;
  totalNonCurrentAssets: number;
  totalAssets: number;
  tradeAndOtherPayables: number;
  totalCurrentLiabilities: number;
  totalLiabilities: number;
  registeredCapitalTotal: number;
  paidUpCapital: number;
  retainedEarningsOpening: number;
  netProfitLoss: number;
  retainedEarningsEnding: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  balanceDiff: number;
  isBalanced: boolean;
  // Income statement
  serviceRevenue: number;
  otherIncome: number;
  totalRevenue: number;
  costOfServices: number;
  grossProfit: number;
  grossMarginPct: number;
  sellingExpenses: number;
  adminExpenses: number;
  totalExpenses: number;
  profitBeforeTax: number;
  incomeTaxExpense: number;
  // Ratios
  currentRatio: number;
  debtToEquity: number;
  cashToAssetsPct: number;
  workingCapital: number;
  roaPct: number;
  roePct: number;
  breakEvenRevenue: number;
  capitalRemainingPct: number;
  // Corporate Tax PND50
  accountingProfit: number;
  taxAddBack: number;
  taxLossCarryforwardUsed: number;
  netTaxableIncome: number;
  estimatedSmeCitTax: number;
}

export function computeStatementMetrics(l: LedgerDraft): ComputedStatementMetrics {
  const cashAndEquivalents = Number(((l.cashOnHand || 0) + (l.cashAtBank || 0)).toFixed(2));
  const receivablesTotal = Number(
    (
      (l.tradeReceivables || 0) +
      (l.accruedInterestReceivable || 0) +
      (l.withholdingTaxAsset || 0) +
      (l.revenueDeptReceivable || 0) +
      (l.prepaidExpenses || 0)
    ).toFixed(2)
  );
  const workInProgress = Number((l.workInProgress || 0).toFixed(2));
  const otherCurrentAssets = Number((l.otherCurrentAssets || 0).toFixed(2));
  const totalCurrentAssets = Number(
    (cashAndEquivalents + receivablesTotal + workInProgress + otherCurrentAssets).toFixed(2)
  );

  const relatedPartyLoan = Number((l.relatedPartyLoan || 0).toFixed(2));
  const toolsCost = Number((l.equipmentToolsCost || 0).toFixed(2));
  const toolsAccumDep = Number((l.equipmentToolsAccumDep || 0).toFixed(2));
  const officeCost = Number((l.equipmentOfficeCost || 0).toFixed(2));
  const officeAccumDep = Number((l.equipmentOfficeAccumDep || 0).toFixed(2));
  const totalEquipmentCost = Number((toolsCost + officeCost).toFixed(2));
  const totalAccumDep = Number((toolsAccumDep + officeAccumDep).toFixed(2));
  const totalDepYear = Number(
    ((l.equipmentToolsDepYear || 0) + (l.equipmentOfficeDepYear || 0)).toFixed(2)
  );
  const netEquipment = Number((totalEquipmentCost - totalAccumDep).toFixed(2));
  const totalNonCurrentAssets = Number((relatedPartyLoan + netEquipment).toFixed(2));
  const totalAssets = Number((totalCurrentAssets + totalNonCurrentAssets).toFixed(2));

  const tradeAndOtherPayables = Number(
    (
      (l.tradePayables || 0) +
      (l.unearnedRevenue || 0) +
      (l.customerDeposits || 0) +
      (l.accruedExpenses || 0) +
      (l.withholdingTaxPayable || 0)
    ).toFixed(2)
  );
  const totalCurrentLiabilities = Number(
    (tradeAndOtherPayables + (l.otherCurrentLiabilities || 0)).toFixed(2)
  );
  const totalLiabilities = totalCurrentLiabilities;

  const serviceRevenue = Number((l.serviceRevenue || 0).toFixed(2));
  const otherIncome = Number((l.otherIncome || 0).toFixed(2));
  const totalRevenue = Number((serviceRevenue + otherIncome).toFixed(2));

  const costOfServices = Number((l.costOfServices || 0).toFixed(2));
  const sellingExpenses = Number((l.sellingExpenses || 0).toFixed(2));
  const adminExpenses = Number((l.adminExpenses || 0).toFixed(2));
  const totalExpenses = Number((costOfServices + sellingExpenses + adminExpenses).toFixed(2));

  const grossProfit = Number((serviceRevenue - costOfServices).toFixed(2));
  const grossMarginPct = serviceRevenue > 0 ? (grossProfit / serviceRevenue) * 100 : 0;

  const profitBeforeTax = Number((totalRevenue - totalExpenses).toFixed(2));
  const incomeTaxExpense = Number((l.incomeTaxExpense || 0).toFixed(2));
  const netProfitLoss = Number((profitBeforeTax - incomeTaxExpense).toFixed(2));

  const registeredCapitalTotal = Number(
    ((l.registeredCapitalShares || 10000) * (l.parValuePerShare || 100)).toFixed(2)
  );
  const paidUpCapital = Number((l.paidUpCapital || 0).toFixed(2));
  const retainedEarningsOpening = Number((l.retainedEarningsOpening || 0).toFixed(2));
  const retainedEarningsEnding = Number((retainedEarningsOpening + netProfitLoss).toFixed(2));
  const totalEquity = Number((paidUpCapital + retainedEarningsEnding).toFixed(2));
  const totalLiabilitiesAndEquity = Number((totalLiabilities + totalEquity).toFixed(2));
  const balanceDiff = Number((totalAssets - totalLiabilitiesAndEquity).toFixed(2));
  const isBalanced = Math.abs(balanceDiff) < 0.05;

  const currentRatio =
    totalCurrentLiabilities > 0 ? totalCurrentAssets / totalCurrentLiabilities : 99;
  const debtToEquity = totalEquity > 0 ? totalLiabilities / totalEquity : 0;
  const cashToAssetsPct = totalAssets > 0 ? (cashAndEquivalents / totalAssets) * 100 : 0;
  const workingCapital = Number((totalCurrentAssets - totalCurrentLiabilities).toFixed(2));
  const roaPct = totalAssets > 0 ? (netProfitLoss / totalAssets) * 100 : 0;
  const roePct = totalEquity > 0 ? (netProfitLoss / totalEquity) * 100 : 0;
  const fixedOpEx = sellingExpenses + adminExpenses;
  const breakEvenRevenue =
    grossMarginPct > 1 ? fixedOpEx / (grossMarginPct / 100) : fixedOpEx + costOfServices;
  const capitalRemainingPct = paidUpCapital > 0 ? (totalEquity / paidUpCapital) * 100 : 100;

  // SME Corporate Income Tax (ภ.ง.ด. 50)
  const accountingProfit = profitBeforeTax;
  const taxAddBack = Number((l.taxNonDeductibleAddBack || 0).toFixed(2));
  const adjustedBeforeLoss = accountingProfit + taxAddBack;
  const availCarryforward = Math.max(0, l.taxLossCarryforward5Yr || 0);
  const taxLossCarryforwardUsed =
    adjustedBeforeLoss > 0 ? Math.min(adjustedBeforeLoss, availCarryforward) : 0;
  const netTaxableIncome = Math.max(0, Number((adjustedBeforeLoss - taxLossCarryforwardUsed).toFixed(2)));

  let estimatedSmeCitTax = 0;
  if (netTaxableIncome > 300000) {
    const tier15 = Math.min(netTaxableIncome, 3000000) - 300000;
    const tier20 = Math.max(0, netTaxableIncome - 3000000);
    estimatedSmeCitTax = Number((tier15 * 0.15 + tier20 * 0.2).toFixed(2));
  }

  return {
    cashAndEquivalents,
    receivablesTotal,
    workInProgress,
    otherCurrentAssets,
    totalCurrentAssets,
    relatedPartyLoan,
    toolsCost,
    toolsAccumDep,
    officeCost,
    officeAccumDep,
    totalEquipmentCost,
    totalAccumDep,
    totalDepYear,
    netEquipment,
    totalNonCurrentAssets,
    totalAssets,
    tradeAndOtherPayables,
    totalCurrentLiabilities,
    totalLiabilities,
    registeredCapitalTotal,
    paidUpCapital,
    retainedEarningsOpening,
    netProfitLoss,
    retainedEarningsEnding,
    totalEquity,
    totalLiabilitiesAndEquity,
    balanceDiff,
    isBalanced,
    serviceRevenue,
    otherIncome,
    totalRevenue,
    costOfServices,
    grossProfit,
    grossMarginPct,
    sellingExpenses,
    adminExpenses,
    totalExpenses,
    profitBeforeTax,
    incomeTaxExpense,
    currentRatio,
    debtToEquity,
    cashToAssetsPct,
    workingCapital,
    roaPct,
    roePct,
    breakEvenRevenue,
    capitalRemainingPct,
    accountingProfit,
    taxAddBack,
    taxLossCarryforwardUsed,
    netTaxableIncome,
    estimatedSmeCitTax,
  };
}

/**
 * สร้างร่างงบการเงินประจำปีโดยดึงยอดขาย-ต้นทุน-ลูกหนี้-ภาษีถูกหักจริงจากระบบบัญชี (Firestore)
 */
export function buildLiveLedgerFromApp(
  fiscalYearCe: number,
  documents: AccountingDocument[],
  expenses: Expense[],
  company: CompanyProfile,
  prevYearLedger?: LedgerDraft
): LedgerDraft {
  const yearPrefix = String(fiscalYearCe);

  // Revenue from issued/paid Invoices & Receipts (avoid double counting REC->INV)
  const invWithRec = new Set(
    documents
      .filter((d) => d.type === 'REC' && d.refDocId && d.status !== 'cancelled')
      .map((d) => d.refDocId)
  );
  const yearRevenueDocs = documents.filter((d) => {
    if (d.status === 'cancelled' || d.type === 'QT') return false;
    if (d.type === 'INV' && invWithRec.has(d.id)) return false;
    return (d.docDate || '').startsWith(yearPrefix);
  });

  const serviceRevenue = Number(
    yearRevenueDocs.reduce((s, d) => s + (d.subtotal || 0), 0).toFixed(2)
  );
  const whtDeductedByClients = Number(
    yearRevenueDocs
      .filter((d) => d.whtEnabled)
      .reduce((s, d) => s + (d.whtAmount || 0), 0)
      .toFixed(2)
  );

  // Unpaid issued invoices at year end -> Trade Receivables
  const unpaidInvoices = documents.filter(
    (d) =>
      d.type === 'INV' &&
      !invWithRec.has(d.id) &&
      d.status !== 'paid' &&
      d.status !== 'cancelled' &&
      (d.docDate || '').startsWith(yearPrefix)
  );
  const tradeReceivables = Number(
    unpaidInvoices.reduce((s, d) => s + (d.netPayable || 0), 0).toFixed(2)
  );

  const yearExpenses = expenses.filter((e) => (e.paymentDate || '').startsWith(yearPrefix));
  let costOfServices = 0;
  let sellingExpenses = 0;
  let adminExpenses = 0;

  yearExpenses.forEach((e) => {
    const cat = (e.categoryName || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    if (/โฆษณา|ads|media|การตลาด|ขาย|kol|influencer/.test(cat + ' ' + desc)) {
      sellingExpenses += e.amount;
    } else if (/สำนักงาน|บัญชี|สอบบัญชี|เอกสาร|ค่าเช่า|บริการ/.test(cat + ' ' + desc)) {
      adminExpenses += e.amount;
    } else {
      costOfServices += e.amount;
    }
  });

  // Add annual straight-line depreciation (20% of 5-year equipment cost) if previous equipment exists
  const toolsCost = prevYearLedger?.equipmentToolsCost ?? 43630.0;
  const officeCost = prevYearLedger?.equipmentOfficeCost ?? 56215.0;
  const prevToolsAccum = prevYearLedger?.equipmentToolsAccumDep ?? 12895.59;
  const prevOfficeAccum = prevYearLedger?.equipmentOfficeAccumDep ?? 37357.4;

  const toolsDepYear = Math.min(
    Math.max(0, toolsCost - prevToolsAccum),
    Number((toolsCost * 0.2).toFixed(2))
  );
  const officeDepYear = Math.min(
    Math.max(0, officeCost - prevOfficeAccum),
    Number((officeCost * 0.2).toFixed(2))
  );

  const prevMetrics = prevYearLedger ? computeStatementMetrics(prevYearLedger) : null;
  const prevEndingCash = prevMetrics?.cashAndEquivalents ?? 690783.73;
  const netCashFlowApprox = serviceRevenue - costOfServices - sellingExpenses - adminExpenses;
  const estimatedCashTotal = Math.max(
    0,
    Number((prevEndingCash + netCashFlowApprox - tradeReceivables).toFixed(2))
  );

  return {
    fiscalYearBe: fiscalYearCe + 543,
    fiscalYearCe,
    dataSourceMode: 'live_sync',
    cashOnHand: prevYearLedger?.cashOnHand ?? 531870.24,
    cashAtBank: Math.max(
      0,
      Number((estimatedCashTotal - (prevYearLedger?.cashOnHand ?? 531870.24)).toFixed(2))
    ),
    tradeReceivables,
    accruedInterestReceivable: prevYearLedger?.accruedInterestReceivable ?? 8500.0,
    withholdingTaxAsset: 0,
    revenueDeptReceivable: whtDeductedByClients,
    prepaidExpenses: 0,
    workInProgress: 0,
    otherCurrentAssets: 0,
    relatedPartyLoan: prevYearLedger?.relatedPartyLoan ?? 0,
    equipmentToolsCost: toolsCost,
    equipmentToolsAccumDep: Number((prevToolsAccum + toolsDepYear).toFixed(2)),
    equipmentToolsDepYear: toolsDepYear,
    equipmentOfficeCost: officeCost,
    equipmentOfficeAccumDep: Number((prevOfficeAccum + officeDepYear).toFixed(2)),
    equipmentOfficeDepYear: officeDepYear,
    tradePayables: 0,
    unearnedRevenue: 0,
    customerDeposits: 0,
    accruedExpenses: prevYearLedger?.accruedExpenses ?? 19000.0,
    withholdingTaxPayable: 0,
    otherCurrentLiabilities: 0,
    registeredCapitalShares: 10000,
    parValuePerShare: 100,
    paidUpCapital: 1000000.0,
    retainedEarningsOpening: prevMetrics?.retainedEarningsEnding ?? -270122.58,
    serviceRevenue: Number(serviceRevenue.toFixed(2)),
    otherIncome: 0,
    costOfServices: Number(costOfServices.toFixed(2)),
    sellingExpenses: Number(sellingExpenses.toFixed(2)),
    adminExpenses: Number((adminExpenses + toolsDepYear + officeDepYear).toFixed(2)),
    incomeTaxExpense: 0,
    registrationNumber: (company.taxId || '0105562067888').replace(/\D/g, ''),
    registrationDateTh: '10 เมษายน 2562',
    businessAddress:
      company.address && company.address !== 'กรุงเทพมหานคร ประเทศไทย'
        ? company.address
        : '2365/209 ถนนอ่อนนุช แขวงสวนหลวง เขตสวนหลวง กรุงเทพมหานคร',
    directorName: 'นายสาธิต จันทร์ทนต์',
    cpaFirmName: prevYearLedger?.cpaFirmName || 'บริษัท สปิค ออดิทแอนด์แท็กซ์ จำกัด',
    cpaAuditorName: prevYearLedger?.cpaAuditorName || 'สุภานดา โพธิพิทักษ์',
    cpaLicenseNo: prevYearLedger?.cpaLicenseNo || '10355',
    auditDateTh: '',
    agmMeetingNo: '',
    agmDateTh: '',
    dbdSubmitted: false,
    rdPnd50Submitted: false,
    rdPnd51Submitted: false,
    taxLossCarryforward5Yr: Math.abs(
      Math.min(0, prevMetrics?.retainedEarningsEnding ?? -270122.58)
    ),
    taxNonDeductibleAddBack: 0,
    notesSummary: `ดึงยอดรายการขายและค่าใช้จ่ายจริงจากระบบบัญชีปี พ.ศ. ${fiscalYearCe + 543} (${yearRevenueDocs.length} เอกสารขาย, ${yearExpenses.length} รายจ่าย)`,
  };
}

export function exportAnnualDbdPackageExcel(
  current: LedgerDraft,
  previous: LedgerDraft,
  company: CompanyProfile
): void {
  const curM = computeStatementMetrics(current);
  const prevM = computeStatementMetrics(previous);
  const wb = XLSX.utils.book_new();

  const bsRows = [
    { 'รายการ (หน่วย: บาท)': 'สินทรัพย์หมุนเวียน', [current.fiscalYearBe]: '', [previous.fiscalYearBe]: '' },
    { 'รายการ (หน่วย: บาท)': 'เงินสดและรายการเทียบเท่าเงินสด (หมายเหตุ 4)', [current.fiscalYearBe]: curM.cashAndEquivalents, [previous.fiscalYearBe]: prevM.cashAndEquivalents },
    { 'รายการ (หน่วย: บาท)': 'ลูกหนี้การค้าและลูกหนี้หมุนเวียนอื่น (หมายเหตุ 5)', [current.fiscalYearBe]: curM.receivablesTotal, [previous.fiscalYearBe]: prevM.receivablesTotal },
    { 'รายการ (หน่วย: บาท)': 'งานระหว่างทำ', [current.fiscalYearBe]: curM.workInProgress, [previous.fiscalYearBe]: prevM.workInProgress },
    { 'รายการ (หน่วย: บาท)': 'สินทรัพย์หมุนเวียนอื่น', [current.fiscalYearBe]: curM.otherCurrentAssets, [previous.fiscalYearBe]: prevM.otherCurrentAssets },
    { 'รายการ (หน่วย: บาท)': 'รวมสินทรัพย์หมุนเวียน', [current.fiscalYearBe]: curM.totalCurrentAssets, [previous.fiscalYearBe]: prevM.totalCurrentAssets },
    { 'รายการ (หน่วย: บาท)': 'เงินให้กู้ยืมระยะยาวแก่บุคคลที่เกี่ยวข้องกัน', [current.fiscalYearBe]: curM.relatedPartyLoan, [previous.fiscalYearBe]: prevM.relatedPartyLoan },
    { 'รายการ (หน่วย: บาท)': 'อุปกรณ์ (สุทธิ, หมายเหตุ 6)', [current.fiscalYearBe]: curM.netEquipment, [previous.fiscalYearBe]: prevM.netEquipment },
    { 'รายการ (หน่วย: บาท)': 'รวมสินทรัพย์ไม่หมุนเวียน', [current.fiscalYearBe]: curM.totalNonCurrentAssets, [previous.fiscalYearBe]: prevM.totalNonCurrentAssets },
    { 'รายการ (หน่วย: บาท)': 'รวมสินทรัพย์', [current.fiscalYearBe]: curM.totalAssets, [previous.fiscalYearBe]: prevM.totalAssets },
    { 'รายการ (หน่วย: บาท)': 'หนี้สินหมุนเวียน - เจ้าหนี้และค่าใช้จ่ายค้างจ่าย (หมายเหตุ 7)', [current.fiscalYearBe]: curM.totalCurrentLiabilities, [previous.fiscalYearBe]: prevM.totalCurrentLiabilities },
    { 'รายการ (หน่วย: บาท)': 'ทุนที่ออกและชำระแล้ว (10,000 หุ้น x 100 บาท)', [current.fiscalYearBe]: curM.paidUpCapital, [previous.fiscalYearBe]: prevM.paidUpCapital },
    { 'รายการ (หน่วย: บาท)': 'กำไร (ขาดทุน) สะสมยังไม่ได้จัดสรร', [current.fiscalYearBe]: curM.retainedEarningsEnding, [previous.fiscalYearBe]: prevM.retainedEarningsEnding },
    { 'รายการ (หน่วย: บาท)': 'รวมส่วนของผู้ถือหุ้น', [current.fiscalYearBe]: curM.totalEquity, [previous.fiscalYearBe]: prevM.totalEquity },
    { 'รายการ (หน่วย: บาท)': 'รวมหนี้สินและส่วนของผู้ถือหุ้น', [current.fiscalYearBe]: curM.totalLiabilitiesAndEquity, [previous.fiscalYearBe]: prevM.totalLiabilitiesAndEquity },
  ];

  const isRows = [
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'รายได้จากการให้บริการ', [current.fiscalYearBe]: curM.serviceRevenue, [previous.fiscalYearBe]: prevM.serviceRevenue },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'รายได้อื่น', [current.fiscalYearBe]: curM.otherIncome, [previous.fiscalYearBe]: prevM.otherIncome },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'รวมรายได้', [current.fiscalYearBe]: curM.totalRevenue, [previous.fiscalYearBe]: prevM.totalRevenue },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'ต้นทุนการให้บริการ', [current.fiscalYearBe]: curM.costOfServices, [previous.fiscalYearBe]: prevM.costOfServices },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'กำไรขั้นต้น (Gross Profit)', [current.fiscalYearBe]: curM.grossProfit, [previous.fiscalYearBe]: prevM.grossProfit },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'ค่าใช้จ่ายในการขาย', [current.fiscalYearBe]: curM.sellingExpenses, [previous.fiscalYearBe]: prevM.sellingExpenses },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'ค่าใช้จ่ายในการบริหาร', [current.fiscalYearBe]: curM.adminExpenses, [previous.fiscalYearBe]: prevM.adminExpenses },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'รวมค่าใช้จ่าย', [current.fiscalYearBe]: curM.totalExpenses, [previous.fiscalYearBe]: prevM.totalExpenses },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'กำไร (ขาดทุน) ก่อนภาษีเงินได้', [current.fiscalYearBe]: curM.profitBeforeTax, [previous.fiscalYearBe]: prevM.profitBeforeTax },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'ค่าใช้จ่ายภาษีเงินได้', [current.fiscalYearBe]: curM.incomeTaxExpense, [previous.fiscalYearBe]: prevM.incomeTaxExpense },
    { 'งบกำไรขาดทุน (หน่วย: บาท)': 'กำไร (ขาดทุน) สุทธิ', [current.fiscalYearBe]: curM.netProfitLoss, [previous.fiscalYearBe]: prevM.netProfitLoss },
  ];

  const ratioRows = [
    { 'ตัวชี้วัดและบทวิเคราะห์': 'บริษัท', 'ค่าปีปัจจุบัน': company.companyNameTh, 'ค่าปีก่อน': current.registrationNumber },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'อัตรากำไรขั้นต้น (Gross Margin %)', 'ค่าปีปัจจุบัน': `${curM.grossMarginPct.toFixed(2)}%`, 'ค่าปีก่อน': `${prevM.grossMarginPct.toFixed(2)}%` },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'อัตราส่วนเงินทุนหมุนเวียน (Current Ratio)', 'ค่าปีปัจจุบัน': `${curM.currentRatio.toFixed(2)} เท่า`, 'ค่าปีก่อน': `${prevM.currentRatio.toFixed(2)} เท่า` },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'หนี้สินต่อส่วนผู้ถือหุ้น (D/E Ratio)', 'ค่าปีปัจจุบัน': `${curM.debtToEquity.toFixed(3)} เท่า`, 'ค่าปีก่อน': `${prevM.debtToEquity.toFixed(3)} เท่า` },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'สัดส่วนเงินสดต่อสินทรัพย์รวม (%)', 'ค่าปีปัจจุบัน': `${curM.cashToAssetsPct.toFixed(2)}%`, 'ค่าปีก่อน': `${prevM.cashToAssetsPct.toFixed(2)}%` },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'เงินทุนหมุนเวียนสุทธิ (Working Capital)', 'ค่าปีปัจจุบัน': curM.workingCapital, 'ค่าปีก่อน': prevM.workingCapital },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'จุดคุ้มทุนโดยประมาณ (Break-Even Revenue)', 'ค่าปีปัจจุบัน': Number(curM.breakEvenRevenue.toFixed(2)), 'ค่าปีก่อน': Number(prevM.breakEvenRevenue.toFixed(2)) },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'ผลขาดทุนสะสมยกมา (Tax Loss Carryforward 5 ปี)', 'ค่าปีปัจจุบัน': current.taxLossCarryforward5Yr || 0, 'ค่าปีก่อน': previous.taxLossCarryforward5Yr || 0 },
    { 'ตัวชี้วัดและบทวิเคราะห์': 'ประมาณการภาษีเงินได้นิติบุคคล (ภ.ง.ด. 50 - SME)', 'ค่าปีปัจจุบัน': curM.estimatedSmeCitTax, 'ค่าปีก่อน': prevM.estimatedSmeCitTax },
  ];

  const historyRows = HISTORICAL_YEARS_BE.map((yr) => {
    const m = computeStatementMetrics(AUDITED_BASELINES_BY_YEAR[yr]);
    return {
      'ปี พ.ศ.': yr,
      'เงินสดและเทียบเท่า': m.cashAndEquivalents,
      'สินทรัพย์หมุนเวียน': m.totalCurrentAssets,
      'เงินให้กู้ยืมบุคคลเกี่ยวข้อง': m.relatedPartyLoan,
      'อุปกรณ์สุทธิ': m.netEquipment,
      'สินทรัพย์รวม': m.totalAssets,
      'หนี้สินรวม': m.totalLiabilities,
      'ส่วนของผู้ถือหุ้น': m.totalEquity,
      'รายได้รวม': m.totalRevenue,
      'ค่าใช้จ่ายรวม': m.totalExpenses,
      'กำไร (ขาดทุน) สุทธิ': m.netProfitLoss,
    };
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bsRows), 'งบฐานะการเงิน');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(isRows), 'งบกำไรขาดทุน');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ratioRows), 'บทวิเคราะห์และภาษี');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), 'ประวัติการเงิน 7 ปี');
  XLSX.writeFile(wb, `Jaikla_Financial_Statements_${current.fiscalYearBe}.xlsx`);
}
