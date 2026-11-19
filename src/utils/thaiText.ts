/**
 * Thai Text Segmentation & Phrase Integrity Helper
 * - Prevents Chrome/Safari ICU dictionary line-breakers from splitting compound Thai business nouns
 *   mid-phrase (e.g., ใบเสนอ|ราคา, ใบเสร็จ|รับเงิน, หัก ณ ที่|จ่าย).
 * - Uses Intl.Segmenter('th') when available to insert zero-width space (\u200B) cleanly between words
 *   while keeping connecting words (และ, หรือ, ที่, ใน, ของ, จาก, เพื่อ, โดย, พร้อม, ตาม) attached.
 */

export const PROTECTED_THAI_PHRASES = [
  'งบเปลี่ยนแปลงส่วนของผู้ถือหุ้น',
  'บริษัท ใจกล้า ดิจิตอล จำกัด',
  'หนังสือรับรองการหักภาษี ณ ที่จ่าย',
  'เลขประจำตัวผู้เสียภาษี',
  'ระบบออกเอกสารบัญชี',
  'ซัพพลายเยอร์',
  'ภาษีมูลค่าเพิ่ม',
  'หมายเหตุประกอบงบ',
  'งบประมาณและภาษี',
  'ลูกค้าและวิเคราะห์',
  'เปรียบเทียบราคา',
  'ใบเสร็จรับเงิน',
  'เบิกจ่ายฉุกเฉิน',
  'โปรเจกต์กลาง',
  'งบกำไรขาดทุน',
  'งบฐานะการเงิน',
  'หัก ณ ที่จ่าย',
  'เงินสดฉุกเฉิน',
  'สำนักงานใหญ่',
  'พื้นที่จัดเก็บ',
  'การออกเอกสาร',
  'งบประมาณบริษัท',
  'ค่าใช้จ่ายทั่วไป',
  'รายจ่ายและ 50 ทวิ',
  'QT · INV · REC',
  'ใบเสนอราคา',
  'ใบแจ้งหนี้',
  'ใบสำคัญจ่าย',
  'ใบกำกับภาษี',
  'ใบวางบิล',
  'หนังสือรับรอง',
  'งบการเงิน',
  'ค่าใช้จ่าย',
  'คลังข้อมูล',
  'ผู้ถือหุ้น',
  'ประจำปี',
  'รายเดือน',
  'สรรพากร',
  'นิติบุคคล',
  'ภ.ง.ด. 50',
  'ภ.ง.ด. 53',
  'ภ.ง.ด. 3',
  'ส.บช.3',
  'LINE OA',
  'A4 PDF',
  '50 ทวิ',
].sort((a, b) => b.length - a.length);

const ATTACH_TO_NEXT_WORDS = new Set([
  'และ',
  'หรือ',
  'ที่',
  'ใน',
  'ของ',
  'จาก',
  'เพื่อ',
  'โดย',
  'พร้อม',
  'ตาม',
  'กับ',
]);

const thaiWordSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('th', { granularity: 'word' })
    : null;

export function formatThaiLineBreaks(text: string): string {
  if (!text) return '';
  if (!thaiWordSegmenter) return text;

  let working = text;
  const placeholders: Array<{ token: string; phrase: string }> = [];

  PROTECTED_THAI_PHRASES.forEach((phrase, index) => {
    if (working.includes(phrase)) {
      const token = `__JKD_PHRASE_${index}__`;
      placeholders.push({ token, phrase: phrase.replace(/ /g, '\u00A0') });
      working = working.split(phrase).join(token);
    }
  });

  const segments = Array.from(thaiWordSegmenter.segment(working));
  let segmented = segments
    .map((seg, i) => {
      const next = segments[i + 1];
      if (!next) return seg.segment;
      if (ATTACH_TO_NEXT_WORDS.has(seg.segment)) {
        return seg.segment;
      }
      if (seg.isWordLike && next.isWordLike && !seg.segment.startsWith('__JKD_PHRASE_')) {
        return `${seg.segment}\u200B`;
      }
      return seg.segment;
    })
    .join('');

  placeholders.forEach(({ token, phrase }) => {
    segmented = segmented.split(token).join(phrase);
  });

  return segmented;
}

export interface ThaiRenderToken {
  text: string;
  nowrap: boolean;
}

/**
 * Splits text into protected atomic phrases (rendered inside white-space: nowrap spans)
 * and normal segmented Thai runs so browser line-breaking never chops compound words in half.
 */
export function tokenizeThaiForRender(text: string): ThaiRenderToken[] {
  if (!text) return [];

  let parts: ThaiRenderToken[] = [{ text, nowrap: false }];

  for (const phrase of PROTECTED_THAI_PHRASES) {
    const nextParts: ThaiRenderToken[] = [];
    for (const part of parts) {
      if (part.nowrap || !part.text.includes(phrase)) {
        nextParts.push(part);
        continue;
      }
      const segments = part.text.split(phrase);
      segments.forEach((seg, idx) => {
        if (seg) {
          nextParts.push({ text: seg, nowrap: false });
        }
        if (idx < segments.length - 1) {
          nextParts.push({ text: phrase, nowrap: true });
        }
      });
    }
    parts = nextParts;
  }

  return parts.map((p) =>
    p.nowrap ? p : { text: formatThaiLineBreaks(p.text), nowrap: false }
  );
}
