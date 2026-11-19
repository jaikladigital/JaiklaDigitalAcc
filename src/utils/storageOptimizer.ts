import * as XLSX from 'xlsx';
import {
  AccountingDocument,
  CompanyProfile,
  Customer,
  Expense,
  Project,
  ServiceCategory,
  Supplier,
} from '../types/accounting';
import { StorageAssetItem } from '../firebase';

export const FIRESTORE_FREE_TIER_BYTES = 1024 * 1024 * 1024; // 1 GiB Spark Free Tier
export const FIRESTORE_DOC_LIMIT_BYTES = 1024 * 1024; // 1 MiB per document hard limit
export const FIREBASE_STORAGE_FREE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB Storage Tier reference
export const COMPRESS_THRESHOLD_BYTES = 18 * 1024; // 18 KB inline image compression threshold

const utf8Encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

export function getUtf8Bytes(input: unknown): number {
  const str = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  if (!str) return 0;
  return utf8Encoder ? utf8Encoder.encode(str).length : str.length;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function getDaysOld(dateStr?: string): number {
  if (!dateStr) return 0;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return 0;
  const diff = Date.now() - parsed.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export interface ImageRecordEntry {
  key: string;
  expense: Expense;
  slot: 'receiptUrl' | 'extraPhotoUrl';
  slotLabel: string;
  url: string;
  isDataUrl: boolean;
  bytes: number;
  daysOld: number;
  canCompress: boolean;
  estimatedSavingsBytes: number;
  isSettledSafeToPurge: boolean;
}

export interface AgeBucketStat {
  bucketId: '0_30' | '31_90' | '91_180' | 'over_180';
  label: string;
  shortLabel: string;
  imageCount: number;
  imageBytes: number;
  docCount: number;
  docBytes: number;
  totalBytes: number;
}

export interface StorageBreakdownCategory {
  id: string;
  label: string;
  bytes: number;
  count: number;
  color: string;
  description: string;
}

export interface WorkspaceStorageReport {
  totalFirestoreBytes: number;
  totalCloudStorageBytes: number;
  totalCombinedBytes: number;
  firestoreDocCount: number;
  embeddedImageBytes: number;
  embeddedImageCount: number;
  cloudImageRefCount: number;
  heaviestDocBytes: number;
  heaviestDocLabel: string;
  reclaimableByCompressBytes: number;
  reclaimableByOldPhotoPurgeBytes: number;
  reclaimableOldDraftBytes: number;
  totalReclaimableBytes: number;
  categories: StorageBreakdownCategory[];
  ageBuckets: AgeBucketStat[];
  imageEntries: ImageRecordEntry[];
  staleDocs: Array<{ doc: AccountingDocument; bytes: number; daysOld: number }>;
  oldCompletedProjects: Array<{ project: Project; bytes: number; daysOld: number }>;
  orphanedStorageFiles: StorageAssetItem[];
}

export function analyzeWorkspaceStorage(params: {
  documents: AccountingDocument[];
  expenses: Expense[];
  customers: Customer[];
  suppliers: Supplier[];
  projects: Project[];
  categories: ServiceCategory[];
  company: CompanyProfile;
  storageFiles: StorageAssetItem[];
}): WorkspaceStorageReport {
  const {
    documents,
    expenses,
    customers,
    suppliers,
    projects,
    categories,
    company,
    storageFiles,
  } = params;

  let docStructBytes = 0;
  let heaviestDocBytes = 0;
  let heaviestDocLabel = '-';

  const staleDocs: Array<{ doc: AccountingDocument; bytes: number; daysOld: number }> = [];

  const bucketsMap: Record<AgeBucketStat['bucketId'], AgeBucketStat> = {
    '0_30': {
      bucketId: '0_30',
      label: '0–30 วัน (ข้อมูลใหม่)',
      shortLabel: '0–30 วัน',
      imageCount: 0,
      imageBytes: 0,
      docCount: 0,
      docBytes: 0,
      totalBytes: 0,
    },
    '31_90': {
      bucketId: '31_90',
      label: '31–90 วัน (ใช้งานปกติ)',
      shortLabel: '31–90 วัน',
      imageCount: 0,
      imageBytes: 0,
      docCount: 0,
      docBytes: 0,
      totalBytes: 0,
    },
    '91_180': {
      bucketId: '91_180',
      label: '91–180 วัน (แนะนำบีบอัด)',
      shortLabel: '91–180 วัน',
      imageCount: 0,
      imageBytes: 0,
      docCount: 0,
      docBytes: 0,
      totalBytes: 0,
    },
    over_180: {
      bucketId: 'over_180',
      label: '> 180 วัน (เก่า — ควรสำรองและล้าง)',
      shortLabel: '> 180 วัน',
      imageCount: 0,
      imageBytes: 0,
      docCount: 0,
      docBytes: 0,
      totalBytes: 0,
    },
  };

  const getBucketKey = (days: number): AgeBucketStat['bucketId'] => {
    if (days <= 30) return '0_30';
    if (days <= 90) return '31_90';
    if (days <= 180) return '91_180';
    return 'over_180';
  };

  documents.forEach((d) => {
    const b = getUtf8Bytes(d);
    docStructBytes += b;
    if (b > heaviestDocBytes) {
      heaviestDocBytes = b;
      heaviestDocLabel = `${d.docNumber} (${d.eventName})`;
    }
    const days = getDaysOld(d.docDate);
    const bk = bucketsMap[getBucketKey(days)];
    bk.docCount += 1;
    bk.docBytes += b;
    bk.totalBytes += b;

    if (d.status === 'draft' || d.status === 'cancelled') {
      staleDocs.push({ doc: d, bytes: b, daysOld: days });
    }
  });

  let receiptImageBytes = 0;
  let extraPhotoBytes = 0;
  let expenseStructBytes = 0;
  let embeddedImageCount = 0;
  let cloudImageRefCount = 0;
  const imageEntries: ImageRecordEntry[] = [];
  const referencedUrls = new Set<string>();

  if (company.logoUrl) referencedUrls.add(company.logoUrl);
  if (company.watermarkUrl) referencedUrls.add(company.watermarkUrl);
  if (company.stampUrl) referencedUrls.add(company.stampUrl);
  if (company.signatureUrl) referencedUrls.add(company.signatureUrl);

  expenses.forEach((exp) => {
    const fullBytes = getUtf8Bytes(exp);
    const rBytes = exp.receiptUrl ? getUtf8Bytes(exp.receiptUrl) : 0;
    const xBytes = exp.extraPhotoUrl ? getUtf8Bytes(exp.extraPhotoUrl) : 0;
    const pureStruct = Math.max(0, fullBytes - rBytes - xBytes);
    expenseStructBytes += pureStruct;

    if (fullBytes > heaviestDocBytes) {
      heaviestDocBytes = fullBytes;
      heaviestDocLabel = `${exp.emergencyVoucherNo || exp.eventName} (รายจ่าย)`;
    }

    const daysOld = getDaysOld(exp.paymentDate);
    const bk = bucketsMap[getBucketKey(daysOld)];
    bk.docCount += 1;
    bk.docBytes += pureStruct;
    bk.totalBytes += pureStruct;

    const isSettledSafe = exp.isEmergencyCash
      ? exp.emergencyStatus === 'reimbursed'
      : true;

    const inspectSlot = (slot: 'receiptUrl' | 'extraPhotoUrl', url: string | undefined) => {
      if (!url) return;
      referencedUrls.add(url);
      const isDataUrl = url.startsWith('data:');
      const slotBytes = getUtf8Bytes(url);
      const linkedStorageFile = !isDataUrl
        ? storageFiles.find((f) => f.downloadUrl && f.downloadUrl === url)
        : undefined;
      const effectiveBytes = isDataUrl ? slotBytes : linkedStorageFile?.sizeBytes || 0;

      if (isDataUrl) {
        embeddedImageCount += 1;
        if (slot === 'receiptUrl') receiptImageBytes += slotBytes;
        else extraPhotoBytes += slotBytes;
      } else {
        cloudImageRefCount += 1;
      }

      bk.imageCount += 1;
      bk.imageBytes += effectiveBytes;
      bk.totalBytes += effectiveBytes;

      const canCompress = isDataUrl && slotBytes > COMPRESS_THRESHOLD_BYTES;
      const estimatedSavingsBytes = canCompress
        ? Math.round(slotBytes * 0.52)
        : 0;

      imageEntries.push({
        key: `${exp.id}_${slot}`,
        expense: exp,
        slot,
        slotLabel: slot === 'receiptUrl' ? 'ใบเสร็จ / สลิป' : 'รูปหน้างานเพิ่มเติม',
        url,
        isDataUrl,
        bytes: effectiveBytes || slotBytes,
        daysOld,
        canCompress,
        estimatedSavingsBytes,
        isSettledSafeToPurge: isSettledSafe,
      });
    };

    inspectSlot('receiptUrl', exp.receiptUrl);
    inspectSlot('extraPhotoUrl', exp.extraPhotoUrl);
    if (exp.scanFileUrl) referencedUrls.add(exp.scanFileUrl);
  });

  const masterDataBytes =
    getUtf8Bytes(customers) +
    getUtf8Bytes(suppliers) +
    getUtf8Bytes(projects) +
    getUtf8Bytes(categories) +
    getUtf8Bytes(company);

  const oldCompletedProjects = projects
    .filter((p) => p.status === 'completed' || p.status === 'cancelled')
    .map((project) => ({
      project,
      bytes: getUtf8Bytes(project),
      daysOld: getDaysOld(project.durationEnd || project.durationStart),
    }))
    .sort((a, b) => b.daysOld - a.daysOld);

  const totalCloudStorageBytes = storageFiles.reduce((s, f) => s + f.sizeBytes, 0);
  const totalFirestoreBytes =
    docStructBytes + expenseStructBytes + receiptImageBytes + extraPhotoBytes + masterDataBytes;

  const orphanedStorageFiles = storageFiles.filter(
    (f) => !f.downloadUrl || !referencedUrls.has(f.downloadUrl)
  );

  const reclaimableByCompressBytes = imageEntries.reduce(
    (s, e) => s + (e.canCompress ? e.estimatedSavingsBytes : 0),
    0
  );

  const reclaimableByOldPhotoPurgeBytes = imageEntries
    .filter((e) => e.daysOld >= 90 && e.isSettledSafeToPurge)
    .reduce((s, e) => s + e.bytes, 0);

  const reclaimableOldDraftBytes = staleDocs
    .filter((s) => s.daysOld >= 30)
    .reduce((sum, s) => sum + s.bytes, 0);

  const orphanedBytes = orphanedStorageFiles.reduce((s, f) => s + f.sizeBytes, 0);

  const totalReclaimableBytes = Math.max(
    reclaimableByCompressBytes + reclaimableOldDraftBytes + orphanedBytes,
    reclaimableByOldPhotoPurgeBytes + reclaimableOldDraftBytes + orphanedBytes
  );

  const categoryBreakdown: StorageBreakdownCategory[] = [
    {
      id: 'receipts',
      label: 'รูปใบเสร็จที่ฝังในฐานข้อมูล',
      bytes: receiptImageBytes,
      count: imageEntries.filter((e) => e.slot === 'receiptUrl' && e.isDataUrl).length,
      color: '#1d4ed8',
      description: 'รูปใบเสร็จรายจ่ายและบิลเงินสดฉุกเฉินใน Firestore',
    },
    {
      id: 'extra_photos',
      label: 'รูปภาพหน้างานเพิ่มเติม',
      bytes: extraPhotoBytes,
      count: imageEntries.filter((e) => e.slot === 'extraPhotoUrl' && e.isDataUrl).length,
      color: '#e11d48',
      description: 'ภาพหน้างานหรือสินค้าที่แนบในรายการเบิกจ่ายฉุกเฉิน',
    },
    {
      id: 'cloud_storage',
      label: 'ไฟล์บน Cloud Storage Bucket',
      bytes: totalCloudStorageBytes,
      count: storageFiles.length,
      color: '#0891b2',
      description: 'รูปใบเสร็จและสินทรัพย์แบรนด์ที่เก็บใน Firebase Storage',
    },
    {
      id: 'documents',
      label: 'ข้อมูลเอกสารบัญชี (QT / INV / REC)',
      bytes: docStructBytes,
      count: documents.length,
      color: '#059669',
      description: 'รายการสินค้า โครงสร้างภาษี และหมายเหตุเอกสารทั้งหมด',
    },
    {
      id: 'master_expenses',
      label: 'ข้อมูลรายจ่าย ลูกค้า ซัพพลายเยอร์ และโครงการ',
      bytes: expenseStructBytes + masterDataBytes,
      count: expenses.length + customers.length + suppliers.length + projects.length,
      color: '#d97706',
      description: 'ข้อมูลบัญชีตัวอักษร ตัวเลข 50 ทวิ และฐานข้อมูลหลัก',
    },
  ];

  return {
    totalFirestoreBytes,
    totalCloudStorageBytes,
    totalCombinedBytes: totalFirestoreBytes + totalCloudStorageBytes,
    firestoreDocCount:
      documents.length +
      expenses.length +
      customers.length +
      suppliers.length +
      projects.length +
      categories.length +
      1,
    embeddedImageBytes: receiptImageBytes + extraPhotoBytes,
    embeddedImageCount,
    cloudImageRefCount,
    heaviestDocBytes,
    heaviestDocLabel,
    reclaimableByCompressBytes,
    reclaimableByOldPhotoPurgeBytes,
    reclaimableOldDraftBytes,
    totalReclaimableBytes,
    categories: categoryBreakdown,
    ageBuckets: [
      bucketsMap['0_30'],
      bucketsMap['31_90'],
      bucketsMap['91_180'],
      bucketsMap['over_180'],
    ],
    imageEntries: imageEntries.sort((a, b) => b.bytes - a.bytes),
    staleDocs: staleDocs.sort((a, b) => b.daysOld - a.daysOld),
    oldCompletedProjects,
    orphanedStorageFiles,
  };
}

export async function recompressImageDataUrl(
  dataUrl: string,
  maxWidth = 460,
  quality = 0.54
): Promise<{ optimizedUrl: string; beforeBytes: number; afterBytes: number; reduced: boolean }> {
  const beforeBytes = getUtf8Bytes(dataUrl);
  if (!dataUrl.startsWith('data:image/')) {
    return { optimizedUrl: dataUrl, beforeBytes, afterBytes: beforeBytes, reduced: false };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / (img.width || maxWidth));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(120, Math.round(img.width * scale));
        canvas.height = Math.max(120, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ optimizedUrl: dataUrl, beforeBytes, afterBytes: beforeBytes, reduced: false });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const candidate = canvas.toDataURL('image/webp', quality);
        const afterBytes = getUtf8Bytes(candidate);
        if (afterBytes > 0 && afterBytes < beforeBytes * 0.92) {
          resolve({ optimizedUrl: candidate, beforeBytes, afterBytes, reduced: true });
        } else {
          resolve({ optimizedUrl: dataUrl, beforeBytes, afterBytes: beforeBytes, reduced: false });
        }
      } catch {
        resolve({ optimizedUrl: dataUrl, beforeBytes, afterBytes: beforeBytes, reduced: false });
      }
    };
    img.onerror = () =>
      resolve({ optimizedUrl: dataUrl, beforeBytes, afterBytes: beforeBytes, reduced: false });
    img.src = dataUrl;
  });
}

export function downloadStorageArchiveBackup(params: {
  companyName: string;
  expenses: Expense[];
  documents: AccountingDocument[];
  label: string;
}): void {
  const { companyName, expenses, documents, label } = params;

  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPayload = {
    exportedAt: new Date().toISOString(),
    companyName,
    archiveLabel: label,
    documentsCount: documents.length,
    expensesCount: expenses.length,
    documents,
    expenses,
  };

  const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Jaikla_Archive_${label}_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Also export structured Excel summary ledger without large binary blobs
  const wb = XLSX.utils.book_new();
  if (expenses.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        expenses.map((e) => ({
          วันที่จ่าย: e.paymentDate,
          โปรเจกต์: e.eventName,
          ผู้รับเงิน: e.supplierName,
          รายละเอียด: e.description,
          ยอดก่อนภาษี: e.amount,
          VAT: e.vatAmount,
          WHT: e.whtAmount,
          จ่ายสุทธิ: e.netPaid,
          เลขที่_50_ทวิ: e.wht50TawiNo || '-',
          ใบเบิกฉุกเฉิน: e.emergencyVoucherNo || '-',
        }))
      ),
      'Archived Expenses'
    );
  }
  if (documents.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        documents.map((d) => ({
          เลขที่เอกสาร: d.docNumber,
          ประเภท: d.type,
          วันที่: d.docDate,
          สถานะ: d.status,
          ลูกค้า: d.customerSnapshot.companyName,
          โปรเจกต์: d.eventName,
          ยอดสุทธิ: d.netPayable,
        }))
      ),
      'Archived Docs'
    );
  }
  if (expenses.length > 0 || documents.length > 0) {
    XLSX.writeFile(wb, `Jaikla_Archive_Summary_${label}_${stamp}.xlsx`);
  }
}
