import { Injectable, Logger } from '@nestjs/common';
import { BackgroundJob, Prisma } from '@prisma/client';
import { PrismaService } from '../persistence/prisma/prisma.service';
import { QStashService } from './qstash.service';
import { CompanyKeyService } from './company-key.service';
import { ClaudeService } from './claude.service';
import { ImportMermaidUseCase } from '../../application/use-cases/data-object/import-mermaid.use-case';
import { GenerateKpisUseCase } from '../../application/use-cases/kpi/generate-kpis.use-case';

/**
 * 非同期バックグラウンドジョブの起票・実行サービス。
 *
 * トランスポートは Upstash QStash（push型）:
 *   起票 → QStash publish → QStash が POST /api/jobs/run {jobId} を叩く → runJob(id)。
 * QStash env が無いローカルでは inline fallback（enqueue 内で await runJob）し、
 * dev でも全機能が完結するようにする。
 *
 * 冪等性: QStash は at-least-once 配信のため、runJob は QUEUED→RUNNING の遷移を
 * 条件付き updateMany で原子的に行い、遷移を勝ち取った呼び出し（count===1）だけが
 * 実行する（同一 jobId が並行到達しても二重 dispatch しない）。
 * 一過性失敗時は QUEUED へ戻して QStash の自動リトライ(retries:3)に委ね、
 * 試行回数(MAX_ATTEMPTS)を使い切ったら FAILED で確定する。
 *
 * 秘匿情報（APIキー等）は payload に入れない。鍵は実行時に CompanyKeyService で解決する。
 */
@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qstash: QStashService,
    private readonly companyKey: CompanyKeyService,
    private readonly claude: ClaudeService,
    private readonly importMermaid: ImportMermaidUseCase,
    private readonly generateKpis: GenerateKpisUseCase,
  ) {}

  /**
   * ジョブを QUEUED で起票する。
   *   - QStash が使えるなら publish して QUEUED の job を即返す（実際の実行は別プロセス）。
   *   - 使えない（ローカル）なら await runJob で完了させ、完了 job を返す（inline fallback）。
   */
  async enqueue(
    type: string,
    payload: Record<string, unknown> | undefined,
    opts: { projectId?: string | null; createdById?: string | null } = {},
  ): Promise<BackgroundJob> {
    const job = await this.prisma.backgroundJob.create({
      data: {
        type,
        status: 'QUEUED',
        payload: (payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        projectId: opts.projectId ?? null,
        createdById: opts.createdById ?? null,
      },
    });

    if (this.qstash.publishEnabled) {
      // 本番: QStash に実行を委譲。publish 失敗時も例外は握られ、QUEUED のまま残る。
      await this.qstash.publishJob(job.id);
      return job;
    }

    // ローカル/QStash無: その場で実行して完了 job を返す。
    return this.runJob(job.id);
  }

  /**
   * 1ジョブあたりの最大試行回数。
   * QStash の publishJob(retries:3) と整合させ「初回 + リトライ3回 = 4」とする。
   * これ未満の attempts で失敗した場合のみ、ワーカー経路では再試行のために QUEUED へ戻す。
   */
  static readonly MAX_ATTEMPTS = 4;

  /**
   * ジョブ本体を実行する。
   * QStash ワーカー(POST /api/jobs/run)と inline fallback の両方から呼ばれる。
   *
   * 冪等: status!=QUEUED ならスキップ（at-least-once の二重実行防止）。
   *
   * @param opts.throwOnFailure
   *   true（QStash ワーカー経路）: dispatch が一過性エラーで失敗し、かつ試行回数が
   *   MAX_ATTEMPTS 未満なら、job を QUEUED に戻したうえで例外を再 throw する。
   *   これによりワーカーは非2xx を返し、QStash の自動リトライ(retries:3)が発火する。
   *   QUEUED に戻すのは、FAILED のままだと runJob の冪等ガードが再配信をスキップしてしまい、
   *   リトライ経路が成立しないため（= 再試行可能状態に保つ）。
   *   試行回数を使い切った場合は FAILED で確定し、throw せず返す（QStash はリトライを止める）。
   *
   *   false（inline fallback）: 失敗しても FAILED の job を返すだけで throw しない
   *   （enqueue の戻り値契約・フロントのポーリング前提を変えない）。
   */
  async runJob(
    id: string,
    opts: { throwOnFailure?: boolean } = {},
  ): Promise<BackgroundJob> {
    const job = await this.prisma.backgroundJob.findUnique({ where: { id } });
    if (!job) {
      this.logger.warn(`runJob: job ${id} not found`);
      throw new Error(`Job ${id} not found`);
    }
    if (job.status !== 'QUEUED') {
      // すでに実行中/完了/失敗 → 二重配信なのでスキップして現状を返す。
      this.logger.log(`runJob: job ${id} is ${job.status}, skipping (idempotent)`);
      return job;
    }

    // RUNNING へ遷移（startedAt 記録）。
    // 冪等性の要: check-then-act を非アトミックにすると TOCTOU レース
    // （QStash の at-least-once 配信＋retries で同一 jobId が並行到達した場合、
    //  上の findUnique では両者とも QUEUED を読みうる）で二重 dispatch されるため、
    //  QUEUED→RUNNING の遷移を条件付き updateMany で原子的に行い、
    //  count===1（＝この呼び出しが遷移を勝ち取った）時だけ実行する。
    const claimed = await this.prisma.backgroundJob.updateMany({
      where: { id, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date(), progress: 10 },
    });
    if (claimed.count !== 1) {
      // 別の並行実行が先に QUEUED→RUNNING を確定させた。二重 dispatch しない。
      const current = await this.prisma.backgroundJob.findUnique({ where: { id } });
      this.logger.log(
        `runJob: job ${id} already claimed (now ${current?.status ?? 'unknown'}), skipping (idempotent)`,
      );
      return current ?? job;
    }

    try {
      const result = await this.dispatch(job);
      return this.prisma.backgroundJob.update({
        where: { id },
        data: {
          status: 'SUCCEEDED',
          result: (result ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          progress: 100,
          error: null,
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      // この実行ぶんの試行回数（job は claim 前に読んだ値なので +1 する）。
      const attemptsAfter = job.attempts + 1;
      const canRetry = opts.throwOnFailure === true && attemptsAfter < JobService.MAX_ATTEMPTS;

      if (canRetry) {
        // 一過性エラーとして QStash に再試行させる: QUEUED へ戻し（再実行可能に保つ）、
        // attempts を記録したうえで例外を再 throw → ワーカーが非2xx を返す。
        this.logger.warn(
          `Job ${id} (${job.type}) failed (attempt ${attemptsAfter}/${JobService.MAX_ATTEMPTS}), requeueing for QStash retry: ${message}`,
        );
        await this.prisma.backgroundJob.update({
          where: { id },
          data: {
            status: 'QUEUED',
            error: message,
            attempts: { increment: 1 },
            progress: 0,
            startedAt: null,
          },
        });
        throw err instanceof Error ? err : new Error(message);
      }

      // リトライ不可（inline fallback、または試行回数を使い切った）→ FAILED で確定。
      this.logger.error(
        `Job ${id} (${job.type}) failed permanently (attempt ${attemptsAfter}): ${message}`,
      );
      return this.prisma.backgroundJob.update({
        where: { id },
        data: {
          status: 'FAILED',
          error: message,
          attempts: { increment: 1 },
          finishedAt: new Date(),
        },
      });
    }
  }

  /** ジョブ type を許可リスト（コントローラの起票検証に使う）。 */
  static readonly ALLOWED_TYPES = [
    'AI_MERMAID_OBJECTMAP',
    'AI_MERMAID_FLOW',
    'AI_KPI',
    'AI_ISSUE_SUGGEST',
  ] as const;

  static isAllowedType(type: string): boolean {
    return (JobService.ALLOWED_TYPES as readonly string[]).includes(type);
  }

  /**
   * type ごとの実処理。result（JSON化可能な構造）を返す。
   *
   * 実装方針:
   *   - 永続まで配線が軽いものは use-case を呼び永続する（AI_MERMAID_OBJECTMAP / AI_KPI）。
   *   - 永続配線が重いものは ClaudeService の parse 結果（構造化JSON）を result に返す
   *     compute ジョブとし、クライアントが既存の同期エンドポイントで適用する
   *     （AI_MERMAID_FLOW / AI_ISSUE_SUGGEST）。
   */
  private async dispatch(job: BackgroundJob): Promise<unknown> {
    const payload = (job.payload ?? {}) as Record<string, unknown>;

    switch (job.type) {
      // ===== 永続ジョブ（use-case 経由） =====
      case 'AI_MERMAID_OBJECTMAP': {
        // 必須実装: Mermaid → オブジェクトマップ parse + 永続。
        const projectId = this.requireString(job.projectId, 'projectId');
        const userId = this.requireString(job.createdById, 'createdById');
        const mermaid = this.requireString(payload.mermaid, 'payload.mermaid');
        const graph = await this.importMermaid.execute({ userId, projectId, mermaid });
        return { kind: 'OBJECT_GRAPH', graph };
      }

      case 'AI_KPI': {
        // KPI 生成（DRAFT で永続）。use-case がクリーンに呼べるので永続まで実施。
        const projectId = this.requireString(job.projectId, 'projectId');
        const userId = this.requireString(job.createdById, 'createdById');
        const kpis = await this.generateKpis.execute({
          userId,
          projectId,
          category: this.requireString(payload.category, 'payload.category') as
            | 'BUSINESS'
            | 'AI_QUALITY',
          flowId: (payload.flowId as string | null) ?? null,
          systemId: (payload.systemId as string | null) ?? null,
          informationTypeIds: Array.isArray(payload.informationTypeIds)
            ? (payload.informationTypeIds as string[])
            : [],
          instructions: (payload.instructions as string | null) ?? null,
          count: typeof payload.count === 'number' ? payload.count : undefined,
        });
        return { kind: 'KPIS', kpis };
      }

      // ===== compute ジョブ（parse 結果を result に返す。永続はクライアント側） =====
      case 'AI_MERMAID_FLOW': {
        const projectId = this.requireString(job.projectId, 'projectId');
        const mermaid = this.requireString(payload.mermaid, 'payload.mermaid');
        const apiKey = await this.resolveKey(projectId, job.createdById);
        const flow = await this.claude.parseMermaidToFlow(mermaid, apiKey);
        return { kind: 'MERMAID_FLOW', flow };
      }

      case 'AI_ISSUE_SUGGEST': {
        // payload に IssueNodeSuggestContext 相当を載せて compute する。
        // （ツリー/ノード文脈の構築はクライアント or 既存エンドポイント側で行う方針）
        const projectId = this.requireString(job.projectId, 'projectId');
        const apiKey = await this.resolveKey(projectId, job.createdById);
        const context = payload.context as Record<string, unknown> | undefined;
        if (!context) {
          throw new Error('payload.context が必要です（IssueNodeSuggestContext）');
        }
        const suggestions = await this.claude.suggestIssueNodes(
          {
            pattern: String(context.pattern ?? ''),
            treeName: String(context.treeName ?? ''),
            rootQuestion: (context.rootQuestion as string | null) ?? null,
            targetLabel: String(context.targetLabel ?? ''),
            targetKind: String(context.targetKind ?? ''),
            parentLabels: Array.isArray(context.parentLabels)
              ? (context.parentLabels as string[])
              : [],
            expectedKind: String(context.expectedKind ?? ''),
            expectedKindLabel: String(context.expectedKindLabel ?? ''),
            gapBusinessArea: (context.gapBusinessArea as string | null) ?? null,
            gapDescription: (context.gapDescription as string | null) ?? null,
            userContext: (context.userContext as string | null) ?? null,
            ideationMethodName: (context.ideationMethodName as string | null) ?? null,
            ideationLenses: Array.isArray(context.ideationLenses)
              ? (context.ideationLenses as string[])
              : null,
          },
          apiKey,
        );
        return { kind: 'ISSUE_SUGGESTIONS', suggestions };
      }

      default:
        throw new Error(`未知のジョブ種別です: ${job.type}`);
    }
  }

  /** 鍵を解決（無ければ分かりやすい error を throw → runJob で FAILED に記録）。 */
  private async resolveKey(
    projectId: string,
    userId: string | null,
  ): Promise<string> {
    const apiKey = await this.companyKey.resolveForProject(
      projectId,
      userId ?? undefined,
    );
    if (!apiKey) {
      throw new Error(
        'Anthropic APIキーが未設定です（会社設定・個人設定・環境変数のいずれにも見つかりません）',
      );
    }
    return apiKey;
  }

  private requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`${name} が必要です`);
    }
    return value;
  }
}
