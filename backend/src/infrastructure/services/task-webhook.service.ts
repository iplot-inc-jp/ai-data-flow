import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { JobService } from './job.service';

/**
 * タスクイベントの種別（Webhook.events に格納される購読キーと一致させる）。
 */
export type TaskWebhookEvent =
  | 'task.created'
  | 'task.updated'
  | 'task.status_changed'
  | 'task.deleted';

/**
 * Webhook で外部（ipro-kun 等）へ送るタスクのスナップショット。
 * use-case が TaskOutput 相当を渡す想定だが、削除イベントでは id 等の最小情報で足りる。
 * id / projectId 以外は任意（部分集合でも受ける）。
 */
export interface TaskWebhookSnapshot {
  id: string;
  projectId: string;
  parentId?: string | null;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeName?: string | null;
  assigneeRoleId?: string | null;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  category?: string | null;
  milestone?: string | null;
  progress?: number;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

/**
 * タスクイベントを購読中の Webhook へ配信するためのサービス。
 *
 * 役割は「対象 Webhook を選び、配信ジョブを 1 件ずつ起票する」ところまで。
 * 実際の HTTP POST（署名付き）は JobService.dispatch の `WEBHOOK_DELIVERY` 分岐が行う。
 * これにより配信は QStash の at-least-once + 自動リトライ + 試行記録（batch-jobs 管理画面）に
 * 乗り、失敗が可視化される。
 *
 * 設計上の注意:
 *   - 秘匿情報（署名シークレット）は payload に入れない。配信時に webhookId から復号して使う。
 *   - イベント配信が失敗しても元のタスク操作は失敗させない（best-effort）。
 */
@Injectable()
export class TaskWebhookService {
  private readonly logger = new Logger(TaskWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
  ) {}

  /**
   * 指定プロジェクトで当該イベントを購読中（active かつ events に含む）の Webhook を探し、
   * それぞれに配信ジョブ（WEBHOOK_DELIVERY）を起票する。
   *
   * best-effort: 例外は握ってログのみ（タスク操作のトランザクションを巻き込まない）。
   *
   * @param userId 起票ユーザ（任意・batch-jobs の作成者表示用）
   */
  async enqueueForEvent(
    projectId: string,
    event: TaskWebhookEvent,
    task: TaskWebhookSnapshot,
    userId?: string | null,
  ): Promise<void> {
    try {
      const webhooks = await this.prisma.webhook.findMany({
        where: { projectId, active: true },
        select: { id: true, events: true },
      });

      const targets = webhooks.filter((w) =>
        Array.isArray(w.events)
          ? (w.events as unknown[]).map(String).includes(event)
          : false,
      );

      if (targets.length === 0) return;

      const occurredAt = new Date().toISOString();
      for (const wh of targets) {
        // 1 Webhook = 1 ジョブ。失敗時の自動リトライ/履歴を Webhook 単位で持つ。
        await this.jobService.enqueue(
          'WEBHOOK_DELIVERY',
          {
            webhookId: wh.id,
            event,
            occurredAt,
            task: serializeTask(task),
          },
          { projectId, createdById: userId ?? null },
        );
      }
    } catch (err) {
      // 配信起票の失敗はタスク操作を巻き込まない（best-effort）。
      this.logger.warn(
        `Failed to enqueue webhook event ${event} for project ${projectId}: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
}

/** Date を ISO 文字列へ正規化して JSON 化可能なスナップショットにする。 */
function serializeTask(
  task: TaskWebhookSnapshot,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(task)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
