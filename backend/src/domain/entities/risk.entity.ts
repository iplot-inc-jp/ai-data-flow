import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateRiskProps {
  projectId: string;
  code?: string | null;
  type?: string | null;
  event?: string | null;
  causeCategory?: string | null;
  probability?: string | null;
  impact?: string | null;
  priority?: string | null;
  countermeasure?: string | null;
  needsMtg?: string | null;
  mtgDate?: string | null;
  deadline?: string | null;
  owner?: string | null;
  status?: string | null;
  note?: string | null;
  order?: number;
}

export interface ReconstructRiskProps {
  id: string;
  projectId: string;
  code: string | null;
  type: string | null;
  event: string | null;
  causeCategory: string | null;
  probability: string | null;
  impact: string | null;
  priority: string | null;
  countermeasure: string | null;
  needsMtg: string | null;
  mtgDate: string | null;
  deadline: string | null;
  owner: string | null;
  status: string | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateRiskProps {
  code?: string | null;
  type?: string | null;
  event?: string | null;
  causeCategory?: string | null;
  probability?: string | null;
  impact?: string | null;
  priority?: string | null;
  countermeasure?: string | null;
  needsMtg?: string | null;
  mtgDate?: string | null;
  deadline?: string | null;
  owner?: string | null;
  status?: string | null;
  note?: string | null;
  order?: number;
}

/**
 * リスク・ボトルネックエンティティ
 * プロジェクトのリスク・ボトルネックを発生確率・影響度・優先度で管理する
 */
export class Risk extends BaseEntity {
  private readonly _projectId: string;
  private _code: string | null;
  private _type: string | null;
  private _event: string | null;
  private _causeCategory: string | null;
  private _probability: string | null;
  private _impact: string | null;
  private _priority: string | null;
  private _countermeasure: string | null;
  private _needsMtg: string | null;
  private _mtgDate: string | null;
  private _deadline: string | null;
  private _owner: string | null;
  private _status: string | null;
  private _note: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    code: string | null,
    type: string | null,
    event: string | null,
    causeCategory: string | null,
    probability: string | null,
    impact: string | null,
    priority: string | null,
    countermeasure: string | null,
    needsMtg: string | null,
    mtgDate: string | null,
    deadline: string | null,
    owner: string | null,
    status: string | null,
    note: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._code = code;
    this._type = type;
    this._event = event;
    this._causeCategory = causeCategory;
    this._probability = probability;
    this._impact = impact;
    this._priority = priority;
    this._countermeasure = countermeasure;
    this._needsMtg = needsMtg;
    this._mtgDate = mtgDate;
    this._deadline = deadline;
    this._owner = owner;
    this._status = status;
    this._note = note;
    this._order = order;
  }

  /**
   * 新規リスク作成
   */
  static create(props: CreateRiskProps, id: string): Risk {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const now = new Date();
    return new Risk(
      id,
      props.projectId,
      props.code?.trim() || null,
      props.type?.trim() || null,
      props.event?.trim() || null,
      props.causeCategory?.trim() || null,
      props.probability?.trim() || null,
      props.impact?.trim() || null,
      props.priority?.trim() || null,
      props.countermeasure?.trim() || null,
      props.needsMtg?.trim() || null,
      props.mtgDate?.trim() || null,
      props.deadline?.trim() || null,
      props.owner?.trim() || null,
      props.status?.trim() || null,
      props.note?.trim() || null,
      props.order ?? 0,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructRiskProps): Risk {
    return new Risk(
      props.id,
      props.projectId,
      props.code,
      props.type,
      props.event,
      props.causeCategory,
      props.probability,
      props.impact,
      props.priority,
      props.countermeasure,
      props.needsMtg,
      props.mtgDate,
      props.deadline,
      props.owner,
      props.status,
      props.note,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateRiskProps): void {
    if (props.code !== undefined) {
      this._code = props.code?.trim() || null;
    }
    if (props.type !== undefined) {
      this._type = props.type?.trim() || null;
    }
    if (props.event !== undefined) {
      this._event = props.event?.trim() || null;
    }
    if (props.causeCategory !== undefined) {
      this._causeCategory = props.causeCategory?.trim() || null;
    }
    if (props.probability !== undefined) {
      this._probability = props.probability?.trim() || null;
    }
    if (props.impact !== undefined) {
      this._impact = props.impact?.trim() || null;
    }
    if (props.priority !== undefined) {
      this._priority = props.priority?.trim() || null;
    }
    if (props.countermeasure !== undefined) {
      this._countermeasure = props.countermeasure?.trim() || null;
    }
    if (props.needsMtg !== undefined) {
      this._needsMtg = props.needsMtg?.trim() || null;
    }
    if (props.mtgDate !== undefined) {
      this._mtgDate = props.mtgDate?.trim() || null;
    }
    if (props.deadline !== undefined) {
      this._deadline = props.deadline?.trim() || null;
    }
    if (props.owner !== undefined) {
      this._owner = props.owner?.trim() || null;
    }
    if (props.status !== undefined) {
      this._status = props.status?.trim() || null;
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

  get code(): string | null {
    return this._code;
  }

  get type(): string | null {
    return this._type;
  }

  get event(): string | null {
    return this._event;
  }

  get causeCategory(): string | null {
    return this._causeCategory;
  }

  get probability(): string | null {
    return this._probability;
  }

  get impact(): string | null {
    return this._impact;
  }

  get priority(): string | null {
    return this._priority;
  }

  get countermeasure(): string | null {
    return this._countermeasure;
  }

  get needsMtg(): string | null {
    return this._needsMtg;
  }

  get mtgDate(): string | null {
    return this._mtgDate;
  }

  get deadline(): string | null {
    return this._deadline;
  }

  get owner(): string | null {
    return this._owner;
  }

  get status(): string | null {
    return this._status;
  }

  get note(): string | null {
    return this._note;
  }

  get order(): number {
    return this._order;
  }
}
