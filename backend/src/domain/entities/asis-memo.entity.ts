import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateAsisMemoProps {
  projectId: string;
  topic?: string | null;
  currentState?: string | null;
  pain?: string | null;
  restriction?: string | null;
  note?: string | null;
  order?: number;
}

export interface ReconstructAsisMemoProps {
  id: string;
  projectId: string;
  topic: string | null;
  currentState: string | null;
  pain: string | null;
  restriction: string | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateAsisMemoProps {
  topic?: string | null;
  currentState?: string | null;
  pain?: string | null;
  restriction?: string | null;
  note?: string | null;
  order?: number;
}

/**
 * ASISメモエンティティ
 * プロジェクトの現状把握（テーマ・現状・痛み・制約）を管理する
 */
export class AsisMemo extends BaseEntity {
  private readonly _projectId: string;
  private _topic: string | null;
  private _currentState: string | null;
  private _pain: string | null;
  private _restriction: string | null;
  private _note: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    topic: string | null,
    currentState: string | null,
    pain: string | null,
    restriction: string | null,
    note: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._topic = topic;
    this._currentState = currentState;
    this._pain = pain;
    this._restriction = restriction;
    this._note = note;
    this._order = order;
  }

  /**
   * 新規ASISメモ作成
   */
  static create(props: CreateAsisMemoProps, id: string): AsisMemo {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const now = new Date();
    return new AsisMemo(
      id,
      props.projectId,
      props.topic?.trim() || null,
      props.currentState?.trim() || null,
      props.pain?.trim() || null,
      props.restriction?.trim() || null,
      props.note?.trim() || null,
      props.order ?? 0,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructAsisMemoProps): AsisMemo {
    return new AsisMemo(
      props.id,
      props.projectId,
      props.topic,
      props.currentState,
      props.pain,
      props.restriction,
      props.note,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateAsisMemoProps): void {
    if (props.topic !== undefined) {
      this._topic = props.topic?.trim() || null;
    }
    if (props.currentState !== undefined) {
      this._currentState = props.currentState?.trim() || null;
    }
    if (props.pain !== undefined) {
      this._pain = props.pain?.trim() || null;
    }
    if (props.restriction !== undefined) {
      this._restriction = props.restriction?.trim() || null;
    }
    if (props.note !== undefined) {
      this._note = props.note?.trim() || null;
    }
    if (props.order !== undefined) {
      this._order = props.order;
    }
    this.touch();
  }

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get topic(): string | null {
    return this._topic;
  }

  get currentState(): string | null {
    return this._currentState;
  }

  get pain(): string | null {
    return this._pain;
  }

  get restriction(): string | null {
    return this._restriction;
  }

  get note(): string | null {
    return this._note;
  }

  get order(): number {
    return this._order;
  }
}
