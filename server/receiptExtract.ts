import { GoogleGenAI, Type } from '@google/genai';

export interface ScannedPagePart {
  imageBase64: string;
  mimeType: string;
  pageNumber?: number;
}

export interface ReceiptExtractRequest {
  imageBase64?: string;
  mimeType?: string;
  pages?: ScannedPagePart[];
}

export interface ReceiptExtractResult {
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

export class ReceiptExtractError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ReceiptExtractError';
    this.status = status;
  }
}

export async function extractReceiptFromImage(
  input: ReceiptExtractRequest
): Promise<ReceiptExtractResult> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new ReceiptExtractError(
      'ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Settings > Secrets ของระบบ กรุณากรอกข้อมูลใบเสร็จด้วยตนเองหรือเพิ่มคีย์ก่อนใช้งานสแกนอัตโนมัติ',
      503
    );
  }

  const rawPages: ScannedPagePart[] = Array.isArray(input.pages) && input.pages.length > 0
    ? input.pages
    : input.imageBase64
      ? [{ imageBase64: input.imageBase64, mimeType: input.mimeType || 'image/jpeg', pageNumber: 1 }]
      : [];

  const cleanPages = rawPages
    .slice(0, 12)
    .map((p, idx) => ({
      pageNumber: p.pageNumber ?? idx + 1,
      mimeType: p.mimeType || 'image/jpeg',
      data: String(p.imageBase64 || '').replace(/^data:[^;]+;base64,/, '').trim(),
    }))
    .filter((p) => p.data.length > 0);

  if (cleanPages.length === 0) {
    throw new ReceiptExtractError('ไม่พบข้อมูลรูปภาพหรือหน้าเอกสารสำหรับสแกน', 400);
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
    `โปรดอ่านข้อมูลจากเอกสารที่สแกนจากเครื่องสแกนกระดาษทั้งหมด ${cleanPages.length} หน้า แล้วสรุปส่งคืนเป็น JSON:`,
    '1. ตรวจสอบก่อนว่าภาพ/เอกสารชัดเจนพออ่านได้หรือไม่ ถ้าเบลอ มืด ตัดขอบ หรืออ่านไม่ได้ ให้ตั้ง readable = false และอธิบายใน readabilityNote',
    '2. vendorName: ชื่อร้านค้า บริษัท ห้างหุ้นส่วน หรือบุคคลผู้รับเงินบนหัวบิล/ใบเสร็จ (ถ้าอ่านไม่ได้ให้ใส่ "")',
    '3. vendorTaxId: เลขประจำตัวผู้เสียภาษี 13 หลัก หรือเลขบัตรประชาชน (ถ้ามี; ถ้าไม่มีให้ใส่ "")',
    '4. vendorEntityType: วิเคราะห์ว่าเป็น "corporate" (บริษัท/หจก./มูลนิธิ/เลข Tax ID ขึ้นต้นด้วย 0) หรือ "individual" (บุคคลธรรมดา/ร้านค้าบุคคล/เลขบัตร 13 หลักขึ้นต้น 1-8) หรือ "unknown"',
    '5. vendorAddress: ที่อยู่ของร้านค้า/ผู้รับเงิน (ถ้ามี)',
    '6. receiptDate: วันที่บนเอกสาร แปลงเป็น YYYY-MM-DD (ค.ศ. เสมอ ถ้าบนบิลเป็น พ.ศ. เช่น 2569 ให้ลบ 543 เป็น 2026)',
    '7. documentCategory: ระบุประเภทเอกสาร เช่น "ใบเสร็จรับเงิน", "ใบกำกับภาษี", "ใบแจ้งหนี้/วางบิล", "หนังสือรับรอง 50 ทวิ", "งบการเงิน/เอกสารราชการ", "สลิปโอนเงิน"',
    '8. description: สรุปรายการสินค้า/บริการรวมจากทุกหน้าเป็นภาษาไทยกระชับครบถ้วน',
    '9. subtotal: ยอดเงินรวมก่อน VAT จากสรุปท้ายเอกสาร (ถ้าไม่แยก VAT ให้ใส่เท่ากับ totalAmount)',
    '10. vatRate: อัตรา VAT เป็นตัวเลข เช่น 7 หรือ 0',
    '11. vatAmount: ยอดเงิน VAT รวมเป็นบาท',
    '12. whtRate: หากเอกสารระบุหัก ณ ที่จ่ายไว้ ให้ระบุอัตรา เช่น 3, 2, 1, 5 (ถ้าไม่มีให้ใส่ 0)',
    '13. totalAmount: ยอดเงินรวมทั้งสิ้นจากหน้าสรุป',
    '14. pageSummary: สรุปย่อว่าแต่ละหน้าในไฟล์สแกนหลายหน้ามีเนื้อหาอะไรบ้าง',
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

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts: contentParts },
      config: {
        systemInstruction:
          'คุณคือผู้เชี่ยวชาญด้านบัญชีและภาษีอากรไทยของ บริษัท ใจกล้า ดิจิตอล จำกัด ที่สกัดข้อมูลจากเอกสารสแกนกระดาษหลายหน้า (PDF/TIFF/ภาพถ่ายความละเอียดสูง) ได้อย่างแม่นยำ ตรงไปตรงมา',
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

    const raw = (response.text ?? '{}').trim();
    const parsed = JSON.parse(raw) as Partial<ReceiptExtractResult>;

    const subtotal = Number.isFinite(Number(parsed.subtotal)) ? Math.max(0, Number(parsed.subtotal)) : 0;
    const vatRate = Number.isFinite(Number(parsed.vatRate)) ? Math.min(30, Math.max(0, Number(parsed.vatRate))) : 0;
    const vatAmount = Number.isFinite(Number(parsed.vatAmount)) ? Math.max(0, Number(parsed.vatAmount)) : 0;
    const whtRate = Number.isFinite(Number(parsed.whtRate)) ? Math.min(30, Math.max(0, Number(parsed.whtRate))) : 0;
    const totalAmount = Number.isFinite(Number(parsed.totalAmount)) ? Math.max(0, Number(parsed.totalAmount)) : 0;
    const rawEntity = String(parsed.vendorEntityType || 'unknown').toLowerCase();
    const vendorEntityType: 'corporate' | 'individual' | 'unknown' =
      rawEntity === 'corporate' ? 'corporate' : rawEntity === 'individual' ? 'individual' : 'unknown';

    return {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ไม่สามารถสแกนเอกสารได้ในขณะนี้';
    if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      throw new ReceiptExtractError(
        'API Key ของ Gemini ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน กรุณาตรวจสอบใน Settings > Secrets',
        403
      );
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      throw new ReceiptExtractError(
        'โควต้าการสแกนเอกสารเต็มชั่วคราว กรุณารอสักครู่หรือกรอกข้อมูลด้วยตนเอง',
        429
      );
    }
    throw new ReceiptExtractError(`เกิดข้อผิดพลาดในการอ่านเอกสารที่สแกน: ${msg}`, 502);
  }
}
