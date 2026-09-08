/**
 * Decode CSV bytes: UTF-8 when valid, otherwise Windows-1252 (what Excel's
 * plain "CSV (Comma delimited)" export produces on Windows).
 *
 * Node's TextDecoder('windows-1252') decodes 0x80–0x9F as C1 controls rather
 * than the printable Windows-1252 characters ("…", "£" is fine, but "…", "–",
 * "—", "‘", "’", "“", "”" all live in this range), so map them ourselves.
 */
const CP1252_HIGH: readonly string[] = [
  '€', '', '‚', 'ƒ', '„', '…', '†', '‡',
  'ˆ', '‰', 'Š', '‹', 'Œ', '', 'Ž', '',
  '', '‘', '’', '“', '”', '•', '–', '—',
  '˜', '™', 'š', '›', 'œ', '', 'ž', 'Ÿ',
];

export function decodeWindows1252(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80]! : String.fromCharCode(b);
  }
  return out;
}

export interface DecodedCsv {
  text: string;
  /** True when the bytes were not valid UTF-8 and Windows-1252 was used instead. */
  fellBack: boolean;
}

export function decodeCsv(bytes: Uint8Array): DecodedCsv {
  let text: string;
  let fellBack = false;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = decodeWindows1252(bytes);
    fellBack = true;
  }
  return { text: text.replace(/^\uFEFF/, ''), fellBack };
}
