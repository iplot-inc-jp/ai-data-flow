import { lookup } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';

/**
 * SSRF 対策: 外部送信（Webhook 等）の宛先 URL を検証する共有ヘルパ。
 *
 * 攻撃面: 任意のプロジェクト管理者が targetUrl をクラウドメタデータ
 * (169.254.169.254 / metadata.google.internal) や内部サービス
 * (localhost / 10.x / 192.168.x / ::1 等) に向けると、サーバが内部宛に
 * リクエストを発火し、応答本文がエラーログ経由で読める半ブラインド SSRF になる。
 *
 * 方針:
 *   - スキームは http / https のみ許可（file:/gopher: 等は拒否）。
 *   - ホスト名を DNS 解決し、解決後の全 IP が private/loopback/link-local/
 *     unique-local/メタデータ宛でないことを検証する（A/AAAA 両方）。
 *   - 既知メタデータホスト名も名前で拒否（解決前の早期防御）。
 *
 * 実配信直前（fetch 直前）に再検証することで TOCTOU（DNS リバインディング）も緩和する。
 * 併せて fetch は redirect:'manual' とし、リダイレクト先の再検証を呼び出し側に強制する。
 */

/** プライベート/特殊用途な IPv4 レンジ（CIDR）。 */
function buildV4BlockList(): BlockList {
  const bl = new BlockList();
  bl.addSubnet('0.0.0.0', 8, 'ipv4'); // "this host"
  bl.addSubnet('10.0.0.0', 8, 'ipv4'); // private
  bl.addSubnet('100.64.0.0', 10, 'ipv4'); // CGNAT
  bl.addSubnet('127.0.0.0', 8, 'ipv4'); // loopback
  bl.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local（AWS/GCP/Azure メタデータ含む）
  bl.addSubnet('172.16.0.0', 12, 'ipv4'); // private
  bl.addSubnet('192.0.0.0', 24, 'ipv4'); // IETF protocol assignments
  bl.addSubnet('192.0.2.0', 24, 'ipv4'); // TEST-NET-1
  bl.addSubnet('192.168.0.0', 16, 'ipv4'); // private
  bl.addSubnet('198.18.0.0', 15, 'ipv4'); // benchmarking
  bl.addSubnet('198.51.100.0', 24, 'ipv4'); // TEST-NET-2
  bl.addSubnet('203.0.113.0', 24, 'ipv4'); // TEST-NET-3
  bl.addSubnet('224.0.0.0', 4, 'ipv4'); // multicast
  bl.addSubnet('240.0.0.0', 4, 'ipv4'); // reserved
  return bl;
}

/** プライベート/特殊用途な IPv6 レンジ（CIDR）。 */
function buildV6BlockList(): BlockList {
  const bl = new BlockList();
  bl.addAddress('::1', 'ipv6'); // loopback
  bl.addAddress('::', 'ipv6'); // unspecified
  bl.addSubnet('fc00::', 7, 'ipv6'); // unique local
  bl.addSubnet('fe80::', 10, 'ipv6'); // link-local
  bl.addSubnet('ff00::', 8, 'ipv6'); // multicast
  return bl;
}

const V4_BLOCK = buildV4BlockList();
const V6_BLOCK = buildV6BlockList();

/** 既知のメタデータホスト名（名前ベースの早期拒否）。 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

/**
 * IPv4-mapped IPv6（::ffff:a.b.c.d / ::ffff:hhhh:hhhh）から埋め込み IPv4 を取り出す。
 * mapped でなければ null。URL.hostname は a.b.c.d を hhhh:hhhh の16進へ正規化するため
 * 両表記を受ける（::ffff:169.254.169.254 / ::ffff:a9fe:a9fe）。
 */
function extractMappedV4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && isIP(dotted[1]) === 4) {
    return dotted[1];
  }
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    const v4 = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.');
    if (isIP(v4) === 4) return v4;
  }
  return null;
}

/**
 * 解決済み IP（文字列）が拒否対象かを判定する。
 * IPv4-mapped IPv6（::ffff:a.b.c.d / ::ffff:a9fe:a9fe）は埋め込み IPv4 として評価する。
 */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return V4_BLOCK.check(ip, 'ipv4');
  }
  if (family === 6) {
    // IPv4-mapped IPv6 を IPv4 として再判定（::ffff:169.254.169.254 等の回避防止）
    const mappedV4 = extractMappedV4(ip);
    if (mappedV4) {
      return V4_BLOCK.check(mappedV4, 'ipv4');
    }
    return V6_BLOCK.check(ip, 'ipv6');
  }
  // 判定不能（パース不可）な IP は安全側で拒否
  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * 送信先 URL を検証する。問題があれば UnsafeUrlError を throw する。
 *
 * - http/https 限定
 * - ホスト名/解決後 IP が private/loopback/link-local/メタデータ宛でない
 *
 * リテラル IP がホストに直書きされている場合は DNS を引かず即判定する。
 */
export async function assertSafeOutboundUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`不正なURLです: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(
      `許可されていないスキームです（http/https のみ可）: ${url.protocol}`,
    );
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new UnsafeUrlError(`送信先ホストが許可されていません: ${hostname}`);
  }

  // ホストがリテラル IP ならそのまま判定（DNS 不要）
  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (isBlockedIp(hostname)) {
      throw new UnsafeUrlError(
        `内部/予約済みアドレスへの送信は許可されていません: ${hostname}`,
      );
    }
    return url;
  }

  // ホスト名を解決し、全解決アドレスを検証（A/AAAA 両方）
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch (e) {
    throw new UnsafeUrlError(
      `送信先ホスト名を解決できませんでした: ${hostname} (${(e as Error)?.message ?? String(e)})`,
    );
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError(`送信先ホスト名を解決できませんでした: ${hostname}`);
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new UnsafeUrlError(
        `内部/予約済みアドレスへの送信は許可されていません: ${hostname} -> ${address}`,
      );
    }
  }

  return url;
}
