const THAI_NUMS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const THAI_POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

function readNumberGroup(numStr: string): string {
  let result = '';
  const len = numStr.length;

  for (let i = 0; i < len; i++) {
    const digit = Number(numStr[i]);
    const pos = len - i - 1;

    if (digit === 0) continue;

    if (pos === 1 && digit === 1) {
      result += 'สิบ';
    } else if (pos === 1 && digit === 2) {
      result += 'ยี่สิบ';
    } else if (pos === 0 && digit === 1 && len > 1 && numStr[len - 2] !== '0') {
      result += 'เอ็ด';
    } else if (pos === 0 && digit === 1 && len > 1) {
      result += 'เอ็ด';
    } else {
      result += THAI_NUMS[digit] + THAI_POS[pos];
    }
  }
  return result;
}

function integerToThai(intStr: string): string {
  if (!intStr || Number(intStr) === 0) return 'ศูนย์';

  let remaining = intStr.replace(/^0+/, '') || '0';
  const chunks: string[] = [];

  while (remaining.length > 0) {
    const sliceStart = Math.max(0, remaining.length - 6);
    chunks.unshift(remaining.slice(sliceStart));
    remaining = remaining.slice(0, sliceStart);
  }

  return chunks
    .map((chunk, idx) => {
      const read = readNumberGroup(chunk);
      if (!read) return '';
      const suffix = idx < chunks.length - 1 ? 'ล้าน' : '';
      return read + suffix;
    })
    .join('');
}

export function bahtText(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return 'ศูนย์บาทถ้วน';
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const bahtRead = integerToThai(intPart);

  if (decPart === '00') {
    return `${bahtRead}บาทถ้วน`;
  }

  const satangRead = readNumberGroup(decPart);
  return `${bahtRead}บาท${satangRead}สตางค์`;
}
