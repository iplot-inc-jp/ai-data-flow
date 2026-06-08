import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

/**
 * イシューツリーの型（旧・互換用）
 * - WHY: なぜ型（調査・原因究明）
 * - SOLUTION: 打ち手型（How・MECEアクション）
 */
export type IssueTreeType = 'WHY' | 'SOLUTION';

/**
 * ツリーパターン（作成時に選ぶテンプレ）
 * - ISSUE_POINT: イシューツリー（論点・調査）
 * - WHY: Whyツリー（原因究明）
 * - WHAT: Whatツリー（対象分割）
 * - HOW: Howツリー（打ち手・発散）
 * - MECE_ACTION: MECEアクションツリー（打ち手・網羅）
 * - KPI: KPIツリー
 */
export type IssueTreePattern =
  | 'ISSUE_POINT'
  | 'WHY'
  | 'WHAT'
  | 'HOW'
  | 'MECE_ACTION'
  | 'KPI';

const ISSUE_TREE_PATTERNS: IssueTreePattern[] = [
  'ISSUE_POINT',
  'WHY',
  'WHAT',
  'HOW',
  'MECE_ACTION',
  'KPI',
];

export interface CreateIssueTreeProps {
  projectId: string;
  type?: IssueTreeType;
  pattern?: IssueTreePattern;
  name: string;
  rootQuestion?: string | null;
}

export interface ReconstructIssueTreeProps {
  id: string;
  projectId: string;
  type: IssueTreeType;
  pattern: IssueTreePattern;
  name: string;
  rootQuestion: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * イシューツリーエンティティ（なぜ型 / 打ち手型）
 */
export class IssueTree extends BaseEntity {
  private readonly _projectId: string;
  private _type: IssueTreeType;
  private _pattern: IssueTreePattern;
  private _name: string;
  private _rootQuestion: string | null;

  private constructor(
    id: string,
    projectId: string,
    type: IssueTreeType,
    pattern: IssueTreePattern,
    name: string,
    rootQuestion: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._type = type;
    this._pattern = pattern;
    this._name = name;
    this._rootQuestion = rootQuestion;
  }

  /**
   * 新規イシューツリー作成
   */
  static create(props: CreateIssueTreeProps, id: string): IssueTree {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    // 旧 type は任意（既定 WHY）。互換のため残置。
    const type = props.type ?? 'WHY';
    if (type !== 'WHY' && type !== 'SOLUTION') {
      throw new ValidationError('Issue tree type must be WHY or SOLUTION');
    }

    // 新 pattern（既定 ISSUE_POINT）
    const pattern = props.pattern ?? 'ISSUE_POINT';
    if (!ISSUE_TREE_PATTERNS.includes(pattern)) {
      throw new ValidationError('Invalid issue tree pattern');
    }

    const name = props.name?.trim();
    if (!name || name.length < 1) {
      throw new ValidationError('Issue tree name is required');
    }
    if (name.length > 200) {
      throw new ValidationError('Issue tree name must be at most 200 characters');
    }

    const rootQuestion = props.rootQuestion?.trim() || null;

    const now = new Date();
    return new IssueTree(
      id,
      props.projectId,
      type,
      pattern,
      name,
      rootQuestion,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructIssueTreeProps): IssueTree {
    return new IssueTree(
      props.id,
      props.projectId,
      props.type,
      props.pattern,
      props.name,
      props.rootQuestion,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  changeName(name: string): void {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new ValidationError('Issue tree name is required');
    }
    if (trimmed.length > 200) {
      throw new ValidationError('Issue tree name must be at most 200 characters');
    }
    this._name = trimmed;
    this.touch();
  }

  changeRootQuestion(rootQuestion: string | null): void {
    this._rootQuestion = rootQuestion?.trim() || null;
    this.touch();
  }

  changeType(type: IssueTreeType): void {
    if (type !== 'WHY' && type !== 'SOLUTION') {
      throw new ValidationError('Issue tree type must be WHY or SOLUTION');
    }
    this._type = type;
    this.touch();
  }

  changePattern(pattern: IssueTreePattern): void {
    if (!ISSUE_TREE_PATTERNS.includes(pattern)) {
      throw new ValidationError('Invalid issue tree pattern');
    }
    this._pattern = pattern;
    this.touch();
  }

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get type(): IssueTreeType {
    return this._type;
  }

  get pattern(): IssueTreePattern {
    return this._pattern;
  }

  get name(): string {
    return this._name;
  }

  get rootQuestion(): string | null {
    return this._rootQuestion;
  }
}
