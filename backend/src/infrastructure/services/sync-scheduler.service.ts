import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { SyncService } from './sync.service';
import { CompanyKeyService } from './company-key.service';

/**
 * autoSync が有効な GithubConnection を定期的に同期するスケジューラ。
 * 5分ごとに走り、各コネクションの syncIntervalMinutes を尊重して間引く。
 */
@Injectable()
export class SyncSchedulerService {
  private readonly logger = new Logger(SyncSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: SyncService,
    private readonly companyKeyService: CompanyKeyService,
  ) {}

  // 毎時 0,5,10,... 分に実行（秒指定の6フィールド cron）。ローカル/常駐サーバ専用。
  @Cron('0 */5 * * * *')
  async handleAutoSync(): Promise<void> {
    // Vercel Functions（serverless）ではプロセスが常駐せず @Cron は発火しない。
    // 本番は QStash の定期スケジュール → GET /api/cron/auto-sync（CronController）→ runAutoSync() で駆動する。
    if (process.env.VERCEL) {
      return;
    }
    await this.runAutoSync();
  }

  /**
   * autoSync 有効な GithubConnection を、各コネクションの syncIntervalMinutes を尊重して同期する本体。
   * ローカルは @Cron から、本番(Vercel)は CronController（QStash 経由）から呼ばれる。
   * @returns 検査件数 / 実同期件数 / スキップ件数
   */
  async runAutoSync(): Promise<{
    checked: number;
    synced: number;
    skipped: number;
  }> {
    const connections = await this.prisma.githubConnection.findMany({
      where: { autoSync: true },
    });

    const now = Date.now();
    let synced = 0;
    let skipped = 0;
    for (const connection of connections) {
      try {
        const intervalMs = (connection.syncIntervalMinutes || 30) * 60_000;
        const due =
          !connection.lastSyncedAt ||
          now - connection.lastSyncedAt.getTime() >= intervalMs;
        if (!due) {
          skipped++;
          continue;
        }

        // 会社(Organization)キー → ユーザーキー → 環境変数。AUTO のため userId なし。
        const apiKey = await this.companyKeyService.resolveForProject(
          connection.projectId,
        );
        if (!apiKey) {
          this.logger.warn(
            `Skipping auto-sync for connection ${connection.id}: no Anthropic API key resolved.`,
          );
          skipped++;
          continue;
        }

        this.logger.log(
          `Auto-sync starting for connection ${connection.id} (${connection.repoFullName}).`,
        );
        await this.syncService.runSync(connection.id, 'AUTO', apiKey);
        synced++;
      } catch (err) {
        this.logger.error(
          `Auto-sync error for connection ${connection.id}: ${(err as Error).message}`,
        );
      }
    }
    return { checked: connections.length, synced, skipped };
  }
}
