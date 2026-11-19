import { ScannedPageItem } from './scannerProcessor';

export interface ReceiptOcrData {
  readable: boolean;
  readabilityNote: string;
  vendorName: string;
  vendorTaxId: string;
  vendorEntityType: 'corporate' | 'individual' | 'unknown';
  vendorAddress: string;
  receiptDate: string;
  documentCategory: string;
  description: string;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  whtRate: number;
  totalAmount: number;
  pageCountScanned: number;
  pageSummary: string;
  unreadableFields: string[];
}

export interface ReceiptOcrResponse {
  ok: boolean;
  data?: ReceiptOcrData;
  error?: string;
}

export const FIELD_LABELS_TH: Record<string, string> = {
  vendorName: 'ชื่อร้านค้า / ผู้รับเงิน',
  vendorTaxId: 'เลขประจำตัวผู้เสียภาษี',
  receiptDate: 'วันที่บนเอกสาร',
  description: 'รายละเอียดสินค้า/บริการ',
  amount: 'จำนวนเงินรวม',
};

async function prepareImageBase64ForOcr(file: File): Promise<{ base64: string; mimeType: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('กรุณาใช้ตัวสแกนหลายหน้าสำหรับไฟล์ PDF หรือ TIFF');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1280;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const raw = String(reader.result);
          resolve({ base64: raw, mimeType: file.type || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        resolve({ base64: dataUrl, mimeType: 'image/jpeg' });
      };
      img.onerror = () => {
        resolve({ base64: String(reader.result), mimeType: file.type || 'image/jpeg' });
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    reader.readAsDataURL(file);
  });
}

async function parseOcrHttpResponse(res: Response, fallbackMsg: string): Promise<ReceiptOcrResponse> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return { ok: false, error: fallbackMsg };
  }

  let parsed: ReceiptOcrResponse | null = null;
  if (rawText.trim().startsWith('{')) {
    try {
      parsed = JSON.parse(rawText) as ReceiptOcrResponse;
    } catch {
      parsed = null;
    }
  }

  if (parsed && typeof parsed === 'object') {
    if (!res.ok || !parsed.ok) {
      return {
        ok: false,
        error: parsed.error || fallbackMsg,
      };
    }
    return parsed;
  }

  if (res.status === 413) {
    return {
      ok: false,
      error: 'ขนาดไฟล์รูปภาพใหญ่เกินไป กรุณาลองเลือกภาพที่ขนาดเล็กลงหรือกรอกข้อมูลด้วยตนเอง',
    };
  }
  if (res.status === 503) {
    return {
      ok: false,
      error: 'ระบบอ่านใบเสร็จอัตโนมัติยังไม่พร้อมใช้งานในขณะนี้ กรุณากรอกข้อมูลด้านล่างด้วยตนเอง',
    };
  }
  if (res.status >= 500 || /server error/i.test(rawText)) {
    return {
      ok: false,
      error: 'ระบบอ่านใบเสร็จด้วย AI ขัดข้องชั่วคราว กรุณากด "สแกนใหม่อีกครั้ง" หรือกรอกข้อมูลด้านล่างด้วยตนเอง',
    };
  }

  return { ok: false, error: fallbackMsg };
}

export async function scanMultiPageScannedItems(
  pages: ScannedPageItem[]
): Promise<ReceiptOcrResponse> {
  if (!pages || pages.length === 0) {
    return { ok: false, error: 'ไม่มีหน้าเอกสารสำหรับสแกน' };
  }
  try {
    const payloadPages = pages.slice(0, 12).map((p, idx) => ({
      imageBase64: p.ocrDataUrl,
      mimeType: 'image/jpeg',
      pageNumber: idx + 1,
    }));

    const res = await fetch('/api/extract-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: payloadPages }),
    });
    return await parseOcrHttpResponse(
      res,
      'ไม่สามารถอ่านข้อมูลจากเอกสารสแกนได้ กรุณากรอกเพิ่มเติมด้วยตนเอง'
    );
  } catch {
    return {
      ok: false,
      error: 'ไม่สามารถเชื่อมต่อระบบสแกนเอกสารได้ในขณะนี้ กรุณากรอกข้อมูลด้วยตนเอง',
    };
  }
}

export async function scanReceiptFile(file: File): Promise<ReceiptOcrResponse> {
  try {
    const { base64, mimeType } = await prepareImageBase64ForOcr(file);
    const res = await fetch('/api/extract-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    return await parseOcrHttpResponse(
      res,
      'ไม่สามารถอ่านข้อมูลจากรูปใบเสร็จได้ กรุณากรอกข้อมูลเพิ่มเติมด้วยตนเอง'
    );
  } catch {
    return {
      ok: false,
      error: 'ไม่สามารถสแกนรูปใบเสร็จได้ กรุณากรอกข้อมูลด้วยตนเอง',
    };
  }
}

export async function scanReceiptFromDataUrlOrImage(srcUrl: string): Promise<ReceiptOcrResponse> {
  try {
    if (srcUrl.startsWith('data:image/')) {
      const mimeMatch = /^data:([^;]+);base64,/.exec(srcUrl);
      const res = await fetch('/api/extract-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: srcUrl,
          mimeType: mimeMatch?.[1] || 'image/webp',
        }),
      });
      return await parseOcrHttpResponse(res, 'ไม่สามารถสแกนรูปภาพได้ กรุณากรอกข้อมูลด้วยตนเอง');
    }

    const imgRes = await fetch(srcUrl);
    const blob = await imgRes.blob();
    const file = new File([blob], 'receipt.jpg', { type: blob.type || 'image/jpeg' });
    return await scanReceiptFile(file);
  } catch {
    return {
      ok: false,
      error: 'ไม่สามารถดึงรูปเพื่อสแกนซ้ำได้ กรุณาอัปโหลดรูปใหม่หรือพิมพ์ข้อมูลเพิ่มเติมด้วยตนเอง',
    };
  }
}
