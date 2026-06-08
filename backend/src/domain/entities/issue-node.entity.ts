import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

/**
 * ノードの検証状態
 * - CONFIRMED: ○ 裏付けあり/確定
 * - REJECTED: × 否定/不支持
 * - UNKNOWN: △ データで言えない
 * - NEEDS_HEARING: 【未確認/要ヒアリング】
 * - NA: 検証対象外（SOLUTION型など）
 */
export type NodeVerification =
  | 'CONFIRMED'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'NEEDS_HEARING'
  | 'NA';

/**
 * ノードの推奨アクション
 * - ADOPT: 採用
 * - HOLD: 保留
 * - REJECT: 不採用
 * - NA: 対象外
 */
export type NodeRecommendation = 'ADOPT' | 'HOLD' | 'REJECT' | 'NA';

/**
 * ノードの種別
 * - ISSUE: 課題/ゴール/対象（汎用ルート）
 * - CAUSE: 原因（なぜ）
 * - COUNTERMEASURE: 打ち手（互換: OPTION相当）
 * - POINT: 論点（疑問形・再帰）
 * - HYPOTHESIS: 仮説
 * - VERIFICATION: 検証アクション
 * - RESULT: 検証結果
 * - ELEMENT: 構成要素（What）
 * - OPTION: 解決候補（How）
 * - ACTION: 行動（MECEアクション）
 * - METRIC: KPI（数値）
 */
export type IssueNodeKind =
  | 'ISSUE'
  | 'CAUSE'
  | 'COUNTERMEASURE'
  | 'POINT'
  | 'HYPOTHESIS'
  | 'VERIFICATION'
  | 'RESULT'
  | 'ELEMENT'
  | 'OPTION'
  | 'ACTION'
  | 'METRIC';

export interface CreateIssueNodeProps {
  treeId: string;
  parentId?: string | null;
  depth?: number;
  order?: number;
  label: string;
  kind?: IssueNodeKind;
  verification?: NodeVerification;
  recommendation?: NodeRecommendation;
  evidence?: string | null;
  rootCauseNodeId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReconstructIssueNodeProps {
  id: string;
  treeId: string;
  parentId: string | null;
  depth: number;
  order: number;
  label: string;
  kind: IssueNodeKind;
  verification: NodeVerification;
  recommendation: NodeRecommendation;
  evidence: string | null;
  rootCauseNodeId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * イシューノードエンティティ（階層構造: parentId / depth / order）
 */
export class IssueNode extends BaseEntity {
  private readonly _treeId: string;
  private _parentId: string | null;
  private _depth: number;
  private _order: number;
  private _label: string;
  private _kind: IssueNodeKind;
  private _verification: NodeVerification;
  private _recommendation: NodeRecommendation;
  private _evidence: string | null;
  private _rootCauseNodeId: string | null;
  private _metadata: Record<string, unknown>;

  private constructor(
    id: string,
    treeId: string,
    parentId: string | null,
    depth: number,
    order: number,
    label: string,
    kind: IssueNodeKind,
    verification: NodeVerification,
    recommendation: NodeRecommendation,
    evidence: string | null,
    rootCauseNodeId: string | null,
    metadata: Record<string, unknown>,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._treeId = treeId;
    this._parentId = parentId;
    this._depth = depth;
    this._order = order;
    this._label = label;
    this._kind = kind;
    this._verification = verification;
    this._recommendation = recommendation;
    this._evidence = evidence;
    this._rootCauseNodeId = rootCauseNodeId;
    this._metadata = metadata;
  }

  /**
   * 新規イシューノード作成
   */
  static create(props: CreateIssueNodeProps, id: string): IssueNode {
    if (!props.treeId) {
      throw new ValidationError('Tree ID is required');
    }

    const label = props.label?.trim();
    if (!label || label.length < 1) {
      throw new ValidationError('Issue node label is required');
    }

    const now = new Date();
    return new IssueNode(
      id,
      props.treeId,
      props.parentId ?? null,
      props.depth ?? (props.parentId ? 1 : 0),
      props.order ?? 0,
      label,
      props.kind ?? 'ISSUE',
      props.verification ?? 'NA',
      props.recommendation ?? 'NA',
      props.evidence?.trim() || null,
      props.rootCauseNodeId ?? null,
      props.metadata ?? {},
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructIssueNodeProps): IssueNode {
    return new IssueNode(
      props.id,
      props.treeId,
      props.parentId,
      props.depth,
      props.order,
      props.label,
      props.kind,
      props.verification,
      props.recommendation,
      props.evidence,
      props.rootCauseNodeId,
      props.metadata,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  setKind(kind: IssueNodeKind): void {
    this._kind = kind;
    this.touch();
  }

  setVerification(verification: NodeVerification): void {
    this._verification = verification;
    this.touch();
  }

  setRecommendation(recommendation: NodeRecommendation): void {
    this._recommendation = recommendation;
    this.touch();
  }

  updateLabel(label: string): void {
    const trimmed = label?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new ValidationError('Issue node label is required');
    }
    this._label = trimmed;
    this.touch();
  }

  updateEvidence(evidence: string | null): void {
    this._evidence = evidence?.trim() || null;
    this.touch();
  }

  reparent(parentId: string | null, depth: number): void {
    this._parentId = parentId;
    this._depth = depth;
    this.touch();
  }

  reorder(order: number): void {
    this._order = order;
    this.touch();
  }

  setRootCauseNodeId(rootCauseNodeId: string | null): void {
    this._rootCauseNodeId = rootCauseNodeId;
    this.touch();
  }

  updateMetadata(metadata: Record<string, unknown>): void {
    this._metadata = metadata;
    this.touch();
  }

  // ========== Getter ==========

  get treeId(): string {
    return this._treeId;
  }

  get parentId(): string | null {
    return this._parentId;
  }

  get depth(): number {
    return this._depth;
  }

  get order(): number {
    return this._order;
  }

  get label(): string {
    return this._label;
  }

  get kind(): IssueNodeKind {
    return this._kind;
  }

  get verification(): NodeVerification {
    return this._verification;
  }

  get recommendation(): NodeRecommendation {
    return this._recommendation;
  }

  get evidence(): string | null {
    return this._evidence;
  }

  get rootCauseNodeId(): string | null {
    return this._rootCauseNodeId;
  }

  get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }

  get isRoot(): boolean {
    return this._parentId === null;
  }
}
