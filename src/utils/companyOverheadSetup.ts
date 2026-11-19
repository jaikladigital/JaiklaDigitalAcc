import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import {
  CompanyProfile,
  Customer,
  DEFAULT_COMPANY_PROFILE,
  FIELD_LIMITS,
  Project,
  ServiceCategory,
  clampString,
} from '../types/accounting';
import { getTodayISO } from './formatters';

export type OverheadKind = 'selling' | 'admin';

export const OVERHEAD_PROJECT_PRESETS: Record<
  OverheadKind,
  {
    key: OverheadKind;
    eventName: string;
    shortLabel: string;
    statementGroupLabel: string;
    notes: string;
  }
> = {
  selling: {
    key: 'selling',
    eventName: 'ค่าใช้จ่ายในการขายและพบลูกค้า (Selling & Client Travel)',
    shortLabel: 'ค่าใช้จ่ายขาย / เดินทางพบลูกค้า',
    statementGroupLabel: 'ค่าใช้จ่ายในการขาย (Selling Expenses)',
    notes:
      'โปรเจกต์กลางสำหรับค่าชาร์จ EV ค่าน้ำมัน ค่าทางด่วน ค่าเดินทางค้นหา/เข้าพบลูกค้า และค่ารับรองลูกค้า',
  },
  admin: {
    key: 'admin',
    eventName: 'กิจกรรมสำนักงานและบริหารทั่วไป (Admin & Office Overhead)',
    shortLabel: 'กิจกรรมสำนักงานและบริหารทั่วไป',
    statementGroupLabel: 'ค่าใช้จ่ายในการบริหาร (Admin Expenses)',
    notes:
      'โปรเจกต์กลางสำหรับค่าใช้จ่ายทั่วไปของสำนักงาน ค่าเดินทางติดต่องานธุรการ บัญชี และค่าสาธารณูปโภค',
  },
};

export const OVERHEAD_CATEGORY_PRESETS: Array<{
  kind: OverheadKind;
  name: string;
  description: string;
  defaultWhtRate: number;
}> = [
  {
    kind: 'selling',
    name: 'ค่าเดินทางและพาหนะ (ค่าใช้จ่ายขาย / พบลูกค้า)',
    description: 'ค่าชาร์จ EV ค่าน้ำมัน ค่าทางด่วน ค่าเดินทางเข้าพบหรือค้นหาลูกค้า',
    defaultWhtRate: 0,
  },
  {
    kind: 'selling',
    name: 'ค่ารับรองและพบลูกค้า (ค่าใช้จ่ายขาย)',
    description: 'ค่าอาหาร เครื่องดื่ม ของขวัญ และค่ารับรองลูกค้า (VAT ต้องห้าม)',
    defaultWhtRate: 0,
  },
  {
    kind: 'admin',
    name: 'ค่าใช้จ่ายบริหารและสำนักงานทั่วไป',
    description: 'ค่าเดินทางติดต่องานสำนักงาน อุปกรณ์สำนักงาน และค่าบริหารทั่วไป',
    defaultWhtRate: 0,
  },
];

export function detectOverheadProjectKind(project?: Pick<Project, 'eventName'> | null): OverheadKind | null {
  if (!project) return null;
  const name = (project.eventName || '').toLowerCase();
  if (
    name.includes('ค่าใช้จ่ายในการขาย') ||
    name.includes('พบลูกค้า') ||
    name.includes('selling')
  ) {
    return 'selling';
  }
  if (
    name.includes('กิจกรรมสำนักงาน') ||
    name.includes('บริหารทั่วไป') ||
    name.includes('admin') ||
    name.includes('overhead')
  ) {
    return 'admin';
  }
  return null;
}

export function isInternalCompanyCustomer(
  c: Customer,
  company: CompanyProfile
): boolean {
  const name = (c.companyName || '').toLowerCase();
  const companyTh = (company.companyNameTh || DEFAULT_COMPANY_PROFILE.companyNameTh).toLowerCase();
  return (
    name.includes('ภายในองค์กร') ||
    name.includes('ค่าใช้จ่ายทั่วไป') ||
    (name.includes(companyTh) && name.includes('ภายใน'))
  );
}

export function detectNonDeductibleVatRisk(text: string): {
  likelyNonDeductible: boolean;
  reason: string;
} {
  const clean = (text || '').toLowerCase();
  if (/รับรอง|อาหาร|กาแฟ|เครื่องดื่ม|เลี้ยงรับรอง|ของขวัญ/.test(clean)) {
    return {
      likelyNonDeductible: true,
      reason: 'ค่ารับรอง/อาหาร/เครื่องดื่ม เป็นภาษีซื้อต้องห้าม (แนะนำรวม VAT เป็นค่าใช้จ่ายทั้งก้อน)',
    };
  }
  if (/ชาร์จ|ev|elexa|pea|น้ำมัน|เชื้อเพลิง|ทางด่วน|ค่าจอด/.test(clean)) {
    return {
      likelyNonDeductible: true,
      reason:
        'ค่าชาร์จ EV/น้ำมัน สำหรับรถส่วนตัวหรือรถยนต์นั่ง ≤ 10 ที่นั่ง ขอคืน VAT ซื้อไม่ได้ (เว้นแต่รถกระบะ/รถบริษัทเกิน 10 ที่นั่ง)',
    };
  }
  return { likelyNonDeductible: false, reason: '' };
}

export function suggestCategoryForExpenseText(
  text: string,
  categories: ServiceCategory[],
  overheadKind?: OverheadKind | null
): ServiceCategory | undefined {
  const lower = (text || '').toLowerCase();
  if (/รับรอง|อาหาร|กาแฟ|เครื่องดื่ม|เลี้ยง/.test(lower)) {
    const match = categories.find((c) => c.name.includes('รับรอง'));
    if (match) return match;
  }
  if (/ชาร์จ|ev|elexa|pea|น้ำมัน|เดินทาง|พาหนะ|ทางด่วน|วิน|แท็กซี่/.test(lower)) {
    const match = categories.find(
      (c) => c.name.includes('เดินทาง') || c.name.includes('พาหนะ')
    );
    if (match) return match;
  }
  if (overheadKind === 'admin' || /สำนักงาน|เอกสาร|ธนาคาร|ไปรษณีย์|บริหาร/.test(lower)) {
    const match = categories.find(
      (c) => c.name.includes('สำนักงาน') || c.name.includes('บริหาร')
    );
    if (match) return match;
  }
  if (overheadKind === 'selling') {
    const match = categories.find(
      (c) => c.name.includes('ขาย') || c.name.includes('พบลูกค้า') || c.name.includes('เดินทาง')
    );
    if (match) return match;
  }
  return categories[0];
}

export function checkOverheadReadiness(
  company: CompanyProfile,
  customers: Customer[],
  projects: Project[],
  categories: ServiceCategory[]
) {
  const internalCustomer = customers.find((c) => isInternalCompanyCustomer(c, company));
  const sellingProject = projects.find((p) => detectOverheadProjectKind(p) === 'selling');
  const adminProject = projects.find((p) => detectOverheadProjectKind(p) === 'admin');
  const missingCategories = OVERHEAD_CATEGORY_PRESETS.filter(
    (preset) => !categories.some((c) => c.name.trim() === preset.name.trim())
  );

  return {
    internalCustomer,
    sellingProject,
    adminProject,
    missingCategories,
    isFullyReady:
      Boolean(internalCustomer) &&
      Boolean(sellingProject) &&
      Boolean(adminProject) &&
      missingCategories.length === 0,
  };
}

export async function ensureCompanyOverheadInfrastructure(params: {
  uid: string;
  teamUids: string[];
  company: CompanyProfile;
  customers: Customer[];
  projects: Project[];
  categories: ServiceCategory[];
}): Promise<{
  customerId: string;
  customerName: string;
  sellingProjectId: string;
  sellingProjectName: string;
  adminProjectId: string;
  adminProjectName: string;
  createdCategories: ServiceCategory[];
  createdCount: number;
}> {
  const { uid, teamUids, company, customers, projects, categories } = params;
  const activeTeam = Array.from(new Set([uid, ...teamUids])).slice(0, FIELD_LIMITS.maxTeamUids);
  let createdCount = 0;

  // 1. Ensure Internal Customer
  let customer = customers.find((c) => isInternalCompanyCustomer(c, company));
  let customerId = customer?.id || '';
  let customerName = customer?.companyName || '';

  if (!customerId) {
    const baseName = company.companyNameTh || DEFAULT_COMPANY_PROFILE.companyNameTh;
    customerName = clampString(`${baseName} (ภายในองค์กร / ค่าใช้จ่ายทั่วไป)`, FIELD_LIMITS.companyName);
    const refCust = await addDoc(collection(db, 'customers'), {
      companyName: customerName,
      taxId: clampString(company.taxId || DEFAULT_COMPANY_PROFILE.taxId, FIELD_LIMITS.taxId),
      branch: clampString(company.branch || 'สำนักงานใหญ่', 100),
      address: clampString(
        company.address || DEFAULT_COMPANY_PROFILE.address,
        FIELD_LIMITS.address
      ),
      contactName: clampString(company.directorName || '', FIELD_LIMITS.contactName),
      phone: clampString(company.phone || '', FIELD_LIMITS.phone),
      email: clampString(company.email || '', FIELD_LIMITS.email),
      notes: 'บัญชีภายในบริษัทสำหรับผูกโปรเจกต์กลางค่าใช้จ่ายทั่วไป (Selling & Admin Overhead)',
      createdBy: uid,
      teamUids: activeTeam,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    customerId = refCust.id;
    createdCount += 1;
  }

  // 2. Ensure Overhead Projects (Selling + Admin)
  const today = getTodayISO();
  let sellingProject = projects.find((p) => detectOverheadProjectKind(p) === 'selling');
  let sellingProjectId = sellingProject?.id || '';
  let sellingProjectName =
    sellingProject?.eventName || OVERHEAD_PROJECT_PRESETS.selling.eventName;

  if (!sellingProjectId) {
    const preset = OVERHEAD_PROJECT_PRESETS.selling;
    const refProj = await addDoc(collection(db, 'projects'), {
      eventName: clampString(preset.eventName, FIELD_LIMITS.eventName),
      durationStart: today,
      durationEnd: `${today.slice(0, 4)}-12-31`,
      customerId,
      customerName,
      status: 'active',
      budgetLimit: 0,
      notes: preset.notes,
      createdBy: uid,
      teamUids: activeTeam,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    sellingProjectId = refProj.id;
    sellingProjectName = preset.eventName;
    createdCount += 1;
  }

  let adminProject = projects.find((p) => detectOverheadProjectKind(p) === 'admin');
  let adminProjectId = adminProject?.id || '';
  let adminProjectName = adminProject?.eventName || OVERHEAD_PROJECT_PRESETS.admin.eventName;

  if (!adminProjectId) {
    const preset = OVERHEAD_PROJECT_PRESETS.admin;
    const refProj = await addDoc(collection(db, 'projects'), {
      eventName: clampString(preset.eventName, FIELD_LIMITS.eventName),
      durationStart: today,
      durationEnd: `${today.slice(0, 4)}-12-31`,
      customerId,
      customerName,
      status: 'active',
      budgetLimit: 0,
      notes: preset.notes,
      createdBy: uid,
      teamUids: activeTeam,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    adminProjectId = refProj.id;
    adminProjectName = preset.eventName;
    createdCount += 1;
  }

  // 3. Ensure Overhead Categories
  const createdCategories: ServiceCategory[] = [...categories];
  for (const preset of OVERHEAD_CATEGORY_PRESETS) {
    const exists = categories.some((c) => c.name.trim() === preset.name.trim());
    if (!exists) {
      const refCat = await addDoc(collection(db, 'service_categories'), {
        name: clampString(preset.name, 150),
        description: clampString(preset.description, 500),
        defaultWhtRate: preset.defaultWhtRate,
        createdBy: uid,
        teamUids: activeTeam,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdCategories.push({
        id: refCat.id,
        name: preset.name,
        description: preset.description,
        defaultWhtRate: preset.defaultWhtRate,
        createdBy: uid,
        teamUids: activeTeam,
      });
      createdCount += 1;
    }
  }

  return {
    customerId,
    customerName,
    sellingProjectId,
    sellingProjectName,
    adminProjectId,
    adminProjectName,
    createdCategories,
    createdCount,
  };
}
