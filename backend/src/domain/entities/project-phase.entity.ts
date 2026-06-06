import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

/**
 * フェーズ種別（Ph.0〜7 パイプライン）
 * Prisma enum PhaseKind の文字列値と完全一致させる
 */
export type PhaseKind =
  | 'BACKGROUND' // Ph.0 構想・背景理解
  | 'ASIS_DATA' // Ph.1 現状把握（データ）
  | 'HEARING' // Ph.2 現状把握（ヒアリング）
  | 'ISSUE_ANALYSIS' // Ph.3 課題構造化（イシューツリー）
  | 'TOBE' // Ph.4 TOBE設計
  | 'PROPOSAL' // Ph.5 提案・合意形成
  | 'REQUIREMENTS' // Ph.6 要件定義
  | 'EXECUTION'; // Ph.7 推進・実行管理＋動作確認

/**
 * フェーズの状態
 * Prisma enum PhaseStatus の文字列値と完全一致させる
 */
export type PhaseStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'APPROVED'
  | 'DONE';

/**
 * カノニカルなフェーズ順序（Ph.0〜7）
 * order のデフォルト値はこの配列のインデックスを用いる
 */
export const PHASE_KIND_ORDER: PhaseKind[] = [
  'BACKGROUND',
  'ASIS_DATA',
  'HEARING',
  'ISSUE_ANALYSIS',
  'TOBE',
  'PROPOSAL',
  'REQUIREMENTS',
  'EXECUTION',
];

export interface CreateProjectPhaseProps {
  projectId: string;
  kind: PhaseKind;
  order?: number;
  status?: PhaseStatus;
  summary?: string | null;
  detail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReconstructProjectPhaseProps {
  id: string;
  projectId: string;
  kind: PhaseKind;
  order: number;
  status: PhaseStatus;
  summary: string | null;
  detail: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * プロジェクトフェーズエンティティ
 */
export class ProjectPhase extends BaseEntity {
  private readonly _projectId: string;
  private readonly _kind: PhaseKind;
  private _order: number;
  private _status: PhaseStatus;
  private _summary: string | null;
  private _detail: string | null;
  private _metadata: Record<string, unknown>;

  private constructor(
    id: string,
    projectId: string,
    kind: PhaseKind,
    order: number,
    status: PhaseStatus,
    summary: string | null,
    detail: string | null,
    metadata: Record<string, unknown>,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._kind = kind;
    this._order = order;
    this._status = status;
    this._summary = summary;
    this._detail = detail;
    this._metadata = metadata;
  }

  /**
   * 新規フェーズ作成
   * order のデフォルトは kind のカノニカルインデックス、status は 'NOT_STARTED'
   */
  static create(props: CreateProjectPhaseProps, id: string): ProjectPhase {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const canonicalIndex = PHASE_KIND_ORDER.indexOf(props.kind);
    if (canonicalIndex === -1) {
      throw new ValidationError(`Invalid phase kind: ${props.kind}`);
    }

    const order = props.order ?? canonicalIndex;
    if (!Number.isInteger(order) || order < 0) {
      throw new ValidationError('Phase order must be a non-negative integer');
    }

    const status: PhaseStatus = props.status ?? 'NOT_STARTED';
    const summary = props.summary?.trim() || null;
    const detail = props.detail?.trim() || null;
    const metadata = props.metadata ?? {};

    const now = new Date();
    return new ProjectPhase(
      id,
      props.projectId,
      props.kind,
      order,
      status,
      summary,
      detail,
      metadata,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructProjectPhaseProps): ProjectPhase {
    return new ProjectPhase(
      props.id,
      props.projectId,
      props.kind,
      props.order,
      props.status,
      props.summary,
      props.detail,
      props.metadata ?? {},
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  /**
   * 状態遷移
   */
  transitionTo(status: PhaseStatus): void {
    this._status = status;
    this.touch();
  }

  /**
   * サマリ更新
   */
  updateSummary(summary: string | null): void {
    this._summary = summary?.trim() || null;
    this.touch();
  }

  /**
   * 詳細更新
   */
  updateDetail(detail: string | null): void {
    this._detail = detail?.trim() || null;
    this.touch();
  }

  /**
   * メタデータ更新
   */
  updateMetadata(metadata: Record<string, unknown>): void {
    this._metadata = metadata ?? {};
    this.touch();
  }

  /**
   * 並び順変更
   */
  reorder(order: number): void {
    if (!Number.isInteger(order) || order < 0) {
      throw new ValidationError('Phase order must be a non-negative integer');
    }
    this._order = order;
    this.touch();
  }

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get kind(): PhaseKind {
    return this._kind;
  }

  get order(): number {
    return this._order;
  }

  get status(): PhaseStatus {
    return this._status;
  }

  get summary(): string | null {
    return this._summary;
  }

  get detail(): string | null {
    return this._detail;
  }

  get metadata(): Record<string, unknown> {
    return this._metadata;
  }
}
