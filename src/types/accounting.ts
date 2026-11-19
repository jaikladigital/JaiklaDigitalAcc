import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CompanyProfile {
  companyNameTh: string;
  companyNameEn: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  bankBranch: string;
  bankAccountNo: string;
  bankAccountName: string;
  defaultVatRate: number;
  defaultWhtRate: number;
  logoUrl?: string;
  watermarkUrl?: string;
  stampUrl?: string;
  signatureUrl?: string;
  lineOaId?: string;
  updatedBy?: string;
  updatedAt?: Timestamp;
}

export const DEFAULT_COMPANY_LOGO = '/assets/aistudio/logo-JAIKLA-2025_72dpi_2d3c0b40.png';

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyNameTh: 'บริษัท ใจกล้า ดิจิตอล จำกัด',
  companyNameEn: 'JAIKLA DIGITAL CO., LTD.',
  taxId: '0105562067888',
  branch: 'สำนักงานใหญ่',
  address: '70/574 ซ.คลองหลวง24 หมู่บ้านกฤษดานคร19 หมู่3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120',
  phone: '083-899-9698',
  email: 'jaikladigital@gmail.com',
  bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
  bankBranch: 'สาขากรุงเทพ',
  bankAccountNo: '175-250620-1',
  bankAccountName: 'บริษัท ใจกล้า ดิจิตอล จำกัด',
  defaultVatRate: 7,
  defaultWhtRate: 3,
  logoUrl: DEFAULT_COMPANY_LOGO,
  watermarkUrl: '',
  stampUrl: '',
  signatureUrl: '',
  lineOaId: '@421khbew',
};

export const COMPANY_BILLING_HEADER_TEXT =
  'บริษัท ใจกล้า ดิจิตอล จำกัด เลขประจำตัวผู้เสียภาษี : 0105562067888 สถานที่ตั้ง 70/574 ซ.คลองหลวง24 หมู่บ้านกฤษดานคร19 หมู่3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120 โทรศัพท์ 083-899-9698';

export interface ServiceCategory {
  id: string;
  name: string;
  description?: string;
  defaultWhtRate: number;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Customer {
  id: string;
  companyName: string;
  taxId?: string;
  branch?: string;
  address: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Supplier {
  id: string;
  name: string;
  taxId?: string;
  entityType: 'corporate' | 'individual';
  address?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  categoryId: string;
  categoryName?: string;
  baseRate: number;
  unit?: string;
  rating?: number;
  notes?: string;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ProjectStatus = 'active' | 'completed' | 'cancelled';

export interface Project {
  id: string;
  eventName: string;
  durationStart?: string;
  durationEnd?: string;
  customerId: string;
  customerName?: string;
  status: ProjectStatus;
  budgetLimit?: number;
  notes?: string;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type DocumentType = 'QT' | 'INV' | 'REC';
export type DocumentCopyType = 'original' | 'copy';
export type DocumentStatus = 'draft' | 'issued' | 'approved' | 'paid' | 'cancelled';
export type PaymentMethod = 'transfer' | 'cheque' | 'cash' | 'other';
export type DocumentIssueMode = 'normal' | 'backdated' | 'advance' | 'special';

export interface DocumentItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface InstallmentInfo {
  isInstallment: boolean;
  currentPeriod: number;
  totalPeriods: number;
  percentage: number;
  label: string;
}

export interface WatermarkConfig {
  enabled: boolean;
  mode: 'text' | 'image';
  text: string;
  opacity: number;
  angle: number;
}

export interface CustomerSnapshot {
  companyName: string;
  taxId: string;
  branch: string;
  address: string;
  contactName: string;
  phone: string;
  email?: string;
}

export type EntityLegalType = 'corporate' | 'individual';
export type WhtFormType = 'PND3' | 'PND53' | 'PND1' | 'NONE';

export interface AccountingDocument {
  id: string;
  type: DocumentType;
  docNumber: string;
  docDate: string;
  dueDate?: string;
  copyType: DocumentCopyType;
  refDocId?: string;
  refDocNumber?: string;
  installmentInfo?: InstallmentInfo;
  projectId?: string;
  eventName: string;
  durationText?: string;
  customerId: string;
  customerEntityType?: EntityLegalType;
  customerSnapshot: CustomerSnapshot;
  items: DocumentItem[];
  subtotal: number;
  vatEnabled: boolean;
  vatRate: number;
  vatAmount: number;
  whtEnabled: boolean;
  whtRate: number;
  whtAmount: number;
  grandTotal: number;
  netPayable: number;
  thaiBahtText?: string;
  notesRed?: string;
  termsText?: string;
  paymentMethod?: PaymentMethod;
  paymentBank?: string;
  paymentChequeNo?: string;
  paymentDate?: string;
  watermarkConfig?: WatermarkConfig;
  showStamp?: boolean;
  showSignature?: boolean;
  status: DocumentStatus;
  issueMode?: DocumentIssueMode;
  specialDeliveryDate?: string;
  revisionNumber?: number;
  specialCaseReason?: string;
  showSpecialNoteOnPdf?: boolean;
  lastEditedBy?: string;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type EmergencyPayerType = 'employee' | 'supplier';
export type EmergencyCashStatus = 'pending_reimburse' | 'approved' | 'reimbursed';

export interface Expense {
  id: string;
  projectId: string;
  eventName: string;
  supplierId?: string;
  supplierName: string;
  supplierTaxId?: string;
  supplierAddress?: string;
  payeeEntityType?: EntityLegalType;
  whtFormType?: WhtFormType;
  whtIncomeCode?: string;
  categoryId?: string;
  categoryName?: string;
  description: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  whtRate: number;
  whtAmount: number;
  netPaid: number;
  paymentDate: string;
  monthYear: string;
  receiptUrl?: string;
  extraPhotoUrl?: string;
  scanFileUrl?: string;
  scanFileName?: string;
  scanFileType?: string;
  scanPageCount?: number;
  scanFileSizeBytes?: number;
  wht50TawiNo?: string;
  wht50TawiIssued?: boolean;
  incomeType50Tawi?: string;
  isEmergencyCash?: boolean;
  emergencyVoucherNo?: string;
  payerType?: EmergencyPayerType;
  payerName?: string;
  payerPhone?: string;
  urgencyReason?: string;
  emergencyStatus?: EmergencyCashStatus;
  lineNotifiedAt?: string;
  lineNotifyChannel?: string;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface AnnualFinancialLedger {
  id: string;
  fiscalYearBe: number;
  fiscalYearCe: number;
  dataSourceMode: 'audited' | 'live_sync';
  // Assets
  cashOnHand: number;
  cashAtBank: number;
  tradeReceivables: number;
  accruedInterestReceivable: number;
  withholdingTaxAsset?: number;
  revenueDeptReceivable: number;
  prepaidExpenses?: number;
  workInProgress?: number;
  otherCurrentAssets: number;
  relatedPartyLoan?: number;
  equipmentToolsCost: number;
  equipmentToolsAccumDep: number;
  equipmentToolsDepYear: number;
  equipmentOfficeCost: number;
  equipmentOfficeAccumDep: number;
  equipmentOfficeDepYear: number;
  // Liabilities & Equity
  tradePayables: number;
  unearnedRevenue?: number;
  customerDeposits?: number;
  accruedExpenses: number;
  withholdingTaxPayable?: number;
  otherCurrentLiabilities: number;
  registeredCapitalShares: number;
  parValuePerShare: number;
  paidUpCapital: number;
  retainedEarningsOpening: number;
  // Income Statement
  serviceRevenue: number;
  otherIncome: number;
  costOfServices: number;
  sellingExpenses: number;
  adminExpenses: number;
  incomeTaxExpense: number;
  // Legal / Tax / Filing metadata
  registrationNumber: string;
  registrationDateTh: string;
  businessAddress: string;
  directorName: string;
  cpaFirmName?: string;
  cpaAuditorName?: string;
  cpaLicenseNo?: string;
  auditDateTh?: string;
  agmMeetingNo?: string;
  agmDateTh?: string;
  dbdSubmitted?: boolean;
  rdPnd50Submitted?: boolean;
  rdPnd51Submitted?: boolean;
  taxLossCarryforward5Yr?: number;
  taxNonDeductibleAddBack?: number;
  notesSummary?: string;
  createdBy: string;
  teamUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type UrgentRequestStatus =
  | 'pending_review'
  | 'approved'
  | 'imported'
  | 'rejected';

export interface UrgentExpenseRequest {
  id: string;
  voucherNo: string;
  payerType: EmergencyPayerType;
  payerName: string;
  submitterLineId: string;
  submitterEmail: string;
  submitterPhone: string;
  projectName: string;
  vendorName?: string;
  vendorTaxId?: string;
  description: string;
  urgencyReason?: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  whtRate: number;
  whtAmount: number;
  netPaid: number;
  paymentDate: string;
  receiptUrl?: string;
  extraPhotoUrl?: string;
  status: UrgentRequestStatus;
  importedExpenseId?: string;
  lineNotifiedAt?: string;
  lineNotifyChannel?: string;
  reviewNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export const FIELD_LIMITS = {
  id: 128,
  companyName: 250,
  taxId: 30,
  address: 600,
  contactName: 150,
  phone: 60,
  email: 150,
  notes: 1000,
  eventName: 250,
  description: 500,
  notesRed: 1500,
  termsText: 2000,
  specialCaseReason: 500,
  maxItems: 50,
  maxTeamUids: 30,
};

export function clampString(value: string | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}
