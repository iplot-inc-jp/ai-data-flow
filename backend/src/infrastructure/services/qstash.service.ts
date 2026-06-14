import { Injectable, Logger } from '@nestjs/common';
import { Client, Receiver } from '@upstash/qstash';

/**
 * Upstash QStash（push型トランスポート）のラッパー。
 *
 * 役割は2つ:
 *   1. publish … 起票したジョブを QStash に投げ、QStash が `${PUBLIC_BASE_URL}/api/jobs/run`
 *      を POST で叩いてワーカー実行を駆動する（at-least-once 配信・自動リトライ）。
 *   2. verify  … ワーカー受信時に Upstash-Signature を検証し、正規の QStash 配信のみ許可する。
 *
 * 本番(Vercel等)には QSTASH_TOKEN / QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY /
 * PUBLIC_BASE_URL が設定される想定。ローカルにはこれらが無いので、
 *   - publishEnabled=false → JobService は inline 実行にフォールバックする
 *   - verifierEnabled=false → /api/jobs/run は本番のみ署名必須（ローカルでは inline 実行のため未使用）
 * という非破壊設計にする。
 */
@Injectable()
export class QStashService {
  private readonly logger = new Logger(QStashService.name);

  /** publish 可能か（QSTASH_TOKEN と PUBLIC_BASE_URL の両方が必要） */
  readonly publishEnabled: boolean;
  /** 署名検証可能か（QSTASH_CURRENT_SIGNING_KEY があるか） */
  readonly verifierEnabled: boolean;

  private readonly client?: Client;
  private readonly receiver?: Receiver;
  private readonly baseUrl?: string;

  constructor() {
    const token = process.env.QSTASH_TOKEN;
    this.baseUrl = process.env.PUBLIC_BASE_URL;
    this.publishEnabled = !!(token && this.baseUrl);
    if (this.publishEnabled) {
      this.client = new Client({ token: token as string });
    }

    const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
    const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
    this.verifierEnabled = !!currentSigningKey;
    if (this.verifierEnabled) {
      this.receiver = new Receiver({
        currentSigningKey: currentSigningKey as string,
        nextSigningKey: nextSigningKey as string,
      });
    }
  }

  /** ワーカーエンドポイントの絶対URL（署名検証 url にも使う）。 */
  runUrl(): string {
    // PUBLIC_BASE_URL は /api を含まない想定（例: https://brain-pro-api.vercel.app）。
    return `${this.baseUrl}/api/jobs/run`;
  }

  /**
   * ジョブの実行を QStash に依頼する（QStash → POST /api/jobs/run {jobId}）。
   * publishEnabled でない時は呼ばれない設計（JobService 側で分岐）。
   *
   * publish に失敗しても起票APIは落とさない（例外は握ってログのみ）。
   * その場合、対象 job は QUEUED のまま DB に残る。後続の手動再実行
   * （管理運用での再 publish や、QStash schedule とは別の retry 経路）で拾える。
   */
  async publishJob(jobId: string): Promise<void> {
    if (!this.publishEnabled || !this.client) {
      // 呼ばれない想定だが、防御的に no-op。
      return;
    }
    try {
      await this.client.publishJSON({
        url: this.runUrl(),
        body: { jobId },
        retries: 3,
      });
    } catch (err) {
      // publish 失敗 ＝ 起票APIは成功させ、job は QUEUED のまま残す。
      this.logger.error(
        `QStash publish failed for job ${jobId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Upstash-Signature を検証する。
   * @param signature Upstash-Signature ヘッダ
   * @param rawBody   生のリクエストボディ文字列（署名対象なので加工前のもの）
   * @param url       受信エンドポイントの絶対URL
   * @returns 検証OKなら true。verifierEnabled でない/例外時は false。
   */
  async verify(
    signature: string,
    rawBody: string,
    url: string,
  ): Promise<boolean> {
    if (!this.verifierEnabled || !this.receiver) {
      return false;
    }
    try {
      return await this.receiver.verify({ signature, body: rawBody, url });
    } catch (err) {
      this.logger.warn(`QStash signature verify failed: ${(err as Error).message}`);
      return false;
    }
  }
}
