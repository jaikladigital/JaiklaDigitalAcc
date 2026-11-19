import { GoogleGenAI, Type } from '@google/genai';

interface VercelRequestLike {
  method?: string;
  body?: unknown;
}

interface VercelResponseLike {
  status: (code: number) => VercelResponseLike;
  json: (data: unknown) => void;
}

interface ScannedPagePart {
  imageBase64: string;
  mimeType: string;
  pageNumber?: number;
}

interface ReceiptExtractResult {
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

function parseRequestBody(rawBody: unknown): {
  imageBase64?: string;
  mimeType?: string;
  pages?: ScannedPagePart[];
} {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody) as {
        imageBase64?: string;
        mimeType?: string;
        pages?: ScannedPagePart[];
      };
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') {
    return rawBody as {
      imageBase64?: string;
      mimeType?: string;
      pages?: ScannedPagePart[];
    };
  }
  return {};
}

function parseGeminiJson(rawText: string): Partial<ReceiptExtractResult> | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Partial<ReceiptExtractResult>;
  } catch {
    const startIdx = cleaned.indexOf('{');
    const endIdx = cleaned.lastIndexOf('}');
    if (startIdx >= 0 && endIdx > startIdx) {
      try {
        return JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as Partial<ReceiptExtractResult>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const body = parseRequestBody(req.body);
    const rawPages: ScannedPagePart[] =
      Array.isArray(body.pages) && body.pages.length > 0
        ? body.pages
        : body.imageBase64
          ? [{ imageBase64: body.imageBase64, mimeType: body.mimeType || 'image/jpeg', pageNumber: 1 }]
          : [];

    const cleanPages = rawPages
      .slice(0, 12)
      .map((p, idx) => ({
        pageNumber: Number(p.pageNumber) || idx + 1,
        mimeType: String(p.mimeType || 'image/jpeg'),
        data: String(p.imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim(),
      }))
      .filter((p) => p.data.length > 0);

    if (cleanPages.length === 0) {
      res.status(400).json({ ok: false, error: 'ไม่พบข้อมูลรูปภาพหรือไฟล์เอกสารสำหรับสแกน' });
      return;
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        ok: false,
        error:
          'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ในระบบหลังบ้าน กรุณากรอกรายละเอียดและยอดเงินด้านล่างด้วยตนเอง',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptText = [
      `โปรดอ่านข้อมูลจากเอกสารที่สแกนหรือรูปใบเสร็จ/สลิปทั้งหมด ${cleanPages.length} หน้า แล้วสรุปส่งคืนเป็น JSON:`,
      '1. ตรวจสอบก่อนว่าภาพชัดเจนพออ่านได้หรือไม่ ถ้าเบลอ มืด ตัดขอบ หรืออ่านไม่ได้ ให้ตั้ง readable = false และอธิบายใน readabilityNote',
      '2. vendorName: ชื่อร้านค้า บริษัท ห้างหุ้นส่วน หรือบุคคลผู้รับเงินบนหัวบิล/ใบเสร็จ/สลิป (ถ้าอ่านไม่ได้ให้ใส่ "")',
      '3. vendorTaxId: เลขประจำตัวผู้เสียภาษี 13 หลัก หรือเลขบัตรประชาชน (ถ้ามี; ถ้าไม่มีให้ใส่ "")',
      '4. vendorEntityType: วิเคราะห์ว่าเป็น "corporate" (บริษัท/หจก./มูลนิธิ/เลข Tax ID ขึ้นต้นด้วย 0) หรือ "individual" (บุคคลธรรมดา/ร้านค้าบุคคล/เลขบัตร 13 หลักขึ้นต้น 1-8) หรือ "unknown"',
      '5. vendorAddress: ที่อยู่ของร้านค้า/ผู้รับเงิน (ถ้ามี)',
      '6. receiptDate: วันที่บนเอกสาร แปลงเป็น YYYY-MM-DD (ค.ศ. เสมอ ถ้าบนบิลเป็น พ.ศ. เช่น 2569 ให้ลบ 543 เป็น 2026)',
      '7. documentCategory: ระบุประเภทเอกสาร เช่น "ใบเสร็จรับเงิน", "ใบกำกับภาษี", "ใบแจ้งหนี้/วางบิล", "หนังสือรับรอง 50 ทวิ", "สลิปโอนเงิน"',
      '8. description: สรุปรายการสินค้า/บริการเป็นภาษาไทยกระชับครบถ้วน',
      '9. subtotal: ยอดเงินรวมก่อน VAT จากสรุปท้ายเอกสาร (ถ้าไม่แยก VAT ให้ใส่เท่ากับ totalAmount)',
      '10. vatRate: อัตรา VAT เป็นตัวเลข เช่น 7 หรือ 0',
      '11. vatAmount: ยอดเงิน VAT รวมเป็นบาท',
      '12. whtRate: หากเอกสารระบุหัก ณ ที่จ่ายไว้ ให้ระบุอัตรา เช่น 3, 2, 1, 5 (ถ้าไม่มีให้ใส่ 0)',
      '13. totalAmount: ยอดเงินรวมทั้งสิ้น',
      '14. pageSummary: สรุปย่อเนื้อหาแต่ละหน้า',
      '15. unreadableFields: รายชื่อช่องที่ภาพเบลอ/ขาดหาย/อ่านไม่ชัด จาก ["vendorName", "vendorTaxId", "receiptDate", "description", "amount"]',
      'ห้ามเดาตัวเลขหรือข้อความที่มองไม่เห็นเด็ดขาด',
    ].join('\n');

    const contentParts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
    for (const p of cleanPages) {
      contentParts.push({ text: `--- หน้าที่ ${p.pageNumber} ---` });
      contentParts.push({
        inlineData: {
          mimeType: p.mimeType,
          data: p.data,
        },
      });
    }
    contentParts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: contentParts },
      config: {
        systemInstruction:
          'คุณคือผู้เชี่ยวชาญด้านบัญชีและภาษีอากรไทยของ บริษัท ใจกล้า ดิจิตอล จำกัด ที่สกัดข้อมูลจากใบเสร็จ สลิป และเอกสารสแกนได้อย่างแม่นยำ ตรงไปตรงมา',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            readable: { type: Type.BOOLEAN },
            readabilityNote: { type: Type.STRING },
            vendorName: { type: Type.STRING },
            vendorTaxId: { type: Type.STRING },
            vendorEntityType: { type: Type.STRING },
            vendorAddress: { type: Type.STRING },
            receiptDate: { type: Type.STRING },
            documentCategory: { type: Type.STRING },
            description: { type: Type.STRING },
            subtotal: { type: Type.NUMBER },
            vatRate: { type: Type.NUMBER },
            vatAmount: { type: Type.NUMBER },
            whtRate: { type: Type.NUMBER },
            totalAmount: { type: Type.NUMBER },
            pageSummary: { type: Type.STRING },
            unreadableFields: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const parsed = parseGeminiJson(response.text ?? '{}');
    if (!parsed) {
      res.status(502).json({
        ok: false,
        error: 'AI อ่านรูปภาพแล้วไม่สามารถจัดรูปแบบข้อมูลได้ กรุณากรอกรายละเอียดเพิ่มเติมด้านล่าง',
      });
      return;
    }

    const subtotal = Number.isFinite(Number(parsed.subtotal)) ? Math.max(0, Number(parsed.subtotal)) : 0;
    const vatRate = Number.isFinite(Number(parsed.vatRate))
      ? Math.min(30, Math.max(0, Number(parsed.vatRate)))
      : 0;
    const vatAmount = Number.isFinite(Number(parsed.vatAmount)) ? Math.max(0, Number(parsed.vatAmount)) : 0;
    const whtRate = Number.isFinite(Number(parsed.whtRate))
      ? Math.min(30, Math.max(0, Number(parsed.whtRate)))
      : 0;
    const totalAmount = Number.isFinite(Number(parsed.totalAmount)) ? Math.max(0, Number(parsed.totalAmount)) : 0;
    const rawEntity = String(parsed.vendorEntityType || 'unknown').toLowerCase();
    const vendorEntityType: 'corporate' | 'individual' | 'unknown' =
      rawEntity === 'corporate' ? 'corporate' : rawEntity === 'individual' ? 'individual' : 'unknown';

    const data: ReceiptExtractResult = {
      readable: Boolean(parsed.readable),
      readabilityNote: String(parsed.readabilityNote || ''),
      vendorName: String(parsed.vendorName || '').trim(),
      vendorTaxId: String(parsed.vendorTaxId || '').trim(),
      vendorEntityType,
      vendorAddress: String(parsed.vendorAddress || '').trim(),
      receiptDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.receiptDate || '').trim())
        ? String(parsed.receiptDate).trim()
        : '',
      documentCategory: String(parsed.documentCategory || 'ใบเสร็จรับเงิน').trim(),
      description: String(parsed.description || '').trim(),
      subtotal:
        subtotal > 0
          ? subtotal
          : totalAmount > 0 && vatAmount >= 0
            ? Number((totalAmount - vatAmount).toFixed(2))
            : 0,
      vatRate,
      vatAmount,
      whtRate,
      totalAmount,
      pageCountScanned: cleanPages.length,
      pageSummary: String(parsed.pageSummary || '').trim(),
      unreadableFields: Array.isArray(parsed.unreadableFields)
        ? parsed.unreadableFields.map((x) => String(x))
        : [],
    };

    res.status(200).json({ ok: true, data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ไม่สามารถสแกนรูปใบเสร็จได้';
    console.error('[api/extract-receipt] error:', msg);
    if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      res.status(403).json({
        ok: false,
        error: 'API Key ของ Gemini ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน กรุณาตรวจสอบค่า GEMINI_API_KEY ในระบบ',
      });
      return;
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      res.status(429).json({
        ok: false,
        error: 'โควต้าการสแกนเอกสารเต็มชั่วคราว กรุณารอสักครู่หรือกรอกข้อมูลด้วยตนเอง',
      });
      return;
    }
    if (msg.includes('NOT_FOUND') || msg.includes('404')) {
      res.status(502).json({
        ok: false,
        error: 'โมเดลหรือปลายทาง AI ไม่พร้อมใช้งานในขณะนี้ กรุณากรอกข้อมูลด้านล่างด้วยตนเอง',
      });
      return;
    }
    res.status(502).json({
      ok: false,
      error: 'ไม่สามารถอ่านข้อมูลจากรูปใบเสร็จอัตโนมัติได้ในขณะนี้ กรุณากรอกข้อมูลด้านล่างด้วยตนเอง',
    });
  }
}
