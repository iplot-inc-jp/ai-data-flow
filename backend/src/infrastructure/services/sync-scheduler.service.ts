import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { SyncService } from './sync.service';

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
  ) {}

  // 毎時 0,5,10,... 分に実行（秒指定の6フィールド cron）。
  @Cron('0 */5 * * * *')
  async handleAutoSync(): Promise<void> {
    const connections = await this.prisma.githubConnection.findMany({
      where: { autoSync: true },
    });

    const now = Date.now();
    for (const connection of connections) {
      try {
        const intervalMs = (connection.syncIntervalMinutes || 30) * 60_000;
        const due =
          !connection.lastSyncedAt ||
          now - connection.lastSyncedAt.getTime() >= intervalMs;
        if (!due) continue;

        const apiKey = await this.resolveApiKey(connection.projectId);
        if (!apiKey) {
          this.logger.warn(
            `Skipping auto-sync for connection ${connection.id}: no Anthropic API key resolved.`,
          );
          continue;
        }

        this.logger.log(
          `Auto-sync starting for connection ${connection.id} (${connection.repoFullName}).`,
        );
        await this.syncService.runSync(connection.id, 'AUTO', apiKey);
      } catch (err) {
        this.logger.error(
          `Auto-sync error for connection ${connection.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * APIキー解決:
   *   process.env.ANTHROPIC_API_KEY を優先。
   *   無ければ project → organization の OWNER メンバーの UserSetting.anthropicApiKey。
   */
  private async resolveApiKey(projectId: string): Promise<string | null> {
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (envKey) return envKey;

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) return null;

    const owner = await this.prisma.organizationMember.findFirst({
      where: { organizationId: project.organizationId, role: 'OWNER' },
      select: { userId: true },
    });
    if (!owner) return null;

    const setting = await this.prisma.userSetting.findUnique({
      where: { userId: owner.userId },
      select: { anthropicApiKey: true },
    });
    return setting?.anthropicApiKey ?? null;
  }
}
