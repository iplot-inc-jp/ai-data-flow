// アップロードされたファイルを指定文字コードで UTF-8 文字列にデコードするヘルパー。
//
// Backlog の課題 CSV は環境により UTF-8 / Shift_JIS（CP932）どちらでも出力される。
// ブラウザの TextDecoder は 'shift_jis' / 'utf-8' を標準サポートするため、
// ArrayBuffer を読み込んでから指定エンコーディングでデコードする。

/** 選択可能な文字コード。 */
export type SupportedEncoding = 'auto' | 'utf-8' | 'shift_jis';

/** 文字コード選択肢（UI のラジオ/セレクト描画用）。 */
export const ENCODING_OPTIONS: { value: SupportedEncoding; label: string }[] = [
  { value: 'auto', label: '自動判定' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'shift_jis', label: 'Shift_JIS' },
];

/**
 * UTF-8 として妥当か（不正バイトで置換文字 U+FFFD が混入しないか）を厳格モードで判定する。
 * Shift_JIS のテキストはほぼ確実に不正な UTF-8 シーケンスを含むため、これで弾ける。
 */
function isValidUtf8(buffer: ArrayBuffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * ArrayBuffer を文字列にデコードする。
 * - 'utf-8' / 'shift_jis' は指定どおりデコード。
 * - 'auto' は UTF-8（厳格）で通れば UTF-8、ダメなら Shift_JIS にフォールバック。
 */
export function decodeBuffer(
  buffer: ArrayBuffer,
  encoding: SupportedEncoding,
): string {
  if (encoding === 'auto') {
    const enc = isValidUtf8(buffer) ? 'utf-8' : 'shift_jis';
    return new TextDecoder(enc).decode(buffer);
  }
  return new TextDecoder(encoding).decode(buffer);
}

/** File を指定文字コードで読み込み UTF-8 文字列にして返す。 */
export async function readFileAsText(
  file: File,
  encoding: SupportedEncoding,
): Promise<string> {
  const buffer = await file.arrayBuffer();
  return decodeBuffer(buffer, encoding);
}
