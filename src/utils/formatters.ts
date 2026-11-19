import * as XLSX from 'xlsx';
import { AccountingDocument, DocumentType, Expense } from '../types/accounting';

export function formatTHB(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function sanitizeDecimalInput(raw: string): { text: string; value: number } {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return { text: '', value: 0 };

  const dotIdx = cleaned.indexOf('.');
  let normalized =
    dotIdx >= 0
      ? `${cleaned.slice(0, dotIdx)}.${cleaned.slice(dotIdx + 1).replace(/\./g, '')}`
      : cleaned;

  if (normalized.startsWith('.')) {
    normalized = `0${normalized}`;
  } else {
    normalized = normalized.replace(/^0+(?=\d)/, '');
  }

  const num = Number(normalized);
  return {
    text: normalized,
    value: Number.isFinite(num) ? Math.max(0, num) : 0,
  };
}

export interface TaxSplitInput {
  mode: 'before_vat' | 'gross_total';
  inputAmount: number;
  vatRate: number;
  whtRate: number;
  grossIncludesWhtDeduction?: boolean;
}

export interface TaxSplitResult {
  amountBeforeVat: number;
  vatAmount: number;
  whtAmount: number;
  netPaid: number;
}

export function calculateExpenseAmounts(input: TaxSplitInput): TaxSplitResult {
  const safeInput = Number.isFinite(input.inputAmount) ? Math.max(0, input.inputAmount) : 0;
  const safeVatRate = Number.isFinite(input.vatRate) ? Math.max(0, input.vatRate) : 0;
  const safeWhtRate = Number.isFinite(input.whtRate) ? Math.max(0, input.whtRate) : 0;

  if (safeInput <= 0) {
    return { amountBeforeVat: 0, vatAmount: 0, whtAmount: 0, netPaid: 0 };
  }

  if (input.mode === 'before_vat') {
    const amountBeforeVat = Number(safeInput.toFixed(2));
    const vatAmount = Number(((amountBeforeVat * safeVatRate) / 100).toFixed(2));
    const whtAmount = Number(((amountBeforeVat * safeWhtRate) / 100).toFixed(2));
    const netPaid = Number((amountBeforeVat + vatAmount - whtAmount).toFixed(2));
    return { amountBeforeVat, vatAmount, whtAmount, netPaid };
  }

  // mode === 'gross_total': user entered full/total bill amount
  if (input.grossIncludesWhtDeduction && safeWhtRate > 0) {
    // User entered net cash paid after +VAT and -WHT:
    // netPaid = base * (1 + vatRate/100 - whtRate/100)
    const factor = 1 + safeVatRate / 100 - safeWhtRate / 100;
    const amountBeforeVat =
      factor > 0 ? Number((safeInput / factor).toFixed(2)) : Number(safeInput.toFixed(2));
    const vatAmount = Number(((amountBeforeVat * safeVatRate) / 100).toFixed(2));
    const whtAmount = Number(
      Math.max(0, amountBeforeVat + vatAmount - safeInput).toFixed(2)
    );
    const netPaid = Number(safeInput.toFixed(2));
    return { amountBeforeVat, vatAmount, whtAmount, netPaid };
  }

  // Standard receipt/invoice total (Base + VAT):
  // total = base * (1 + vatRate/100)
  const vatFactor = 1 + safeVatRate / 100;
  const amountBeforeVat = Number((safeInput / vatFactor).toFixed(2));
  const vatAmount =
    safeVatRate > 0 ? Number(Math.max(0, safeInput - amountBeforeVat).toFixed(2)) : 0;
  const whtAmount = Number(((amountBeforeVat * safeWhtRate) / 100).toFixed(2));
  const netPaid = Number((amountBeforeVat + vatAmount - whtAmount).toFixed(2));
  return { amountBeforeVat, vatAmount, whtAmount, netPaid };
}

export function getDaysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

export function formatThaiDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDatePresetISO(
  preset: 'prevMonthSameDay' | 'prevMonthEnd' | 'today' | 'nextMonthStart' | 'nextMonthSameDay'
): string {
  const now = new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'prevMonthSameDay') {
    target = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  } else if (preset === 'prevMonthEnd') {
    target = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (preset === 'nextMonthStart') {
    target = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  } else if (preset === 'nextMonthSameDay') {
    target = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getMonthYearFromDate(dateStr: string): string {
  if (/^\d{4}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 7);
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function generateDocNumber(
  type: DocumentType,
  existingDocs: AccountingDocument[],
  targetDateIso?: string
): string {
  const match = targetDateIso ? /^(\d{4})-(\d{2})/.exec(targetDateIso) : null;
  const now = new Date();
  const yy = match ? match[1].slice(-2) : String(now.getFullYear()).slice(-2);
  const mm = match ? match[2] : String(now.getMonth() + 1).padStart(2, '0');
  const prefix =
    type === 'QT'
      ? `QUO_JKD${yy}${mm}`
      : type === 'INV'
        ? `INV-JKD-${yy}${mm}`
        : `Rec-JKD-${yy}${mm}`;

  const matchingCount = existingDocs.filter(
    (d) => d.type === type && d.docNumber.startsWith(prefix)
  ).length;
  const seq = String(matchingCount + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

export function buildRevisionDocNumber(baseDocNumber: string, nextRevision: number): string {
  const stripped = baseDocNumber.replace(/-R\d+$/i, '');
  return `${stripped}-R${Math.max(1, nextRevision)}`;
}

export function generate50TawiNumber(existingExpenses: Expense[]): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const issuedCount = existingExpenses.filter((e) => e.wht50TawiIssued).length + 1;
  return `50TW-${yy}${mm}-${String(issuedCount).padStart(3, '0')}`;
}

export function generateEmergencyVoucherNumber(
  existingExpenses: Expense[],
  targetDateIso?: string
): string {
  const match = targetDateIso ? /^(\d{4})-(\d{2})/.exec(targetDateIso) : null;
  const now = new Date();
  const yy = match ? match[1].slice(-2) : String(now.getFullYear()).slice(-2);
  const mm = match ? match[2] : String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `ECV-JKD-${yy}${mm}`;
  const count = existingExpenses.filter(
    (e) => e.isEmergencyCash && (e.emergencyVoucherNo || '').startsWith(prefix)
  ).length;
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

export function exportMonthlyBudgetExcel(
  monthLabel: string,
  summaryRows: Array<{
    monthYear: string;
    revenue: number;
    vatOutput: number;
    whtDeductedByClients: number;
    expenses: number;
    vatInput: number;
    whtWithheldFromSuppliers: number;
    netProfit: number;
  }>,
  documents: AccountingDocument[],
  expenses: Expense[]
) {
  const wb = XLSX.utils.book_new();

  const summarySheetData = summaryRows.map((r) => ({
    'เดือน (YYYY-MM)': r.monthYear,
    'รายรับ (ก่อน VAT)': Number(r.revenue.toFixed(2)),
    'VAT ขาย (7%)': Number(r.vatOutput.toFixed(2)),
    'ภาษีถูกหัก ณ ที่จ่าย (ลูกค้าหัก)': Number(r.whtDeductedByClients.toFixed(2)),
    'รายจ่าย (ก่อน VAT)': Number(r.expenses.toFixed(2)),
    'VAT ซื้อ': Number(r.vatInput.toFixed(2)),
    'ภาษีหัก ณ ที่จ่าย (หักซัพพลายเยอร์)': Number(r.whtWithheldFromSuppliers.toFixed(2)),
    'กำไรสุทธิ (ก่อนภาษี)': Number(r.netProfit.toFixed(2)),
  }));

  const docsSheetData = documents.map((d) => ({
    'เลขที่เอกสาร': d.docNumber,
    'ประเภท': d.type,
    'วันที่': d.docDate,
    'โหมดการออกเอกสาร': d.issueMode || 'normal',
    'วันส่งมอบพิเศษ': d.specialDeliveryDate || '-',
    'ครั้งที่แก้ไข': d.revisionNumber || 0,
    'โปรเจกต์ / Event': d.eventName,
    'ลูกค้า': d.customerSnapshot.companyName,
    'สถานะ': d.status,
    'ยอดก่อน VAT': d.subtotal,
    'VAT': d.vatAmount,
    'รวมทั้งสิ้น': d.grandTotal,
    'หัก ณ ที่จ่าย': d.whtAmount,
    'ยอดสุทธิ': d.netPayable,
  }));

  const expSheetData = expenses.map((e) => ({
    'เดือน': e.monthYear,
    'วันที่จ่าย': e.paymentDate,
    'ประเภท': e.isEmergencyCash ? 'เงินสดฉุกเฉิน' : 'รายจ่ายทั่วไป',
    'เลขที่ใบเบิกฉุกเฉิน': e.emergencyVoucherNo || '-',
    'ผู้สำรองจ่าย': e.isEmergencyCash
      ? `${e.payerType === 'supplier' ? 'ซัพพลายเยอร์' : 'พนักงาน'}: ${e.payerName || '-'}`
      : '-',
    'สถานะเบิกคืนฉุกเฉิน': e.isEmergencyCash ? e.emergencyStatus || 'pending_reimburse' : '-',
    'โปรเจกต์ / Event': e.eventName,
    'ซัพพลายเยอร์ / ร้านค้า': e.supplierName,
    'หมวดหมู่': e.categoryName || '-',
    'รายละเอียด': e.description,
    'จำนวนเงิน': e.amount,
    'VAT': e.vatAmount,
    'WHT หักไว้': e.whtAmount,
    'จ่ายสุทธิ': e.netPaid,
    'เลขที่ 50 ทวิ': e.wht50TawiNo || '-',
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheetData), 'Monthly Budget');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docsSheetData), 'Documents');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expSheetData), 'Expenses & 50Tawi');

  XLSX.writeFile(wb, `Jaikla_Digital_Budget_${monthLabel}.xlsx`);
}
