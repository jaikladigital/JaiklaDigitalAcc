import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Archive,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  FileWarning,
  HardDrive,
  Image as ImageIcon,
  Minimize2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  deleteStorageFile,
  handleFirestoreError,
  listStorageUsage,
  OperationType,
  StorageAssetItem,
} from '../firebase';
import {
  AccountingDocument,
  CompanyProfile,
  Customer,
  Expense,
  Project,
  ServiceCategory,
  Supplier,
  UserProfile,
} from '../types/accounting';
import { formatShortDate, formatTHB } from '../utils/formatters';
import {
  analyzeWorkspaceStorage,
  downloadStorageArchiveBackup,
  FIRESTORE_DOC_LIMIT_BYTES,
  FIRESTORE_FREE_TIER_BYTES,
  formatBytes,
  ImageRecordEntry,
  recompressImageDataUrl,
} from '../utils/storageOptimizer';
import {
  closeSwal,
  confirmAction,
  showUploadLoading,
  toastError,
  toastSuccess,
} from '../utils/swal';
import { formatThaiLineBreaks } from '../utils/thaiText';

interface StorageViewProps {
  documents: AccountingDocument[];
  expenses: Expense[];
  customers: Customer[];
  suppliers: Supplier[];
  projects: Project[];
  categories: ServiceCategory[];
  company: CompanyProfile;
  currentUserProfile: UserProfile | null;
}

type StorageSubTab = 'images' | 'records' | 'cloud';

export const StorageView: React.FC<StorageViewProps> = ({
  documents,
  expenses,
  customers,
  suppliers,
  projects,
  categories,
  company,
  currentUserProfile,
}) => {
  const isAdmin =
    currentUserProfile?.role === 'admin' ||
    auth.currentUser?.email === 'jaikladigital@gmail.com';
  const currentUid = auth.currentUser?.uid || '';

  const [subTab, setSubTab] = useState<StorageSubTab>('images');
  const [minDaysOld, setMinDaysOld] = useState<number>(0);
  const [onlySettledSafe, setOnlySettledSafe] = useState<boolean>(false);
  const [selectedImageKeys, setSelectedImageKeys] = useState<Set<string>>(new Set());
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const [storageFiles, setStorageFiles] = useState<StorageAssetItem[]>([]);
  const [storageScanLoading, setStorageScanLoading] = useState<boolean>(false);
  const [storageAvailable, setStorageAvailable] = useState<boolean>(true);
  const [storageNotice, setStorageNotice] = useState<string>('');
  const [busyAction, setBusyAction] = useState<boolean>(false);

  const runStorageScan = useCallback(async () => {
    setStorageScanLoading(true);
    try {
      const res = await listStorageUsage();
      setStorageFiles(res.files);
      setStorageAvailable(res.available);
      setStorageNotice(res.error || '');
    } finally {
      setStorageScanLoading(false);
    }
  }, []);

  useEffect(() => {
    runStorageScan();
  }, [runStorageScan]);

  const report = useMemo(
    () =>
      analyzeWorkspaceStorage({
        documents,
        expenses,
        customers,
        suppliers,
        projects,
        categories,
        company,
        storageFiles,
      }),
    [documents, expenses, customers, suppliers, projects, categories, company, storageFiles]
  );

  // Check Firestore update permission for an expense record
  const canEditExpenseRecord = useCallback(
    (exp: Expense) => {
      if (isAdmin) return true;
      const isTeam =
        exp.createdBy === currentUid || (exp.teamUids || []).includes(currentUid);
      const isReimbursedEmergency =
        exp.isEmergencyCash && exp.emergencyStatus === 'reimbursed';
      return isTeam && !isReimbursedEmergency;
    },
    [isAdmin, currentUid]
  );

  const canDeleteDocumentRecord = useCallback(
    (d: AccountingDocument) => {
      if (isAdmin) return true;
      return d.createdBy === currentUid && d.status === 'draft';
    },
    [isAdmin, currentUid]
  );

  const filteredImages = useMemo(() => {
    return report.imageEntries.filter((entry) => {
      if (entry.daysOld < minDaysOld) return false;
      if (onlySettledSafe && !entry.isSettledSafeToPurge) return false;
      return true;
    });
  }, [report.imageEntries, minDaysOld, onlySettledSafe]);

  const filteredStaleDocs = useMemo(() => {
    return report.staleDocs.filter((item) => item.daysOld >= minDaysOld);
  }, [report.staleDocs, minDaysOld]);

  // Age Chart Data in KB for crisp Recharts visualization
  const ageChartData = useMemo(
    () =>
      report.ageBuckets.map((b) => ({
        name: b.shortLabel,
        รูปภาพหลักฐาน_KB: Number((b.imageBytes / 1024).toFixed(1)),
        ข้อมูลเอกสาร_KB: Number((b.docBytes / 1024).toFixed(1)),
        imageCount: b.imageCount,
        docCount: b.docCount,
      })),
    [report.ageBuckets]
  );

  // SVG Donut Arc Calculations
  const donutSegments = useMemo(() => {
    const total = Math.max(1, report.totalCombinedBytes);
    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return report.categories
      .filter((c) => c.bytes > 0)
      .map((cat) => {
        const pct = cat.bytes / total;
        const dashLen = pct * circumference;
        const seg = {
          ...cat,
          pct: pct * 100,
          dashArray: `${dashLen} ${Math.max(0, circumference - dashLen)}`,
          dashOffset: -offset,
        };
        offset += dashLen;
        return seg;
      });
  }, [report.categories, report.totalCombinedBytes]);

  const freeTierPct = Math.min(
    100,
    (report.totalFirestoreBytes / FIRESTORE_FREE_TIER_BYTES) * 100
  );
  const reclaimPct =
    report.totalCombinedBytes > 0
      ? Math.round((report.totalReclaimableBytes / report.totalCombinedBytes) * 100)
      : 0;
  const heaviestDocPct = Math.min(
    100,
    (report.heaviestDocBytes / FIRESTORE_DOC_LIMIT_BYTES) * 100
  );

  const toggleImageKey = (key: string) => {
    setSelectedImageKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllFilteredImages = () => {
    const selectable = filteredImages
      .filter((e) => canEditExpenseRecord(e.expense))
      .map((e) => e.key);
    const allSelected =
      selectable.length > 0 && selectable.every((k) => selectedImageKeys.has(k));
    if (allSelected) {
      setSelectedImageKeys(new Set());
    } else {
      setSelectedImageKeys(new Set(selectable));
    }
  };

  const toggleDocId = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportArchive = (label: string) => {
    const selectedExpenseIds = new Set(
      filteredImages
        .filter((img) => selectedImageKeys.size === 0 || selectedImageKeys.has(img.key))
        .map((img) => img.expense.id)
    );
    const targetExpenses = expenses.filter((e) => selectedExpenseIds.has(e.id));
    const targetDocs = filteredStaleDocs.map((s) => s.doc);

    downloadStorageArchiveBackup({
      companyName: company.companyNameTh,
      expenses: targetExpenses.length > 0 ? targetExpenses : expenses,
      documents: targetDocs.length > 0 ? targetDocs : documents,
      label,
    });
    toastSuccess(
      'ส่งออกไฟล์สำรองข้อมูลสำเร็จ',
      'บันทึกไฟล์สำรอง .json และสรุป Excel (.xlsx) ลงเครื่องเรียบร้อยแล้ว'
    );
  };

  const handleCompressSingleImage = async (entry: ImageRecordEntry) => {
    if (!entry.isDataUrl) {
      toastError('รูปนี้เก็บอยู่บน Cloud Storage', 'การบีบอัดใช้กับรูปภาพที่ฝังในฐานข้อมูล Firestore');
      return;
    }
    if (!canEditExpenseRecord(entry.expense)) {
      toastError('ไม่มีสิทธิ์แก้ไขรายการนี้', 'รายการเงินสดฉุกเฉินที่ปิดยอดแล้วสงวนสิทธิ์เฉพาะ Admin');
      return;
    }

    setBusyAction(true);
    showUploadLoading('กำลังบีบอัดรูปภาพให้ประหยัดพื้นที่...');
    try {
      const res = await recompressImageDataUrl(entry.url, 460, 0.54);
      if (!res.reduced) {
        closeSwal();
        toastSuccess('รูปภาพนี้มีขนาดเล็กเหมาะสมอยู่แล้ว', `ขนาดปัจจุบัน ${formatBytes(res.beforeBytes)}`);
        return;
      }

      await updateDoc(doc(db, 'expenses', entry.expense.id), {
        [entry.slot]: res.optimizedUrl,
        updatedAt: serverTimestamp(),
      });
      closeSwal();
      toastSuccess(
        'บีบอัดรูปภาพสำเร็จ',
        `ลดขนาดจาก ${formatBytes(res.beforeBytes)} เหลือ ${formatBytes(res.afterBytes)}`
      );
    } catch (err) {
      closeSwal();
      handleFirestoreError(err, OperationType.UPDATE, `expenses/${entry.expense.id}`);
    } finally {
      setBusyAction(false);
    }
  };

  const handleBatchCompressImages = async () => {
    const candidates = filteredImages.filter(
      (e) =>
        e.canCompress &&
        canEditExpenseRecord(e.expense) &&
        (selectedImageKeys.size === 0 || selectedImageKeys.has(e.key))
    );

    if (candidates.length === 0) {
      toastError(
        'ไม่พบรูปภาพที่ต้องบีบอัดเพิ่มเติม',
        'รูปภาพในช่วงที่เลือกมีขนาดกะทัดรัดอยู่แล้ว หรืออยู่นอกสิทธิ์การแก้ไข'
      );
      return;
    }

    const ok = await confirmAction(
      `บีบอัดรูปภาพ ${candidates.length} รายการ?`,
      'ระบบจะย่อความละเอียดและแปลงเป็น WebP คุณภาพเหมาะสำหรับตรวจสอบใบเสร็จ โดยยังเก็บภาพไว้ดูย้อนหลังได้ตามปกติ',
      'เริ่มบีบอัดรูปภาพ'
    );
    if (!ok) return;

    setBusyAction(true);
    showUploadLoading(`กำลังบีบอัดรูปภาพ ${candidates.length} รายการ...`);
    let savedBytes = 0;
    let updatedCount = 0;

    try {
      // Group updates by expenseId so each doc updates once
      const grouped = new Map<string, ImageRecordEntry[]>();
      candidates.forEach((c) => {
        const list = grouped.get(c.expense.id) || [];
        list.push(c);
        grouped.set(c.expense.id, list);
      });

      for (const [expId, entries] of grouped.entries()) {
        const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
        let changed = false;
        for (const item of entries) {
          const res = await recompressImageDataUrl(item.url, 460, 0.54);
          if (res.reduced) {
            patch[item.slot] = res.optimizedUrl;
            savedBytes += res.beforeBytes - res.afterBytes;
            updatedCount += 1;
            changed = true;
          }
        }
        if (changed) {
          await updateDoc(doc(db, 'expenses', expId), patch);
        }
      }

      closeSwal();
      setSelectedImageKeys(new Set());
      toastSuccess(
        `บีบอัดเสร็จสิ้น ${updatedCount} รูปภาพ`,
        `ประหยัดพื้นที่ฐานข้อมูลคืนได้ ${formatBytes(savedBytes)}`
      );
    } catch (err) {
      closeSwal();
      toastError(
        'เกิดข้อผิดพลาดระหว่างบีบอัดรูปภาพ',
        err instanceof Error ? err.message : 'กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handlePurgeSingleImage = async (entry: ImageRecordEntry) => {
    if (!canEditExpenseRecord(entry.expense)) {
      toastError('ไม่มีสิทธิ์ลบรูปในรายการนี้', 'รายการที่คืนเงินเสร็จสิ้นแล้วสงวนสิทธิ์เฉพาะ Admin');
      return;
    }

    const ok = await confirmAction(
      'ลบรูปภาพหลักฐานนี้ออกจากคลังข้อมูล?',
      `รายการ: ${entry.expense.description} (${formatBytes(entry.bytes)}) — ข้อมูลตัวเลขบัญชี, ภาษี และ 50 ทวิ จะยังคงอยู่ครบถ้วน`,
      'ยืนยันลบรูปภาพ'
    );
    if (!ok) return;

    setBusyAction(true);
    showUploadLoading('กำลังลบรูปภาพและคืนพื้นที่คลังเก็บข้อมูล...');
    try {
      if (!entry.isDataUrl) {
        await deleteStorageFile(entry.url);
      }
      await updateDoc(doc(db, 'expenses', entry.expense.id), {
        [entry.slot]: '',
        updatedAt: serverTimestamp(),
      });
      closeSwal();
      if (!entry.isDataUrl) {
        runStorageScan();
      }
      toastSuccess('ลบรูปภาพและคืนพื้นที่เรียบร้อย', `คืนพื้นที่ได้ ${formatBytes(entry.bytes)}`);
    } catch (err) {
      closeSwal();
      handleFirestoreError(err, OperationType.UPDATE, `expenses/${entry.expense.id}`);
    } finally {
      setBusyAction(false);
    }
  };

  const handleBatchPurgeImages = async () => {
    const targets = filteredImages.filter(
      (e) =>
        canEditExpenseRecord(e.expense) &&
        (selectedImageKeys.size > 0
          ? selectedImageKeys.has(e.key)
          : e.daysOld >= Math.max(90, minDaysOld) && e.isSettledSafeToPurge)
    );

    if (targets.length === 0) {
      toastError(
        'กรุณาเลือกรูปภาพเก่าที่ต้องการล้าง',
        'ติ๊กเลือกรายการในตาราง หรือเลือกตัวกรอง "เก่ากว่า 90 วัน" ก่อนดำเนินการ'
      );
      return;
    }

    const totalFree = targets.reduce((s, t) => s + t.bytes, 0);
    const ok = await confirmAction(
      `ลบรูปภาพเก่า ${targets.length} รูป (${formatBytes(totalFree)})?`,
      'แนะนำให้กด "สำรองข้อมูล" เก็บไว้ก่อน — ข้อมูลรายจ่าย, VAT, WHT และเลขที่ 50 ทวิ จะไม่ถูกลบ',
      'ลบรูปภาพเพื่อคืนพื้นที่'
    );
    if (!ok) return;

    setBusyAction(true);
    showUploadLoading(`กำลังล้างรูปภาพเก่า ${targets.length} รูป...`);
    let removedCount = 0;

    try {
      const grouped = new Map<string, ImageRecordEntry[]>();
      targets.forEach((t) => {
        const arr = grouped.get(t.expense.id) || [];
        arr.push(t);
        grouped.set(t.expense.id, arr);
      });

      for (const [expId, entries] of grouped.entries()) {
        const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
        for (const item of entries) {
          if (!item.isDataUrl) {
            await deleteStorageFile(item.url);
          }
          patch[item.slot] = '';
          removedCount += 1;
        }
        await updateDoc(doc(db, 'expenses', expId), patch);
      }

      closeSwal();
      setSelectedImageKeys(new Set());
      runStorageScan();
      toastSuccess(
        `ล้างรูปภาพเก่าสำเร็จ ${removedCount} รูป`,
        `คืนพื้นที่คลังเก็บข้อมูลได้ ${formatBytes(totalFree)}`
      );
    } catch (err) {
      closeSwal();
      toastError(
        'ไม่สามารถลบรูปภาพบางรายการได้',
        err instanceof Error ? err.message : 'กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleBatchDeleteStaleDocs = async () => {
    const targets = filteredStaleDocs.filter(
      (item) =>
        canDeleteDocumentRecord(item.doc) &&
        (selectedDocIds.size > 0 ? selectedDocIds.has(item.doc.id) : item.daysOld >= 30)
    );

    if (targets.length === 0) {
      toastError(
        'ไม่มีเอกสารร่างหรือเอกสารยกเลิกที่ตรงเงื่อนไข',
        'สามารถติ๊กเลือกเอกสารที่ไม่ต้องการใช้ในตารางได้'
      );
      return;
    }

    const totalBytes = targets.reduce((s, t) => s + t.bytes, 0);
    const ok = await confirmAction(
      `ลบเอกสารร่าง/ยกเลิกเก่า ${targets.length} ฉบับ?`,
      `จะลบเฉพาะเอกสารที่เลือก (${formatBytes(totalBytes)}) ออกจากฐานข้อมูลอย่างถาวร แนะนำให้ส่งออกไฟล์สำรองก่อน`,
      'ยืนยันลบเอกสารเก่า'
    );
    if (!ok) return;

    setBusyAction(true);
    showUploadLoading(`กำลังลบเอกสารเก่า ${targets.length} ฉบับ...`);
    try {
      for (const item of targets) {
        await deleteDoc(doc(db, 'documents', item.doc.id));
      }
      closeSwal();
      setSelectedDocIds(new Set());
      toastSuccess(`ลบเอกสารเก่าแล้ว ${targets.length} ฉบับ`, `คืนพื้นที่ ${formatBytes(totalBytes)}`);
    } catch (err) {
      closeSwal();
      toastError(
        'ลบเอกสารไม่สำเร็จ',
        err instanceof Error ? err.message : 'ตรวจสอบสิทธิ์การลบเอกสาร'
      );
    } finally {
      setBusyAction(false);
    }
  };

  const handleDeleteOrphanedCloudFile = async (file: StorageAssetItem) => {
    if (!isAdmin) {
      toastError('สงวนสิทธิ์เฉพาะ Admin', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบไฟล์บน Cloud Storage ได้');
      return;
    }
    const ok = await confirmAction(
      'ลบไฟล์บน Cloud Storage?',
      `ไฟล์ ${file.name} (${formatBytes(file.sizeBytes)}) จะถูกลบออกจาก Storage Bucket ถาวร`,
      'ลบไฟล์ออกจาก Cloud'
    );
    if (!ok) return;

    setBusyAction(true);
    try {
      const deleted = await deleteStorageFile(file.fullPath);
      if (deleted) {
        toastSuccess('ลบไฟล์บน Cloud Storage แล้ว', `ประหยัดพื้นที่ ${formatBytes(file.sizeBytes)}`);
        await runStorageScan();
      } else {
        toastError('ไม่สามารถลบไฟล์จาก Cloud Storage ได้', 'กรุณาตรวจสอบสิทธิ์ Storage Bucket');
      }
    } finally {
      setBusyAction(false);
    }
  };

  const handleCleanupAllOrphanedCloudFiles = async () => {
    if (!isAdmin) {
      toastError('สงวนสิทธิ์เฉพาะ Admin');
      return;
    }
    if (report.orphanedStorageFiles.length === 0) {
      toastSuccess('ไม่พบไฟล์ค้างที่ไม่ได้ใช้งานบน Cloud Storage');
      return;
    }
    const totalBytes = report.orphanedStorageFiles.reduce((s, f) => s + f.sizeBytes, 0);
    const ok = await confirmAction(
      `ล้างไฟล์กำพร้าบน Cloud Storage ${report.orphanedStorageFiles.length} ไฟล์?`,
      `ไฟล์เหล่านี้ไม่ได้ถูกอ้างอิงในรายจ่ายหรือสินทรัพย์บริษัทแล้ว (${formatBytes(totalBytes)})`,
      'ล้างไฟล์ที่ไม่ใช้งาน'
    );
    if (!ok) return;

    setBusyAction(true);
    showUploadLoading('กำลังล้างไฟล์ที่ไม่ใช้งานบน Cloud Storage...');
    let deletedCount = 0;
    for (const file of report.orphanedStorageFiles) {
      const okDel = await deleteStorageFile(file.fullPath);
      if (okDel) deletedCount += 1;
    }
    closeSwal();
    await runStorageScan();
    setBusyAction(false);
    toastSuccess(`ลบไฟล์ที่ไม่ใช้งานแล้ว ${deletedCount} ไฟล์`, `คืนพื้นที่ ${formatBytes(totalBytes)}`);
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-figma-in">
      {/* Centered Header */}
      <div className="flex flex-col items-center text-center gap-2.5 sm:gap-3 pb-1">
        <div className="min-w-0 max-w-2xl px-1">
          <h1 className="thai-heading thai-title-center font-bold text-slate-900 m-0">
            {formatThaiLineBreaks('บริหารจัดการคลังข้อมูลและรูปภาพเก่า')}
          </h1>
          <p className="thai-prose text-xs sm:text-sm text-slate-500 mt-1.5 mb-0">
            {formatThaiLineBreaks(
              'วิเคราะห์ปริมาณพื้นที่จัดเก็บจริง บีบอัดรูปใบเสร็จเก่า และสำรองล้างข้อมูลที่ไม่จำเป็นเพื่อประหยัดพื้นที่'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            disabled={storageScanLoading}
            onClick={runStorageScan}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 !rounded-xl hover:bg-slate-50 whitespace-nowrap min-h-[42px]"
          >
            <RefreshCw className={`w-4 h-4 ${storageScanLoading ? 'animate-spin' : ''}`} />
            สแกนพื้นที่ล่าสุด
          </button>

          <button
            type="button"
            onClick={() => handleExportArchive('Full_Workspace')}
            className="figma-btn inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 !rounded-xl hover:bg-slate-800 whitespace-nowrap min-h-[42px]"
          >
            <Download className="w-4 h-4" />
            สำรองคลังข้อมูล (.json / .xlsx)
          </button>
        </div>
      </div>

      {/* 4-Card Storage KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>พื้นที่คลังข้อมูลใช้งานจริงรวม</span>
            <HardDrive className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-2">
            {formatBytes(report.totalCombinedBytes)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-num">
            {report.firestoreDocCount} เอกสาร · {storageFiles.length} ไฟล์ Cloud
          </div>
        </div>

        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>พื้นที่รูปภาพใบเสร็จและภาพหน้างาน</span>
            <ImageIcon className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-rose-700 mt-2">
            {formatBytes(report.embeddedImageBytes + report.totalCloudStorageBytes)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono-num">
            {report.imageEntries.length} รูปภาพ (
            {report.totalCombinedBytes > 0
              ? Math.round(
                  ((report.embeddedImageBytes + report.totalCloudStorageBytes) /
                    report.totalCombinedBytes) *
                    100
                )
              : 0}
            % ของคลัง)
          </div>
        </div>

        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>พื้นที่ที่ประหยัดคืนได้ทันที</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-emerald-700 mt-2">
            {formatBytes(report.totalReclaimableBytes)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            ลดขนาดคลังได้สูงสุด <strong className="font-mono-num">{reclaimPct}%</strong> โดยคงตัวเลขบัญชี
          </div>
        </div>

        <div className="figma-card p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>ขนาดเอกสารสูงสุด (เกณฑ์ 1 MB/Doc)</span>
            <Database className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono-num text-slate-900 mt-2">
            {formatBytes(report.heaviestDocBytes)}
          </div>
          <div className="text-xs text-slate-500 mt-1 truncate">
            ใช้ไป <strong className="font-mono-num">{heaviestDocPct.toFixed(1)}%</strong> · {report.heaviestDocLabel}
          </div>
        </div>
      </div>

      {/* Infographic Overview: Donut Gauge + Stacked Storage Bar + Cost Protection */}
      <div className="figma-card p-5 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 m-0">
              อินโฟกราฟิกสัดส่วนพื้นที่คลังเก็บข้อมูลบริษัท
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-0">
              คำนวณขนาดไบต์จริงจากฐานข้อมูล Cloud Firestore และ Firebase Storage Bucket แบบเรียลไทม์
            </p>
          </div>
          <div className="text-xs font-mono-num text-slate-600">
            เพดาน Free Tier: 1.00 GB (ใช้ไปแล้ว {freeTierPct < 0.01 ? '< 0.01' : freeTierPct.toFixed(2)}%)
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center pt-5">
          {/* SVG Infographic Donut Ring */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center">
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                <circle
                  cx="70"
                  cy="70"
                  r="56"
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="16"
                />
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.id}
                    cx="70"
                    cy="70"
                    r="56"
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="16"
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                    strokeLinecap="butt"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <span className="text-[11px] font-semibold text-slate-500">พื้นที่ใช้งานรวม</span>
                <span className="text-xl font-bold font-mono-num text-slate-900 mt-0.5">
                  {formatBytes(report.totalCombinedBytes)}
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 mt-0.5 font-mono-num">
                  ลดได้ {reclaimPct}%
                </span>
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-slate-600 max-w-xs">
              การบีบอัดรูปเก่าและลบไฟล์ที่ไม่ใช้งานช่วยลดปริมาณการถ่ายโอนข้อมูลและป้องกันค่าใช้จ่ายส่วนเกิน
            </div>
          </div>

          {/* Stacked Bar & Category Breakdown */}
          <div className="lg:col-span-8 space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>สัดส่วนการใช้พื้นที่แยกตามประเภทข้อมูลและรูปภาพ</span>
                <span className="font-mono-num">{formatBytes(report.totalCombinedBytes)}</span>
              </div>
              <div className="h-5 w-full rounded-lg overflow-hidden bg-slate-100 flex border border-slate-200">
                {report.totalCombinedBytes === 0 ? (
                  <div className="w-full h-full bg-slate-200" />
                ) : (
                  report.categories
                    .filter((c) => c.bytes > 0)
                    .map((cat) => {
                      const widthPct = Math.max(
                        1.5,
                        (cat.bytes / report.totalCombinedBytes) * 100
                      );
                      return (
                        <div
                          key={cat.id}
                          style={{ width: `${widthPct}%`, backgroundColor: cat.color }}
                          title={`${cat.label}: ${formatBytes(cat.bytes)}`}
                          className="h-full transition-all"
                        />
                      );
                    })
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {report.categories.map((cat) => {
                const pct =
                  report.totalCombinedBytes > 0
                    ? Math.round((cat.bytes / report.totalCombinedBytes) * 100)
                    : 0;
                return (
                  <div
                    key={cat.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 mt-1"
                        style={{ backgroundColor: cat.color }}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {cat.label}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-[1.45]">
                          {cat.description}
                        </div>
                      </div>
                    </div>
                    <div className="text-end shrink-0 font-mono-num">
                      <div className="text-xs font-bold text-slate-900">{formatBytes(cat.bytes)}</div>
                      <div className="text-[11px] text-slate-500">
                        {pct}% · {cat.count} รายการ
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Quick Optimization Potential Card */}
              <div className="p-3 rounded-lg border border-emerald-200 bg-emerald-50/60 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Archive className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-emerald-900">
                      แผนประหยัดพื้นที่แนะนำ
                    </div>
                    <div className="text-[11px] text-emerald-800 mt-0.5 leading-[1.45]">
                      บีบอัดรูป {formatBytes(report.reclaimableByCompressBytes)} · ล้างรูปเก่า &gt; 90 วัน{' '}
                      {formatBytes(report.reclaimableByOldPhotoPurgeBytes)}
                    </div>
                  </div>
                </div>
                <div className="text-end shrink-0 font-mono-num">
                  <div className="text-xs font-bold text-emerald-800">
                    {formatBytes(report.totalReclaimableBytes)}
                  </div>
                  <div className="text-[11px] text-emerald-700">ประหยัดได้</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Infographic Row 2: Age Distribution Chart + Top Heavy Consumers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 figma-card p-5">
          <div className="mb-4">
            <h2 className="text-base font-bold text-slate-900 m-0">
              กราฟอายุของข้อมูลและรูปภาพ (KB ตามช่วงเวลา)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-0">
              แยกขนาดพื้นที่ระหว่างรูปภาพหลักฐานกับข้อมูลเอกสารตามช่วงอายุ เพื่อช่วยตัดสินใจจัดเก็บและล้างข้อมูลเก่า
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageChartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip
                  formatter={(val, name) => [
                    `${val} KB`,
                    name === 'รูปภาพหลักฐาน_KB' ? 'รูปภาพหลักฐาน' : 'ข้อมูลเอกสารและตัวอักษร',
                  ]}
                  contentStyle={{
                    borderRadius: '10px',
                    borderColor: '#e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  formatter={(value) =>
                    value === 'รูปภาพหลักฐาน_KB' ? 'รูปภาพหลักฐาน (KB)' : 'ข้อมูลเอกสาร (KB)'
                  }
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <Bar
                  dataKey="รูปภาพหลักฐาน_KB"
                  fill="#e11d48"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="ข้อมูลเอกสาร_KB"
                  fill="#1d4ed8"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 figma-card p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 m-0">
              รายการที่ใช้พื้นที่มากที่สุด (Top Heavy Consumers)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-4">
              เรียงจากไฟล์รูปภาพขนาดใหญ่ที่สุดเพื่อให้บีบอัดหรือตรวจสอบได้ตรงจุด
            </p>

            {report.imageEntries.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-500" />
                ยังไม่มีรูปภาพขนาดใหญ่ในคลังข้อมูล
              </div>
            ) : (
              <div className="space-y-2.5">
                {report.imageEntries.slice(0, 5).map((entry) => {
                  const maxBytes = Math.max(1, report.imageEntries[0].bytes);
                  const barPct = Math.max(8, Math.round((entry.bytes / maxBytes) * 100));
                  return (
                    <div
                      key={entry.key}
                      className="p-2.5 border border-slate-200 rounded-lg bg-slate-50/40"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 font-semibold text-slate-900 truncate">
                          {entry.expense.eventName} · {entry.slotLabel}
                        </div>
                        <div className="font-mono-num font-bold text-rose-700 shrink-0">
                          {formatBytes(entry.bytes)}
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden my-1.5">
                        <div
                          className="h-full bg-rose-600 rounded-full"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate">
                          {entry.expense.supplierName} · อายุ {entry.daysOld} วัน
                        </span>
                        <div className="inline-flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewPhotoUrl(entry.url)}
                            className="text-blue-700 font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer"
                          >
                            ดูรูป
                          </button>
                          {entry.canCompress && canEditExpenseRecord(entry.expense) && (
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleCompressSingleImage(entry)}
                              className="text-emerald-700 font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer"
                            >
                              บีบอัด
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs & Retention Filter */}
      <div className="figma-card p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:inline-flex gap-1.5 p-1.5 sm:p-1 bg-slate-200/70 rounded-xl w-full lg:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('images')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors text-left sm:text-center min-h-[38px] ${
              subTab === 'images' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            รูปภาพใบเสร็จ ({report.imageEntries.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('records')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors text-left sm:text-center min-h-[38px] ${
              subTab === 'records' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            เอกสารร่าง/ยกเลิก ({report.staleDocs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('cloud')}
            className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors inline-flex items-center sm:justify-center gap-1.5 min-h-[38px] ${
              subTab === 'cloud' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span>ไฟล์บน Cloud ({storageFiles.length})</span>
          </button>
        </div>

        {subTab !== 'cloud' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full lg:w-auto">
            <select
              className="form-select form-select-sm w-full sm:w-auto sm:min-w-[180px] !rounded-lg min-h-[38px]"
              value={minDaysOld}
              onChange={(e) => setMinDaysOld(Number(e.target.value))}
              aria-label="กรองตามอายุข้อมูล"
            >
              <option value={0}>ทุกช่วงอายุข้อมูล</option>
              <option value={30}>เก่ากว่า 30 วัน</option>
              <option value={90}>เก่ากว่า 90 วัน (แนะนำล้าง)</option>
              <option value={180}>เก่ากว่า 180 วัน (6 เดือน)</option>
              <option value={365}>เก่ากว่า 365 วัน (1 ปี)</option>
            </select>

            {subTab === 'images' && (
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="form-check-input m-0"
                  checked={onlySettledSafe}
                  onChange={(e) => setOnlySettledSafe(e.target.checked)}
                />
                เฉพาะรายการที่คืนเงินเสร็จแล้ว
              </label>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: Old Images Optimizer & Purge */}
      {subTab === 'images' && (
        <div className="figma-card overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/70">
            <div className="text-xs text-slate-600">
              แสดง <strong>{filteredImages.length}</strong> รูปภาพ · เลือกอยู่{' '}
              <strong className="font-mono-num">{selectedImageKeys.size}</strong> รายการ
            </div>
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                disabled={busyAction || filteredImages.length === 0}
                onClick={() => handleExportArchive(`Images_${minDaysOld}d`)}
                className="btn btn-sm btn-outline-secondary inline-flex items-center justify-center gap-1.5 min-h-[36px]"
              >
                <Download className="w-3.5 h-3.5" />
                สำรองก่อนล้าง
              </button>
              <button
                type="button"
                disabled={busyAction || filteredImages.length === 0}
                onClick={handleBatchCompressImages}
                className="btn btn-sm btn-outline-success inline-flex items-center justify-center gap-1.5 fw-semibold min-h-[36px]"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                บีบอัดรูปเก่าให้เล็กลง
              </button>
              <button
                type="button"
                disabled={busyAction || filteredImages.length === 0}
                onClick={handleBatchPurgeImages}
                className="btn btn-sm btn-danger inline-flex items-center justify-center gap-1.5 fw-semibold min-h-[36px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบรูปภาพเก่าออก
              </button>
            </div>
          </div>

          {/* Mobile Cards (< md) */}
          <div className="md:hidden divide-y divide-slate-100">
            {filteredImages.length === 0 ? (
              <div className="text-center py-10 px-4 text-xs text-slate-500">
                ไม่พบรูปภาพในเงื่อนไขช่วงอายุที่เลือก
              </div>
            ) : (
              filteredImages.map((entry) => {
                const editable = canEditExpenseRecord(entry.expense);
                return (
                  <div key={entry.key} className="p-3.5 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="form-check-input mt-1 shrink-0"
                        disabled={!editable}
                        checked={selectedImageKeys.has(entry.key)}
                        onChange={() => toggleImageKey(entry.key)}
                      />
                      <button
                        type="button"
                        onClick={() => setPreviewPhotoUrl(entry.url)}
                        className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0 p-0 cursor-pointer"
                      >
                        <img
                          src={entry.url}
                          alt={entry.slotLabel}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 leading-[1.4]">
                          {entry.expense.eventName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {entry.expense.supplierName} · {entry.slotLabel}
                        </div>
                      </div>
                      <div className="text-end shrink-0 font-mono-num">
                        <div className="text-xs font-bold text-slate-900">{formatBytes(entry.bytes)}</div>
                        <div className={`text-[11px] font-semibold ${entry.daysOld >= 180 ? 'text-rose-700' : entry.daysOld >= 90 ? 'text-amber-700' : 'text-slate-500'}`}>
                          {entry.daysOld} วัน
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 font-mono-num">
                        {formatShortDate(entry.expense.paymentDate)}
                        {entry.canCompress ? ` · ลดได้ ~${formatBytes(entry.estimatedSavingsBytes)}` : ''}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {entry.canCompress && editable && (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handleCompressSingleImage(entry)}
                            className="btn btn-sm btn-outline-success text-xs"
                          >
                            บีบอัด
                          </button>
                        )}
                        {editable ? (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => handlePurgeSingleImage(entry)}
                            className="btn btn-sm btn-light border text-danger"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Admin</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Tablet & Desktop Table (>= md) */}
          <div className="hidden md:block table-responsive">
            <table className="table table-hover align-middle mb-0 text-sm">
              <thead className="table-light">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      className="form-check-input m-0"
                      onChange={toggleAllFilteredImages}
                      checked={
                        filteredImages.filter((e) => canEditExpenseRecord(e.expense)).length > 0 &&
                        filteredImages
                          .filter((e) => canEditExpenseRecord(e.expense))
                          .every((e) => selectedImageKeys.has(e.key))
                      }
                      aria-label="เลือกทั้งหมด"
                    />
                  </th>
                  <th className="px-3 py-3">ตัวอย่างรูป</th>
                  <th className="px-4 py-3">โปรเจกต์ และผู้รับเงิน</th>
                  <th className="px-4 py-3">ประเภท / แหล่งเก็บ</th>
                  <th className="px-4 py-3 text-center">วันที่ / อายุ</th>
                  <th className="px-4 py-3 text-end">ขนาดพื้นที่</th>
                  <th className="px-4 py-3 text-end">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredImages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-500">
                      ไม่พบรูปภาพในเงื่อนไขช่วงอายุที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredImages.map((entry) => {
                    const editable = canEditExpenseRecord(entry.expense);
                    return (
                      <tr key={entry.key}>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            className="form-check-input m-0"
                            disabled={!editable}
                            checked={selectedImageKeys.has(entry.key)}
                            onChange={() => toggleImageKey(entry.key)}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setPreviewPhotoUrl(entry.url)}
                            className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center p-0 cursor-pointer"
                            title="คลิกดูรูปขนาดใหญ่"
                          >
                            <img
                              src={entry.url}
                              alt={entry.slotLabel}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3 wrap-cell">
                          <div className="font-semibold text-slate-900 thai-prose">
                            {formatThaiLineBreaks(entry.expense.eventName)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {entry.expense.supplierName} · ฿{formatTHB(entry.expense.netPaid)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="font-semibold text-slate-800">{entry.slotLabel}</div>
                          <div className="text-slate-500">
                            {entry.isDataUrl ? 'ฝังใน Firestore (WebP/Data)' : 'Firebase Cloud Storage'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-mono-num text-xs">
                          <div className="text-slate-800">
                            {formatShortDate(entry.expense.paymentDate)}
                          </div>
                          <div
                            className={`font-semibold ${
                              entry.daysOld >= 180
                                ? 'text-rose-700'
                                : entry.daysOld >= 90
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                            }`}
                          >
                            อายุ {entry.daysOld} วัน
                          </div>
                        </td>
                        <td className="px-4 py-3 text-end font-mono-num">
                          <div className="font-bold text-slate-900">
                            {formatBytes(entry.bytes)}
                          </div>
                          {entry.canCompress && (
                            <div className="text-[11px] text-emerald-700">
                              ลดได้ ~{formatBytes(entry.estimatedSavingsBytes)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            {entry.canCompress && editable && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => handleCompressSingleImage(entry)}
                                className="btn btn-sm btn-outline-success whitespace-nowrap"
                                title="บีบอัดรูปให้ขนาดเล็กลง"
                              >
                                <Minimize2 className="w-3.5 h-3.5 inline me-1" />
                                บีบอัด
                              </button>
                            )}
                            {editable ? (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => handlePurgeSingleImage(entry)}
                                className="btn btn-sm btn-light border text-danger"
                                title="ลบรูปภาพเพื่อคืนพื้นที่"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">สงวนสิทธิ์ Admin</span>
                            )}
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

      {/* TAB 2: Old Drafts / Cancelled Docs / Completed Projects */}
      {subTab === 'records' && (
        <div className="space-y-5">
          <div className="figma-card overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900 m-0">
                  เอกสารร่าง (Draft) และเอกสารยกเลิก (Cancelled)
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  เอกสารที่ไม่ได้ใช้งานจริงสามารถส่งออกสำรองและลบออกเพื่อลดภาระฐานข้อมูลได้
                </div>
              </div>
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={filteredStaleDocs.length === 0}
                  onClick={() => handleExportArchive('Stale_Documents')}
                  className="btn btn-sm btn-outline-secondary inline-flex items-center justify-center gap-1.5 min-h-[36px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  สำรองเอกสาร
                </button>
                <button
                  type="button"
                  disabled={busyAction || filteredStaleDocs.length === 0}
                  onClick={handleBatchDeleteStaleDocs}
                  className="btn btn-sm btn-danger inline-flex items-center justify-center gap-1.5 fw-semibold min-h-[36px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ลบเอกสารที่เลือก
                </button>
              </div>
            </div>

            {/* Mobile Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredStaleDocs.length === 0 ? (
                <div className="text-center py-10 px-4 text-xs text-slate-500">
                  <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-500" />
                  ไม่พบเอกสารร่างหรือเอกสารยกเลิกค้างในเงื่อนไขที่เลือก
                </div>
              ) : (
                filteredStaleDocs.map((item) => {
                  const canDel = canDeleteDocumentRecord(item.doc);
                  return (
                    <div key={item.doc.id} className="p-3.5 flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="form-check-input mt-1 shrink-0"
                        disabled={!canDel}
                        checked={selectedDocIds.has(item.doc.id)}
                        onChange={() => toggleDocId(item.doc.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-num text-xs font-bold text-slate-900">
                            {item.doc.docNumber} ({item.doc.type})
                          </span>
                          <span className="font-mono-num text-xs font-semibold text-slate-900">
                            {formatBytes(item.bytes)}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                          {item.doc.customerSnapshot.companyName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{item.doc.eventName}</div>
                        <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
                          <span>{item.doc.status === 'draft' ? 'ร่าง (Draft)' : 'ยกเลิก (Cancelled)'}</span>
                          <span className="font-mono-num">{item.daysOld} วัน</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Tablet & Desktop Table (>= md) */}
            <div className="hidden md:block table-responsive">
              <table className="table table-hover align-middle mb-0 text-sm">
                <thead className="table-light">
                  <tr>
                    <th className="px-3 py-3 w-10 text-center">เลือก</th>
                    <th className="px-4 py-3">เลขที่ / ประเภท</th>
                    <th className="px-4 py-3">ลูกค้าและโครงการ</th>
                    <th className="px-4 py-3 text-center">สถานะ</th>
                    <th className="px-4 py-3 text-center">อายุ</th>
                    <th className="px-4 py-3 text-end">ขนาดข้อมูล</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaleDocs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-slate-500">
                        <CheckCircle2 className="w-7 h-7 mx-auto mb-2 text-emerald-500" />
                        ไม่พบเอกสารร่างหรือเอกสารยกเลิกค้างในเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredStaleDocs.map((item) => {
                      const canDel = canDeleteDocumentRecord(item.doc);
                      return (
                        <tr key={item.doc.id}>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              className="form-check-input m-0"
                              disabled={!canDel}
                              checked={selectedDocIds.has(item.doc.id)}
                              onChange={() => toggleDocId(item.doc.id)}
                            />
                          </td>
                          <td className="px-4 py-3 font-mono-num">
                            <div className="font-bold text-slate-900">{item.doc.docNumber}</div>
                            <div className="text-xs text-slate-500">{item.doc.type}</div>
                          </td>
                          <td className="px-4 py-3 wrap-cell">
                            <div className="font-semibold text-slate-800">
                              {item.doc.customerSnapshot.companyName}
                            </div>
                            <div className="text-xs text-slate-500">{item.doc.eventName}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-semibold">
                            {item.doc.status === 'draft' ? 'ร่าง (Draft)' : 'ยกเลิก (Cancelled)'}
                          </td>
                          <td className="px-4 py-3 text-center font-mono-num text-xs">
                            {item.daysOld} วัน
                          </td>
                          <td className="px-4 py-3 text-end font-mono-num font-semibold">
                            {formatBytes(item.bytes)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {report.oldCompletedProjects.length > 0 && (
            <div className="figma-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileWarning className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900 m-0">
                  โครงการที่ปิดงานหรือยกเลิกแล้ว ({report.oldCompletedProjects.length} โครงการ)
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {report.oldCompletedProjects.slice(0, 9).map((item) => (
                  <div
                    key={item.project.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex justify-between items-center gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {item.project.eventName}
                      </div>
                      <div className="text-slate-500 truncate">{item.project.customerName || '-'}</div>
                    </div>
                    <div className="text-end shrink-0 font-mono-num">
                      <div className="font-semibold text-slate-800">{item.daysOld} วัน</div>
                      <div className="text-slate-500">{formatBytes(item.bytes)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Firebase Cloud Storage Bucket Files */}
      {subTab === 'cloud' && (
        <div className="figma-card overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/70">
            <div>
              <h3 className="text-sm font-bold text-slate-900 m-0">
                ไฟล์บน Firebase Cloud Storage Bucket
              </h3>
              <div className="text-xs text-slate-500 mt-0.5">
                ตรวจพบไฟล์กำพร้า (ไม่ได้ใช้งานในระบบแล้ว) จำนวน{' '}
                <strong className="font-mono-num text-rose-700">
                  {report.orphanedStorageFiles.length}
                </strong>{' '}
                ไฟล์
              </div>
            </div>
            {isAdmin && report.orphanedStorageFiles.length > 0 && (
              <button
                type="button"
                disabled={busyAction}
                onClick={handleCleanupAllOrphanedCloudFiles}
                className="btn btn-sm btn-danger w-full sm:w-auto inline-flex items-center justify-center gap-1.5 fw-semibold min-h-[36px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                ล้างไฟล์ที่ไม่ใช้งานทั้งหมด ({report.orphanedStorageFiles.length})
              </button>
            )}
          </div>

          {!storageAvailable ? (
            <div className="p-8 text-center text-sm text-slate-600 space-y-2">
              <ShieldAlert className="w-8 h-8 mx-auto text-amber-600" />
              <div className="font-bold text-slate-900">
                ระบบใช้การเก็บรูปแบบประหยัดพื้นที่ในฐานข้อมูล Firestore เป็นหลัก
              </div>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                ไม่สามารถดึงรายการไฟล์จาก Storage Bucket โดยตรงได้ในขณะนี้ (รูปภาพใหม่จึงถูกบีบอัดเป็น WebP
                ขนาดกะทัดรัดโดยอัตโนมัติในแท็บ &ldquo;รูปภาพใบเสร็จและหน้างาน&rdquo;)
                {storageNotice ? ` — ${storageNotice}` : ''}
              </p>
            </div>
          ) : storageFiles.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              <Cloud className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              ไม่พบไฟล์ค้างอยู่ใน Cloud Storage Bucket (0 B)
            </div>
          ) : (
            <>
              {/* Mobile Cards (< md) */}
              <div className="md:hidden divide-y divide-slate-100">
                {storageFiles.map((file) => {
                  const isOrphaned = report.orphanedStorageFiles.some(
                    (o) => o.fullPath === file.fullPath
                  );
                  return (
                    <div key={file.fullPath} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-mono-num text-xs font-semibold text-slate-900 truncate">
                            {file.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-num truncate">
                            {file.fullPath}
                          </div>
                        </div>
                        <span className="font-mono-num text-xs font-bold text-slate-900 shrink-0">
                          {formatBytes(file.sizeBytes)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 text-xs">
                        <div>
                          {isOrphaned ? (
                            <span className="text-rose-700 font-semibold">ไฟล์กำพร้า (ไม่ได้ใช้งานแล้ว)</span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">กำลังใช้งานในระบบ</span>
                          )}
                          <span className="text-[11px] text-slate-400 ms-2 font-mono-num">
                            {file.timeCreated ? formatShortDate(file.timeCreated.slice(0, 10)) : '-'}
                          </span>
                        </div>
                        <div className="inline-flex items-center gap-1.5">
                          {file.downloadUrl && (
                            <button
                              type="button"
                              onClick={() => setPreviewPhotoUrl(file.downloadUrl)}
                              className="btn btn-sm btn-outline-secondary text-xs"
                            >
                              ดูไฟล์
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={busyAction}
                              onClick={() => handleDeleteOrphanedCloudFile(file)}
                              className="btn btn-sm btn-light border text-danger"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Tablet & Desktop Table (>= md) */}
              <div className="hidden md:block table-responsive">
                <table className="table table-hover align-middle mb-0 text-sm">
                <thead className="table-light">
                  <tr>
                    <th className="px-4 py-3">ชื่อไฟล์ / โฟลเดอร์</th>
                    <th className="px-4 py-3">สถานะการใช้งาน</th>
                    <th className="px-4 py-3 text-center">วันที่อัปโหลด</th>
                    <th className="px-4 py-3 text-end">ขนาดไฟล์</th>
                    <th className="px-4 py-3 text-end">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {storageFiles.map((file) => {
                    const isOrphaned = report.orphanedStorageFiles.some(
                      (o) => o.fullPath === file.fullPath
                    );
                    return (
                      <tr key={file.fullPath}>
                        <td className="px-4 py-3">
                          <div className="font-mono-num text-xs font-semibold text-slate-900">
                            {file.name}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-num">
                            {file.fullPath}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold">
                          {isOrphaned ? (
                            <span className="text-rose-700">ไฟล์กำพร้า (ไม่ได้ใช้งานแล้ว)</span>
                          ) : (
                            <span className="text-emerald-700">กำลังใช้งานในระบบ</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-xs font-mono-num text-slate-600">
                          {file.timeCreated ? formatShortDate(file.timeCreated.slice(0, 10)) : '-'}
                        </td>
                        <td className="px-4 py-3 text-end font-mono-num font-bold text-slate-900">
                          {formatBytes(file.sizeBytes)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            {file.downloadUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewPhotoUrl(file.downloadUrl)}
                                className="btn btn-sm btn-outline-secondary"
                              >
                                ดูไฟล์
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                disabled={busyAction}
                                onClick={() => handleDeleteOrphanedCloudFile(file)}
                                className="btn btn-sm btn-light border text-danger"
                                title="ลบไฟล์ออกจาก Cloud Storage"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {/* Lightbox Image Preview */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 flex items-center justify-center p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="bg-white rounded-xl p-3 max-w-2xl w-full shadow-2xl animate-figma-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-slate-900">ตัวอย่างรูปภาพในคลังข้อมูล</span>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="btn btn-sm btn-light"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewPhotoUrl}
              alt="ตัวอย่างรูปภาพในคลังข้อมูล"
              referrerPolicy="no-referrer"
              className="w-full max-h-[75vh] object-contain rounded-lg bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
};
