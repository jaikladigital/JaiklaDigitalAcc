import * as pdfjsLib from 'pdfjs-dist';
import UTIF from 'utif';

// Configure pdf.js worker cleanly for Vite bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface ScannedPageItem {
  id: string;
  pageNumber: number;
  sourceFileName: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  highContrast: boolean;
  /** High-clarity JPEG Data URL for OCR extraction */
  ocrDataUrl: string;
  /** Lightweight WebP Data URL for fast UI thumbnail preview */
  thumbDataUrl: string;
  sizeBytes: number;
}

export interface ScannedBatchSummary {
  pages: ScannedPageItem[];
  totalSourceBytes: number;
  sourceFileCount: number;
  sourceFileNames: string[];
  primaryFile: File | null;
  primaryFileType: string;
  truncatedPages: number;
}

export interface ProcessScanOptions {
  maxPages?: number;
  renderScale?: number;
  highContrast?: boolean;
  onProgress?: (pct: number, message: string) => void;
}

function applyScanContrastFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Boost contrast & brighten paper background while keeping ink sharp
    const stretched = Math.min(255, Math.max(0, (gray - 128) * 1.38 + 138));
    d[i] = stretched;
    d[i + 1] = stretched;
    d[i + 2] = stretched;
  }
  ctx.putImageData(imgData, 0, 0);
}

function canvasToOutputs(
  sourceCanvas: HTMLCanvasElement,
  highContrast: boolean,
  rotation: 0 | 90 | 180 | 270 = 0
): { ocrDataUrl: string; thumbDataUrl: string; width: number; height: number; sizeBytes: number } {
  const maxOcrDim = 1500;
  const maxThumbDim = 420;

  const swap = rotation === 90 || rotation === 270;
  const rotW = swap ? sourceCanvas.height : sourceCanvas.width;
  const rotH = swap ? sourceCanvas.width : sourceCanvas.height;

  const ocrScale = Math.min(1, maxOcrDim / Math.max(rotW, rotH));
  const ocrCanvas = document.createElement('canvas');
  ocrCanvas.width = Math.max(1, Math.round(rotW * ocrScale));
  ocrCanvas.height = Math.max(1, Math.round(rotH * ocrScale));
  const ocrCtx = ocrCanvas.getContext('2d');
  if (ocrCtx) {
    ocrCtx.fillStyle = '#ffffff';
    ocrCtx.fillRect(0, 0, ocrCanvas.width, ocrCanvas.height);
    ocrCtx.save();
    ocrCtx.translate(ocrCanvas.width / 2, ocrCanvas.height / 2);
    ocrCtx.rotate((rotation * Math.PI) / 180);
    const drawW = swap ? ocrCanvas.height : ocrCanvas.width;
    const drawH = swap ? ocrCanvas.width : ocrCanvas.height;
    ocrCtx.drawImage(sourceCanvas, -drawW / 2, -drawH / 2, drawW, drawH);
    ocrCtx.restore();
    if (highContrast) {
      applyScanContrastFilter(ocrCtx, ocrCanvas.width, ocrCanvas.height);
    }
  }
  const ocrDataUrl = ocrCanvas.toDataURL('image/jpeg', 0.84);

  const thumbScale = Math.min(1, maxThumbDim / Math.max(ocrCanvas.width, ocrCanvas.height));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(ocrCanvas.width * thumbScale));
  thumbCanvas.height = Math.max(1, Math.round(ocrCanvas.height * thumbScale));
  const thumbCtx = thumbCanvas.getContext('2d');
  if (thumbCtx) {
    thumbCtx.drawImage(ocrCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  }
  const thumbDataUrl = thumbCanvas.toDataURL('image/webp', 0.72);

  return {
    ocrDataUrl,
    thumbDataUrl,
    width: ocrCanvas.width,
    height: ocrCanvas.height,
    sizeBytes: Math.round((ocrDataUrl.length * 3) / 4),
  };
}

export async function transformScannedPage(
  page: ScannedPageItem,
  nextRotation: 0 | 90 | 180 | 270,
  highContrast: boolean
): Promise<ScannedPageItem> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      // Compute relative rotation delta
      const delta = ((nextRotation - page.rotation + 360) % 360) as 0 | 90 | 180 | 270;
      const out = canvasToOutputs(canvas, highContrast && !page.highContrast, delta);
      resolve({
        ...page,
        rotation: nextRotation,
        highContrast,
        ocrDataUrl: out.ocrDataUrl,
        thumbDataUrl: out.thumbDataUrl,
        width: out.width,
        height: out.height,
        sizeBytes: out.sizeBytes,
      });
    };
    img.onerror = () => resolve(page);
    img.src = page.ocrDataUrl;
  });
}

async function processPdfFile(
  file: File,
  startPageNum: number,
  maxPagesRemaining: number,
  highContrast: boolean,
  onProgress?: (pct: number, message: string) => void
): Promise<{ pages: ScannedPageItem[]; truncated: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const totalPages = pdf.numPages;
  const toRender = Math.min(totalPages, maxPagesRemaining);
  const pages: ScannedPageItem[] = [];

  for (let i = 1; i <= toRender; i++) {
    onProgress?.(
      Math.round((i / toRender) * 85),
      `กำลังถอดหน้าเอกสาร PDF (${file.name}) หน้า ${i} จาก ${totalPages}...`
    );
    const pdfPage = await pdf.getPage(i);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    // Target ~1500px longest side for crisp scanner text OCR without blowing browser memory
    const targetScale = Math.min(2.4, Math.max(1.15, 1450 / Math.max(baseViewport.width, baseViewport.height)));
    const viewport = pdfPage.getViewport({ scale: targetScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise;
    }

    const out = canvasToOutputs(canvas, highContrast, 0);
    pages.push({
      id: `${file.name}_p${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pageNumber: startPageNum + pages.length,
      sourceFileName: `${file.name} (หน้า ${i}/${totalPages})`,
      width: out.width,
      height: out.height,
      rotation: 0,
      highContrast,
      ocrDataUrl: out.ocrDataUrl,
      thumbDataUrl: out.thumbDataUrl,
      sizeBytes: out.sizeBytes,
    });
  }

  return {
    pages,
    truncated: Math.max(0, totalPages - toRender),
  };
}

async function processTiffFile(
  file: File,
  startPageNum: number,
  maxPagesRemaining: number,
  highContrast: boolean,
  onProgress?: (pct: number, message: string) => void
): Promise<{ pages: ScannedPageItem[]; truncated: number }> {
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  const totalPages = ifds.length;
  const toRender = Math.min(totalPages, maxPagesRemaining);
  const pages: ScannedPageItem[] = [];

  for (let i = 0; i < toRender; i++) {
    onProgress?.(
      Math.round(((i + 1) / toRender) * 85),
      `กำลังถอดภาพสแกน TIFF (${file.name}) หน้า ${i + 1} จาก ${totalPages}...`
    );
    const ifd = ifds[i];
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    const canvas = document.createElement('canvas');
    canvas.width = ifd.width;
    canvas.height = ifd.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
      ctx.putImageData(imageData, 0, 0);
    }
    const out = canvasToOutputs(canvas, highContrast, 0);
    pages.push({
      id: `${file.name}_tif${i + 1}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      pageNumber: startPageNum + pages.length,
      sourceFileName: `${file.name} (หน้า ${i + 1}/${totalPages})`,
      width: out.width,
      height: out.height,
      rotation: 0,
      highContrast,
      ocrDataUrl: out.ocrDataUrl,
      thumbDataUrl: out.thumbDataUrl,
      sizeBytes: out.sizeBytes,
    });
  }

  return {
    pages,
    truncated: Math.max(0, totalPages - toRender),
  };
}

async function processImageFile(
  file: File,
  pageNumber: number,
  highContrast: boolean
): Promise<ScannedPageItem> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
        }
        const out = canvasToOutputs(canvas, highContrast, 0);
        resolve({
          id: `${file.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          pageNumber,
          sourceFileName: file.name,
          width: out.width,
          height: out.height,
          rotation: 0,
          highContrast,
          ocrDataUrl: out.ocrDataUrl,
          thumbDataUrl: out.thumbDataUrl,
          sizeBytes: out.sizeBytes,
        });
      };
      img.onerror = () => reject(new Error(`ไม่สามารถเปิดไฟล์ภาพ ${file.name} ได้`));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error(`ไม่สามารถอ่านไฟล์ ${file.name} ได้`));
    reader.readAsDataURL(file);
  });
}

export async function processScannedFiles(
  fileList: FileList | File[],
  options: ProcessScanOptions = {}
): Promise<ScannedBatchSummary> {
  const maxPages = options.maxPages ?? 25;
  const highContrast = options.highContrast ?? false;
  const files = Array.from(fileList);

  const pages: ScannedPageItem[] = [];
  let totalSourceBytes = 0;
  let truncatedPages = 0;
  const sourceFileNames: string[] = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    totalSourceBytes += file.size;
    sourceFileNames.push(file.name);

    const remaining = maxPages - pages.length;
    if (remaining <= 0) {
      truncatedPages += 1;
      continue;
    }

    const lower = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
    const isTiff =
      file.type === 'image/tiff' ||
      file.type === 'image/tif' ||
      lower.endsWith('.tif') ||
      lower.endsWith('.tiff');

    if (isPdf) {
      const res = await processPdfFile(
        file,
        pages.length + 1,
        remaining,
        highContrast,
        options.onProgress
      );
      pages.push(...res.pages);
      truncatedPages += res.truncated;
    } else if (isTiff) {
      const res = await processTiffFile(
        file,
        pages.length + 1,
        remaining,
        highContrast,
        options.onProgress
      );
      pages.push(...res.pages);
      truncatedPages += res.truncated;
    } else if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|bmp|webp|gif)$/i.test(lower)) {
      options.onProgress?.(
        Math.round(((idx + 1) / files.length) * 90),
        `กำลังปรับขนาดและเตรียมหน้าภาพ ${file.name}...`
      );
      const item = await processImageFile(file, pages.length + 1, highContrast);
      pages.push(item);
    } else {
      throw new Error(
        `ไม่รองรับรูปแบบไฟล์ "${file.name}" — รองรับ PDF หลายหน้า, TIFF หลายหน้า และไฟล์รูปภาพ JPG/PNG/BMP/WebP`
      );
    }
  }

  options.onProgress?.(100, `ประมวลผลเอกสารสแกนสำเร็จ ${pages.length} หน้า`);

  return {
    pages,
    totalSourceBytes,
    sourceFileCount: files.length,
    sourceFileNames,
    primaryFile: files[0] || null,
    primaryFileType: files[0]?.type || (files[0]?.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
    truncatedPages,
  };
}

/**
 * Creates a compact stitched vertical preview image (capped <= 55KB WebP)
 * when Firestore fallback is used instead of Storage, or extracts a compact Page-1 cover.
 */
export async function buildCompactFirestoreFallbackPreview(
  pages: ScannedPageItem[],
  maxBytes = 52000
): Promise<string> {
  if (pages.length === 0) return '';
  if (pages.length === 1) {
    // Downscale single page cleanly under 52KB
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        for (const [w, q] of [
          [720, 0.7],
          [520, 0.58],
          [380, 0.48],
        ] as const) {
          const scale = Math.min(1, w / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/webp', q);
          if (url.length <= maxBytes) {
            resolve(url);
            return;
          }
        }
        resolve(pages[0].thumbDataUrl.slice(0, maxBytes));
      };
      img.onerror = () => resolve(pages[0].thumbDataUrl);
      img.src = pages[0].ocrDataUrl;
    });
  }

  // Multi-page: stitch up to first 4 pages into a compact vertical proof sheet <= 52KB
  const samplePages = pages.slice(0, 4);
  const loadedImgs = await Promise.all(
    samplePages.map(
      (p) =>
        new Promise<HTMLImageElement | null>((res) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => res(null);
          img.src = p.thumbDataUrl;
        })
    )
  );
  const validImgs = loadedImgs.filter((x): x is HTMLImageElement => Boolean(x));
  if (validImgs.length === 0) return '';

  for (const [targetW, q] of [
    [360, 0.56],
    [280, 0.46],
    [220, 0.4],
  ] as const) {
    const heights = validImgs.map((im) => Math.round((im.height / im.width) * targetW));
    const totalH = heights.reduce((a, b) => a + b + 6, 0);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = Math.max(1, totalH);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let y = 0;
      validImgs.forEach((im, idx) => {
        ctx.drawImage(im, 0, y, targetW, heights[idx]);
        y += heights[idx] + 6;
      });
    }
    const url = canvas.toDataURL('image/webp', q);
    if (url.length <= maxBytes) return url;
  }

  return validImgs[0] ? pages[0].thumbDataUrl : '';
}
