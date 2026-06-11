import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateStakeholderProps {
  projectId: string;
  name: string;
  affiliation?: string | null;
  role?: string | null;
  interest?: string | null;
  concern?: string | null;
  influence?: string | null;
  support?: string | null;
  engagement?: string | null;
  reportFrequency?: string | null;
  contactMethod?: string | null;
  owner?: string | null;
  reportLine?: string | null;
  asisHearing?: string | null;
  tobeSparring?: string | null;
  note?: string | null;
  side?: string | null;
  order?: number;
}

export interface ReconstructStakeholderProps {
  id: string;
  projectId: string;
  name: string;
  affiliation: string | null;
  role: string | null;
  interest: string | null;
  concern: string | null;
  influence: string | null;
  support: string | null;
  engagement: string | null;
  reportFrequency: string | null;
  contactMethod: string | null;
  owner: string | null;
  reportLine: string | null;
  asisHearing: string | null;
  tobeSparring: string | null;
  note: string | null;
  side: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateStakeholderProps {
  name?: string;
  affiliation?: string | null;
  role?: string | null;
  interest?: string | null;
  concern?: string | null;
  influence?: string | null;
  support?: string | null;
  engagement?: string | null;
  reportFrequency?: string | null;
  contactMethod?: string | null;
  owner?: string | null;
  reportLine?: string | null;
  asisHearing?: string | null;
  tobeSparring?: string | null;
  note?: string | null;
  side?: string | null;
  order?: number;
}

/**
 * ステークホルダーエンティティ
 * プロジェクトの利害関係者を表現する
 */
export class Stakeholder extends BaseEntity {
  private readonly _projectId: string;
  private _name: string;
  private _affiliation: string | null;
  private _role: string | null;
  private _interest: string | null;
  private _concern: string | null;
  private _influence: string | null;
  private _support: string | null;
  private _engagement: string | null;
  private _reportFrequency: string | null;
  private _contactMethod: string | null;
  private _owner: string | null;
  private _reportLine: string | null;
  private _asisHearing: string | null;
  private _tobeSparring: string | null;
  private _note: string | null;
  private _side: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    name: string,
    affiliation: string | null,
    role: string | null,
    interest: string | null,
    concern: string | null,
    influence: string | null,
    support: string | null,
    engagement: string | null,
    reportFrequency: string | null,
    contactMethod: string | null,
    owner: string | null,
    reportLine: string | null,
    asisHearing: string | null,
    tobeSparring: string | null,
    note: string | null,
    side: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._name = name;
    this._affiliation = affiliation;
    this._role = role;
    this._interest = interest;
    this._concern = concern;
    this._influence = influence;
    this._support = support;
    this._engagement = engagement;
    this._reportFrequency = reportFrequency;
    this._contactMethod = contactMethod;
    this._owner = owner;
    this._reportLine = reportLine;
    this._asisHearing = asisHearing;
    this._tobeSparring = tobeSparring;
    this._note = note;
    this._side = side;
    this._order = order;
  }

  /**
   * 新規ステークホルダー作成
   */
  static create(props: CreateStakeholderProps, id: string): Stakeholder {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const name = props.name?.trim();
    if (!name || name.length < 1) {
      throw new ValidationError('Stakeholder name is required');
    }
    if (name.length > 200) {
      throw new ValidationError('Stakeholder name must be at most 200 characters');
    }

    const now = new Date();
    return new Stakeholder(
      id,
      props.projectId,
      name,
      props.affiliation?.trim() || null,
      props.role?.trim() || null,
      props.interest?.trim() || null,
      props.concern?.trim() || null,
      props.influence?.trim() || null,
      props.support?.trim() || null,
      props.engagement?.trim() || null,
      props.reportFrequency?.trim() || null,
      props.contactMethod?.trim() || null,
      props.owner?.trim() || null,
      props.reportLine?.trim() || null,
      props.asisHearing?.trim() || null,
      props.tobeSparring?.trim() || null,
      props.note?.trim() || null,
      props.side?.trim() || 'INTERNAL',
      props.order ?? 0,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructStakeholderProps): Stakeholder {
    return new Stakeholder(
      props.id,
      props.projectId,
      props.name,
      props.affiliation,
      props.role,
      props.interest,
      props.concern,
      props.influence,
      props.support,
      props.engagement,
      props.reportFrequency,
      props.contactMethod,
      props.owner,
      props.reportLine,
      props.asisHearing,
      props.tobeSparring,
      props.note,
      props.side,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateStakeholderProps): void {
    if (props.name !== undefined) {
      const trimmed = props.name?.trim();
      if (!trimmed || trimmed.length < 1) {
        throw new ValidationError('Stakeholder name is required');
      }
      if (trimmed.length > 200) {
        throw new ValidationError(
          'Stakeholder name must be at most 200 characters',
        );
      }
      this._name = trimmed;
    }
    if (props.affiliation !== undefined) {
      this._affiliation = props.affiliation?.trim() || null;
    }
    if (props.role !== undefined) {
      this._role = props.role?.trim() || null;
    }
    if (props.interest !== undefined) {
      this._interest = props.interest?.trim() || null;
    }
    if (props.concern !== undefined) {
      this._concern = props.concern?.trim() || null;
    }
    if (props.influence !== undefined) {
      this._influence = props.influence?.trim() || null;
    }
    if (props.support !== undefined) {
      this._support = props.support?.trim() || null;
    }
    if (props.engagement !== undefined) {
      this._engagement = props.engagement?.trim() || null;
    }
    if (props.reportFrequency !== undefined) {
      this._reportFrequency = props.reportFrequency?.trim() || null;
    }
    if (props.contactMethod !== undefined) {
      this._contactMethod = props.contactMethod?.trim() || null;
    }
    if (props.owner !== undefined) {
      this._owner = props.owner?.trim() || null;
    }
    if (props.reportLine !== undefined) {
      this._reportLine = props.reportLine?.trim() || null;
    }
    if (props.asisHearing !== undefined) {
      this._asisHearing = props.asisHearing?.trim() || null;
    }
    if (props.tobeSparring !== undefined) {
      this._tobeSparring = props.tobeSparring?.trim() || null;
    }
    if (props.note !== undefined) {
      this._note = props.note?.trim() || null;
    }
    if (props.side !== undefined) {
      this._side = props.side?.trim() || null;
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

  get name(): string {
    return this._name;
  }

  get affiliation(): string | null {
    return this._affiliation;
  }

  get role(): string | null {
    return this._role;
  }

  get interest(): string | null {
    return this._interest;
  }

  get concern(): string | null {
    return this._concern;
  }

  get influence(): string | null {
    return this._influence;
  }

  get support(): string | null {
    return this._support;
  }

  get engagement(): string | null {
    return this._engagement;
  }

  get reportFrequency(): string | null {
    return this._reportFrequency;
  }

  get contactMethod(): string | null {
    return this._contactMethod;
  }

  get owner(): string | null {
    return this._owner;
  }

  get reportLine(): string | null {
    return this._reportLine;
  }

  get asisHearing(): string | null {
    return this._asisHearing;
  }

  get tobeSparring(): string | null {
    return this._tobeSparring;
  }

  get note(): string | null {
    return this._note;
  }

  get side(): string | null {
    return this._side;
  }

  get order(): number {
    return this._order;
  }
}
