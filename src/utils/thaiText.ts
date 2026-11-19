/**
 * Thai Text Segmentation & Phrase Integrity Helper
 * Uses Intl.Segmenter('th') when available to insert zero-width space (\u200B)
 * strictly between Thai words so phrases never break mid-syllable on narrow viewports.
 */

const PROTECTED_THAI_PHRASES = [
  'บริษัท ใจกล้า ดิจิตอล จำกัด',
  'หนังสือรับรองการหักภาษี ณ ที่จ่าย',
  'ระบบออกเอกสารบัญชี',
  'งบประมาณบริษัท',
  'งบประมาณและภาษี',
  'ลูกค้าและวิเคราะห์',
  'ซัพพลายเยอร์และเทียบราคา',
  'รายจ่ายและ 50 ทวิ',
  'ตั้งค่าระบบและภาษี',
  'คลังข้อมูลและพื้นที่',
  'ภาษีมูลค่าเพิ่ม',
  'หัก ณ ที่จ่าย',
  'ใบเสนอราคา',
  'ใบแจ้งหนี้',
  'ใบวางบิล',
  'ใบเสร็จรับเงิน',
  'สำนักงานใหญ่',
  'เลขประจำตัวผู้เสียภาษี',
];

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
      // Keep Thai conjunction "และ" attached to the following word so it never orphans at line end
      if (seg.segment === 'และ') {
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
