import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

/**
 * イシューツリーの型
 * - WHY: なぜ型（調査・原因究明）
 * - SOLUTION: 打ち手型（How・MECEアクション）
 */
export type IssueTreeType = 'WHY' | 'SOLUTION';

export interface CreateIssueTreeProps {
  projectId: string;
  type: IssueTreeType;
  name: string;
  rootQuestion?: string | null;
}

export interface ReconstructIssueTreeProps {
  id: string;
  projectId: string;
  type: IssueTreeType;
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
  private _name: string;
  private _rootQuestion: string | null;

  private constructor(
    id: string,
    projectId: string,
    type: IssueTreeType,
    name: string,
    rootQuestion: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._type = type;
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

    if (props.type !== 'WHY' && props.type !== 'SOLUTION') {
      throw new ValidationError('Issue tree type must be WHY or SOLUTION');
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
    return new IssueTree(id, props.projectId, props.type, name, rootQuestion, now, now);
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructIssueTreeProps): IssueTree {
    return new IssueTree(
      props.id,
      props.projectId,
      props.type,
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

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get type(): IssueTreeType {
    return this._type;
  }

  get name(): string {
    return this._name;
  }

  get rootQuestion(): string | null {
    return this._rootQuestion;
  }
}
