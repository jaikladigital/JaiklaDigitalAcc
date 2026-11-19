import React, { useState } from 'react';
import {
  CheckCircle2,
  Contrast,
  FileStack,
  RotateCw,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { uploadAssetFile } from '../firebase';
import {
  buildCompactFirestoreFallbackPreview,
  processScannedFiles,
  ScannedPageItem,
  transformScannedPage,
} from '../utils/scannerProcessor';
import { ReceiptOcrResponse, scanMultiPageScannedItems } from '../utils/receiptOcrClient';
import { formatBytes } from '../utils/storageOptimizer';
import { toastError, toastSuccess } from '../utils/swal';

export interface MultiPageScanResult {
  receiptUrl: string;
  scanFileUrl: string;
  scanFileName: string;
  scanFileType: string;
  scanPageCount: number;
  scanFileSizeBytes: number;
  ocrResult?: ReceiptOcrResponse;
}

interface MultiPageScannerModalProps {
  storageFolderPrefix: string;
  title?: string;
  onComplete: (result: MultiPageScanResult) => void;
  onClose: () => void;
}

export const MultiPageScannerModal: React.FC<MultiPageScannerModalProps> = ({
  storageFolderPrefix,
  title = 'นำเข้าและสแกนเอกสารจากเครื่องสแกนกระดาษ (PDF / TIFF / หลายหน้า)',
  onComplete,
  onClose,
}) => {
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [primaryFileName, setPrimaryFileName] = useState('');
  const [primaryFileType, setPrimaryFileType] = useState('');
  const [totalSourceBytes, setTotalSourceBytes] = useState(0);
  const [truncatedPages, setTruncatedPages] = useState(0);
  const [highContrast, setHighContrast] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [uploadingAndScanning, setUploadingAndScanning] = useState(false);
  const [runAiOcr, setRunAiOcr] = useState(true);
  const [zoomed, setZoomed] = useState(false);

  const activePage = pages[activeIndex] || null;

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setProcessing(true);
    setProgressPct(5);
    setProgressMsg('กำลังอ่านไฟล์จากเครื่องสแกน...');
    try {
      const summary = await processScannedFiles(fileList, {
        maxPages: 25,
        highContrast,
        onProgress: (pct, msg) => {
          setProgressPct(pct);
          setProgressMsg(msg);
        },
      });
      if (summary.pages.length === 0) {
        toastError('ไม่พบหน้าเอกสารในไฟล์ที่เลือก');
        return;
      }
      setPages((prev) => {
        const merged = [...prev, ...summary.pages].map((p, idx) => ({
          ...p,
          pageNumber: idx + 1,
        }));
        return merged.slice(0, 25);
      });
      if (!primaryFile && summary.primaryFile) {
        setPrimaryFile(summary.primaryFile);
        setPrimaryFileName(summary.sourceFileNames.join(', '));
        setPrimaryFileType(summary.primaryFileType);
      } else if (summary.sourceFileNames.length > 0) {
        setPrimaryFileName((prev) =>
          prev ? `${prev}, ${summary.sourceFileNames.join(', ')}` : summary.sourceFileNames.join(', ')
        );
      }
      setTotalSourceBytes((prev) => prev + summary.totalSourceBytes);
      setTruncatedPages((prev) => prev + summary.truncatedPages);
      toastSuccess(`ถอดหน้าเอกสารสำเร็จ ${summary.pages.length} หน้า`);
    } catch (err) {
      toastError(
        'ไม่สามารถประมวลผลไฟล์สแกนได้',
        err instanceof Error ? err.message : 'กรุณาตรวจสอบรูปแบบไฟล์'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleRotateActive = async () => {
    if (!activePage) return;
    const nextRot = (((activePage.rotation + 90) % 360) as 0 | 90 | 180 | 270);
    const updated = await transformScannedPage(activePage, nextRot, activePage.highContrast);
    setPages((prev) => prev.map((p, idx) => (idx === activeIndex ? updated : p)));
  };

  const handleToggleContrastActive = async () => {
    if (!activePage) return;
    const nextContrast = !activePage.highContrast;
    const updated = await transformScannedPage(activePage, activePage.rotation, nextContrast);
    setPages((prev) => prev.map((p, idx) => (idx === activeIndex ? updated : p)));
  };

  const handleRemovePage = (idxToRemove: number) => {
    setPages((prev) => {
      const next = prev
        .filter((_, i) => i !== idxToRemove)
        .map((p, i) => ({ ...p, pageNumber: i + 1 }));
      setActiveIndex((cur) => Math.max(0, Math.min(cur, next.length - 1)));
      return next;
    });
  };

  const handleConfirmAttachAndScan = async () => {
    if (pages.length === 0) {
      toastError('กรุณาเลือกไฟล์สแกนอย่างน้อย 1 หน้า');
      return;
    }

    setUploadingAndScanning(true);
    setProgressPct(15);
    setProgressMsg('กำลังสร้างภาพสรุปและอัปโหลดไฟล์สแกน...');

    try {
      const compactFallbackPromise = buildCompactFirestoreFallbackPreview(pages);

      // Try uploading original full-resolution multi-page PDF/TIFF/Image to Firebase Storage
      const storageUploadPromise = (async (): Promise<string> => {
        if (!primaryFile) return '';
        try {
          const safeName = primaryFile.name.replace(/[^\w.-]+/g, '_');
          const url = await uploadAssetFile(
            `${storageFolderPrefix}/${Date.now()}_${safeName}`,
            primaryFile
          );
          return url.startsWith('http') ? url : '';
        } catch {
          return '';
        }
      })();

      const ocrPromise = runAiOcr
        ? (async () => {
            setProgressMsg(`กำลังส่ง ${Math.min(pages.length, 12)} หน้าให้ AI อ่านข้อมูล...`);
            return await scanMultiPageScannedItems(pages);
          })()
        : Promise.resolve(undefined);

      const [compactPreview, cloudScanUrl, ocrResult] = await Promise.all([
        compactFallbackPromise,
        storageUploadPromise,
        ocrPromise,
      ]);

      setProgressPct(100);
      onComplete({
        receiptUrl: compactPreview,
        scanFileUrl: cloudScanUrl,
        scanFileName: primaryFileName || `scan_${pages.length}_pages`,
        scanFileType: primaryFileType || 'application/pdf',
        scanPageCount: pages.length,
        scanFileSizeBytes:
          totalSourceBytes || pages.reduce((s, p) => s + p.sizeBytes, 0),
        ocrResult,
      });
    } catch (err) {
      toastError(
        'บันทึกไฟล์สแกนไม่สำเร็จ',
        err instanceof Error ? err.message : 'กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setUploadingAndScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl shadow-2xl animate-figma-modal overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-slate-900 text-white shrink-0">
              <FileStack className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 m-0 truncate thai-heading">
                {title}
              </h3>
              <div className="text-xs text-slate-500">
                รองรับ PDF หลายหน้าขนาดใหญ่ · TIFF หลายหน้า (.tif/.tiff) · ภาพความละเอียดสูงหลายแผ่นพร้อมกัน
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploadingAndScanning}
            className="btn btn-sm btn-light border shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Upload Dropzone Bar */}
          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
            <div className="text-center sm:text-left">
              <div className="text-sm font-bold text-slate-900">
                เลือกไฟล์จากเครื่องสแกนกระดาษ (รับไฟล์ขนาดใหญ่ได้ถึง 100 MB / สูงสุด 25 หน้าต่อชุด)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                ระบบจะแยกหน้า PDF / TIFF ในเบราว์เซอร์ ปรับความคมชัด และย่อขนาดอัตโนมัติให้เหมาะกับฐานข้อมูล
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={(e) => setHighContrast(e.target.checked)}
                />
                <Contrast className="w-3.5 h-3.5 text-slate-600" />
                ปรับคมชัดตัวอักษรขาว-ดำ
              </label>

              <label className="figma-btn inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                <Upload className="w-4 h-4" />
                เลือกไฟล์ PDF / TIFF / รูปสแกน
                <input
                  type="file"
                  multiple
                  accept=".pdf,.tif,.tiff,application/pdf,image/tiff,image/*"
                  className="hidden"
                  onChange={(e) => {
                    handleFilesSelected(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          {/* Progress Banner */}
          {(processing || uploadingAndScanning) && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                <span>{progressMsg || 'กำลังประมวลผล...'}</span>
                <span className="font-mono-num">{progressPct}%</span>
              </div>
              <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {truncatedPages > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              ไฟล์ต้นฉบับมีเกิน 25 หน้า — ระบบโหลดเข้ามาจัดการ {pages.length} หน้าแรก (ตัดออก {truncatedPages} หน้าเพื่อประสิทธิภาพสูงสุด)
            </div>
          )}

          {/* Page Preview & Thumbnail Strip */}
          {pages.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Page Thumbnails */}
              <div className="lg:col-span-4 border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2 max-h-[420px] overflow-y-auto">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-1 border-b border-slate-200">
                  <span>รายการหน้าที่ถอดได้ ({pages.length} หน้า)</span>
                  <span className="font-mono-num text-slate-500">
                    ต้นฉบับ {formatBytes(totalSourceBytes)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
                  {pages.map((p, idx) => (
                    <div
                      key={p.id}
                      onClick={() => setActiveIndex(idx)}
                      className={`group relative rounded-lg border p-1.5 cursor-pointer transition-all bg-white ${
                        idx === activeIndex
                          ? 'border-blue-600 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <div className="aspect-[3/4] bg-slate-100 rounded overflow-hidden flex items-center justify-center">
                        <img
                          src={p.thumbDataUrl}
                          alt={`หน้าที่ ${p.pageNumber}`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1 px-0.5 text-[11px]">
                        <span className="font-bold text-slate-800 font-mono-num">
                          หน้า {p.pageNumber}
                        </span>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleRemovePage(idx);
                          }}
                          className="text-slate-400 hover:text-rose-600 p-0.5"
                          title="ลบหน้านี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: Active Page Preview & Tools */}
              <div className="lg:col-span-8 border border-slate-200 rounded-xl p-3.5 bg-white flex flex-col">
                {activePage && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-100">
                      <div className="text-xs text-slate-600 min-w-0 truncate">
                        <strong className="text-slate-900">หน้า {activePage.pageNumber}/{pages.length}</strong>
                        <span className="mx-1.5">·</span>
                        <span>{activePage.sourceFileName}</span>
                        <span className="mx-1.5">·</span>
                        <span className="font-mono-num">
                          {activePage.width}×{activePage.height}px
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleRotateActive}
                          className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1 text-xs"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          หมุน 90°
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleContrastActive}
                          className={`btn btn-sm inline-flex items-center gap-1 text-xs ${
                            activePage.highContrast ? 'btn-dark' : 'btn-outline-secondary'
                          }`}
                        >
                          <Contrast className="w-3.5 h-3.5" />
                          คมชัด
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoomed(!zoomed)}
                          className="btn btn-sm btn-outline-secondary inline-flex items-center gap-1 text-xs"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                          {zoomed ? 'พอดีกรอบ' : 'ขยาย'}
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 bg-slate-100 rounded-lg p-2 overflow-auto max-h-[360px] flex items-center justify-center">
                      <img
                        src={activePage.ocrDataUrl}
                        alt={`Scan page ${activePage.pageNumber}`}
                        className={
                          zoomed
                            ? 'max-w-none w-[900px] shadow'
                            : 'max-h-[340px] w-auto object-contain shadow'
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-slate-500 text-sm border border-slate-100 rounded-xl bg-slate-50/40">
              <ScanLine className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              ยังไม่มีไฟล์เอกสาร — กดปุ่ม &ldquo;เลือกไฟล์ PDF / TIFF / รูปสแกน&rdquo; เพื่อเริ่มต้น
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={runAiOcr}
              onChange={(e) => setRunAiOcr(e.target.checked)}
            />
            <Sparkles className="w-4 h-4 text-blue-700" />
            ให้ AI อ่านข้อมูลจากทุกหน้า ({Math.min(pages.length, 12)} หน้า) ลงแบบฟอร์มอัตโนมัติ
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploadingAndScanning}
              className="btn btn-light border text-sm"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={pages.length === 0 || processing || uploadingAndScanning}
              onClick={handleConfirmAttachAndScan}
              className="figma-btn inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {uploadingAndScanning
                ? 'กำลังอัปโหลดและสแกน AI...'
                : `ยืนยันแนบ ${pages.length} หน้า${runAiOcr ? ' และดึงข้อมูลอัตโนมัติ' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
