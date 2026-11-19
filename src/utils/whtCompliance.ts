import * as XLSX from 'xlsx';
import {
  AccountingDocument,
  CompanyProfile,
  EntityLegalType,
  Expense,
  Supplier,
  WhtFormType,
} from '../types/accounting';
import { formatShortDate } from './formatters';

export interface WhtIncomeCategoryRule {
  code: string;
  labelTh: string;
  sectionRef: string;
  defaultRate: number;
  applicableForms: Array<'PND3' | 'PND53' | 'PND1'>;
  notes: string;
}

/**
 * อ้างอิงประมวลรัษฎากร มาตรา 3 เตรส และคำสั่งกรมสรรพากรที่ ท.ป. 4/2528
 */
export const WHT_INCOME_CATALOG: WhtIncomeCategoryRule[] = [
  {
    code: '40(8)_service_3',
    labelTh: 'ค่าจ้างทำของ / ค่าบริการ / โปรดักชัน / ออกแบบ / ตัดต่อ',
    sectionRef: 'ท.ป. 4/2528 ข้อ 8',
    defaultRate: 3,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคลยื่น ภ.ง.ด. 53 · บุคคลธรรมดายื่น ภ.ง.ด. 3 (อัตรา 3% เท่ากันเมื่อจ่ายตั้งแต่ 1,000 บาท)',
  },
  {
    code: '40(8)_ads_2',
    labelTh: 'ค่าโฆษณา / ยิงแอด / สื่อประชาสัมพันธ์ / PR',
    sectionRef: 'ท.ป. 4/2528 ข้อ 10',
    defaultRate: 2,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคลยื่น ภ.ง.ด. 53 · บุคคลธรรมดายื่น ภ.ง.ด. 3 (อัตรา 2%)',
  },
  {
    code: '40(8)_transport_1',
    labelTh: 'ค่าขนส่ง / โลจิสติกส์ (ไม่รวมขนส่งสาธารณะ)',
    sectionRef: 'ท.ป. 4/2528 ข้อ 12 จัตวา',
    defaultRate: 1,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคลยื่น ภ.ง.ด. 53 · บุคคลธรรมดายื่น ภ.ง.ด. 3 (อัตรา 1%)',
  },
  {
    code: '40(5)_rent_5',
    labelTh: 'ค่าเช่าทรัพย์สิน / เช่าสตูดิโอ / เช่าอุปกรณ์ / เช่าสถานที่',
    sectionRef: 'ท.ป. 4/2528 ข้อ 5',
    defaultRate: 5,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคลยื่น ภ.ง.ด. 53 · บุคคลธรรมดายื่น ภ.ง.ด. 3 (อัตรา 5%)',
  },
  {
    code: '40(6)_professional_3',
    labelTh: 'ค่าวิชาชีพอิสระ (บัญชี / สอบบัญชี / กฎหมาย / สถาปัตย์ / วิศวกรรม)',
    sectionRef: 'ท.ป. 4/2528 ข้อ 7',
    defaultRate: 3,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคลยื่น ภ.ง.ด. 53 · บุคคลธรรมดายื่น ภ.ง.ด. 3 (อัตรา 3%)',
  },
  {
    code: '40(3)_royalty_3',
    labelTh: 'ค่าสิทธิ / ลิขสิทธิ์ / ซอฟต์แวร์ / เพลง / ภาพ',
    sectionRef: 'มาตรา 40(3) / ท.ป. 4/2528',
    defaultRate: 3,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคลยื่น ภ.ง.ด. 53 (3%) · บุคคลธรรมดาตามขั้นบันไดหรือเกณฑ์ ภ.ง.ด. 3',
  },
  {
    code: '40(8)_prize_5',
    labelTh: 'รางวัลในการประกวด แข่งขัน ชิงโชค หรือส่งเสริมการขาย',
    sectionRef: 'ท.ป. 4/2528 ข้อ 9',
    defaultRate: 5,
    applicableForms: ['PND3', 'PND53'],
    notes: 'อัตรา 5% ทั้งบุคคลธรรมดา (ภ.ง.ด. 3) และนิติบุคคล (ภ.ง.ด. 53)',
  },
  {
    code: '40(2)_commission_3',
    labelTh: 'ค่านายหน้า / ค่าคอมมิชชัน / เบี้ยประชุม / รีวิว Influencer 40(2)',
    sectionRef: 'มาตรา 40(2)',
    defaultRate: 3,
    applicableForms: ['PND3', 'PND53'],
    notes: 'นิติบุคคล ภ.ง.ด. 53 หัก 3% · บุคคลธรรมดา ภ.ง.ด. 3 คำนวณอัตราก้าวหน้าตามมาตรา 50(1) หรือหักตามข้อตกลง 40(8) หากเป็นรับจ้างอิสระ',
  },
  {
    code: '40(1)_salary',
    labelTh: 'เงินเดือน / ค่าจ้างประจำพนักงาน (มาตรา 40(1))',
    sectionRef: 'มาตรา 50(1)',
    defaultRate: 0,
    applicableForms: ['PND1'],
    notes: 'ยื่นแบบ ภ.ง.ด. 1 (ไม่รวมใน ภ.ง.ด. 3 หรือ ภ.ง.ด. 53)',
  },
];

export interface TaxIdValidationResult {
  digits: string;
  isValidFormat: boolean;
  checksumValid: boolean;
  detectedEntityType: EntityLegalType | 'unknown';
  reason: string;
}

/**
 * ตรวจสอบเลขประจำตัวผู้เสียภาษี 13 หลักตามโครงสร้างกรมสรรพากรและกรมการปกครอง
 * - ขึ้นต้นด้วย 0: นิติบุคคล (บริษัทจำกัด, หจก., นิติบุคคลต่างประเทศ) -> ภ.ง.ด. 53
 * - ขึ้นต้นด้วย 1-8: บุคคลธรรมดา / คณะบุคคล -> ภ.ง.ด. 3
 */
export function validateThaiTaxId(rawTaxId?: string): TaxIdValidationResult {
  const digits = (rawTaxId || '').replace(/\D/g, '');
  if (!digits) {
    return {
      digits: '',
      isValidFormat: false,
      checksumValid: false,
      detectedEntityType: 'unknown',
      reason: 'ยังไม่ได้กรอกเลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน 13 หลัก',
    };
  }
  if (digits.length !== 13) {
    return {
      digits,
      isValidFormat: false,
      checksumValid: false,
      detectedEntityType: digits.startsWith('0') ? 'corporate' : 'individual',
      reason: `เลขผู้เสียภาษีมี ${digits.length} หลัก (ตามระเบียบกรมสรรพากรต้องมี 13 หลัก)`,
    };
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  const checksumValid = checkDigit === Number(digits[12]);

  const first = digits[0];
  const detectedEntityType: EntityLegalType | 'unknown' =
    first === '0' ? 'corporate' : /^[1-8]$/.test(first) ? 'individual' : 'unknown';

  return {
    digits,
    isValidFormat: true,
    checksumValid,
    detectedEntityType,
    reason: checksumValid
      ? detectedEntityType === 'corporate'
        ? 'เลขทะเบียนนิติบุคคล 13 หลักถูกต้อง (ภ.ง.ด. 53)'
        : 'เลขประจำตัวบุคคลธรรมดา 13 หลักถูกต้อง (ภ.ง.ด. 3)'
      : 'ตัวเลขครบ 13 หลัก แต่ Checksum หลักที่ 13 ไม่ตรง — กรุณาตรวจทานเลขหน้าบัตร/หนังสือรับรอง',
  };
}

export function resolveExpenseEntityAndForm(
  expense: Expense,
  suppliers: Supplier[]
): { entityType: EntityLegalType; formType: WhtFormType } {
  const sup = expense.supplierId
    ? suppliers.find((s) => s.id === expense.supplierId)
    : suppliers.find((s) => s.name.trim() === expense.supplierName.trim());

  const taxCheck = validateThaiTaxId(expense.supplierTaxId || sup?.taxId);

  let entityType: EntityLegalType =
    expense.payeeEntityType ||
    sup?.entityType ||
    (taxCheck.detectedEntityType !== 'unknown' ? taxCheck.detectedEntityType : 'corporate');

  if (
    !expense.payeeEntityType &&
    !sup &&
    /(นาย|นาง|นางสาว|คุณ|ฟรีแลนซ์|ช่างภาพอิสระ|Freelance)/i.test(expense.supplierName)
  ) {
    entityType = 'individual';
  }

  let formType: WhtFormType = expense.whtFormType || (expense.whtAmount > 0 ? (entityType === 'individual' ? 'PND3' : 'PND53') : 'NONE');
  if (expense.whtIncomeCode === '40(1)_salary') {
    formType = 'PND1';
  }

  return { entityType, formType };
}

export interface WhtAuditIssue {
  severity: 'ok' | 'warning' | 'error';
  message: string;
}

export interface ExpenseWhtAuditResult {
  expense: Expense;
  entityType: EntityLegalType;
  formType: WhtFormType;
  taxIdCheck: TaxIdValidationResult;
  issues: WhtAuditIssue[];
  status: 'compliant' | 'attention' | 'non_applicable';
}

export function auditExpenseWht(
  expense: Expense,
  suppliers: Supplier[]
): ExpenseWhtAuditResult {
  const { entityType, formType } = resolveExpenseEntityAndForm(expense, suppliers);
  const taxIdCheck = validateThaiTaxId(expense.supplierTaxId);
  const issues: WhtAuditIssue[] = [];

  if (expense.whtAmount <= 0 && expense.whtRate <= 0) {
    if (expense.amount >= 1000 && !expense.isEmergencyCash) {
      issues.push({
        severity: 'warning',
        message: 'ยอดก่อน VAT ≥ 1,000 บาท — ตรวจสอบว่าเข้าข่ายบริการ/ค่าเช่าที่ต้องหัก ณ ที่จ่ายหรือไม่',
      });
    }
    return {
      expense,
      entityType,
      formType: 'NONE',
      taxIdCheck,
      issues,
      status: issues.length > 0 ? 'attention' : 'non_applicable',
    };
  }

  // Has WHT deducted
  if (!taxIdCheck.isValidFormat) {
    issues.push({
      severity: 'error',
      message: taxIdCheck.reason,
    });
  } else if (!taxIdCheck.checksumValid) {
    issues.push({
      severity: 'warning',
      message: taxIdCheck.reason,
    });
  }

  if (
    taxIdCheck.detectedEntityType !== 'unknown' &&
    taxIdCheck.detectedEntityType !== entityType
  ) {
    issues.push({
      severity: 'error',
      message:
        taxIdCheck.detectedEntityType === 'corporate'
          ? 'เลข Tax ID ขึ้นต้นด้วย 0 (นิติบุคคล) แต่เลือกแบบบุคคลธรรมดา ภ.ง.ด. 3'
          : 'เลขบัตรขึ้นต้นด้วย 1-8 (บุคคลธรรมดา) แต่เลือกแบบนิติบุคคล ภ.ง.ด. 53',
    });
  }

  if (!(expense.supplierAddress || '').trim()) {
    issues.push({
      severity: 'warning',
      message: 'ยังไม่มีที่อยู่ผู้ถูกหักภาษีบนหนังสือรับรอง 50 ทวิ',
    });
  }

  if (expense.amount > 0 && expense.amount < 1000) {
    issues.push({
      severity: 'warning',
      message:
        'ยอดจ่ายครั้งเดียว < 1,000 บาท (ตาม ท.ป. 4/2528 ข้อ 12 ทวิ ยกเว้นการหัก เว้นแต่เป็นสัญญาระยะยาวต่อเนื่อง)',
    });
  }

  if (!expense.wht50TawiIssued) {
    issues.push({
      severity: 'warning',
      message: 'ยังไม่ได้ออกเลขหนังสือรับรอง 50 ทวิ',
    });
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warning');

  return {
    expense,
    entityType,
    formType,
    taxIdCheck,
    issues,
    status: hasError || hasWarn ? 'attention' : 'compliant',
  };
}

export function auditDocumentWht(doc: AccountingDocument): WhtAuditIssue[] {
  const issues: WhtAuditIssue[] = [];
  if (!doc.whtEnabled || doc.whtAmount <= 0) return issues;

  const custTax = validateThaiTaxId(doc.customerSnapshot?.taxId);
  const custType =
    doc.customerEntityType ||
    (custTax.detectedEntityType !== 'unknown' ? custTax.detectedEntityType : 'corporate');

  if (custType === 'individual') {
    issues.push({
      severity: 'error',
      message:
        'ผู้จ่ายเงินเป็น "บุคคลธรรมดา" — ตามมาตรา 3 เตรส บุคคลธรรมดาที่จ่ายค่าบริการให้บริษัทจำกัดไม่มีหน้าที่หัก ภ.ง.ด. 53 (เว้นแต่กรณีโอนขายอสังหาฯ หรือกรณีเฉพาะตามกฎหมาย)',
    });
  }
  if (!custTax.isValidFormat) {
    issues.push({
      severity: 'warning',
      message: 'ยังไม่ได้ระบุ Tax ID 13 หลักของลูกค้าสำหรับติดตามหนังสือรับรอง 50 ทวิ ที่ลูกค้าหักบริษัทไว้',
    });
  }
  return issues;
}

export function getWhtFilingDeadlines(monthYear: string): {
  paperDeadlineTh: string;
  eFilingDeadlineTh: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(monthYear);
  if (!match) {
    return {
      paperDeadlineTh: 'ภายในวันที่ 7 ของเดือนถัดไป',
      eFilingDeadlineTh: 'ภายในวันที่ 15 ของเดือนถัดไป',
    };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextMonthDate = new Date(year, month, 1); // JS month is 0-indexed, so `month` is next month
  const nextYearBe = nextMonthDate.getFullYear() + 543;
  const nextMonthName = nextMonthDate.toLocaleDateString('th-TH', { month: 'long' });

  return {
    paperDeadlineTh: `7 ${nextMonthName} ${nextYearBe}`,
    eFilingDeadlineTh: `15 ${nextMonthName} ${nextYearBe}`,
  };
}

export function exportPndAttachmentExcel(
  monthYear: string,
  formType: 'PND3' | 'PND53',
  audits: ExpenseWhtAuditResult[],
  company: CompanyProfile
): void {
  const rows = audits.filter((a) => a.formType === formType && a.expense.whtAmount > 0);
  const wb = XLSX.utils.book_new();
  const title = formType === 'PND3' ? 'ใบแนบ ภ.ง.ด. 3 (บุคคลธรรมดา)' : 'ใบแนบ ภ.ง.ด. 53 (นิติบุคคล)';

  const dataRows = rows.map((item, idx) => ({
    'ลำดับ': idx + 1,
    'เลขผู้มีหน้าที่หักภาษี (บริษัท)': company.taxId,
    'เลขประจำตัวผู้เสียภาษีผู้ถูกหัก (13 หลัก)': (item.expense.supplierTaxId || '').replace(/\D/g, ''),
    'ชื่อ-สกุล / ชื่อนิติบุคคลผู้รับเงิน': item.expense.supplierName,
    'ที่อยู่ผู้รับเงิน': item.expense.supplierAddress || '-',
    'วัน/เดือน/ปี ที่จ่าย': formatShortDate(item.expense.paymentDate),
    'ประเภทเงินได้ (ม.40)': item.expense.incomeType50Tawi || 'ค่าจ้างทำของ / ค่าบริการ',
    'อัตราภาษี (%)': item.expense.whtRate,
    'จำนวนเงินที่จ่าย (ก่อน VAT)': Number(item.expense.amount.toFixed(2)),
    'จำนวนเงินภาษีที่หักและนำส่ง': Number(item.expense.whtAmount.toFixed(2)),
    'เลขที่หนังสือรับรอง 50 ทวิ': item.expense.wht50TawiNo || 'รอออกเลข',
    'เงื่อนไขการหัก': '1 (หัก ณ ที่จ่าย)',
  }));

  const totalBase = rows.reduce((s, r) => s + r.expense.amount, 0);
  const totalTax = rows.reduce((s, r) => s + r.expense.whtAmount, 0);

  dataRows.push({
    'ลำดับ': rows.length + 1,
    'เลขผู้มีหน้าที่หักภาษี (บริษัท)': '',
    'เลขประจำตัวผู้เสียภาษีผู้ถูกหัก (13 หลัก)': '',
    'ชื่อ-สกุล / ชื่อนิติบุคคลผู้รับเงิน': 'รวมทั้งสิ้น',
    'ที่อยู่ผู้รับเงิน': '',
    'วัน/เดือน/ปี ที่จ่าย': '',
    'ประเภทเงินได้ (ม.40)': title,
    'อัตราภาษี (%)': 0,
    'จำนวนเงินที่จ่าย (ก่อน VAT)': Number(totalBase.toFixed(2)),
    'จำนวนเงินภาษีที่หักและนำส่ง': Number(totalTax.toFixed(2)),
    'เลขที่หนังสือรับรอง 50 ทวิ': '',
    'เงื่อนไขการหัก': '',
  });

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRows), formType);
  XLSX.writeFile(wb, `Jaikla_${formType}_${monthYear}.xlsx`);
}
