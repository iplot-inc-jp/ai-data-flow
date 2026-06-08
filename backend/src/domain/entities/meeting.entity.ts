import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateMeetingProps {
  projectId: string;
  name: string;
  purpose?: string | null;
  frequency?: string | null;
  dayTime?: string | null;
  requiredAttendees?: string | null;
  optionalAttendees?: string | null;
  agendaTemplate?: string | null;
  preMaterials?: string | null;
  minutesOwner?: string | null;
  decisionMaker?: string | null;
  note?: string | null;
  order?: number;
}

export interface ReconstructMeetingProps {
  id: string;
  projectId: string;
  name: string;
  purpose: string | null;
  frequency: string | null;
  dayTime: string | null;
  requiredAttendees: string | null;
  optionalAttendees: string | null;
  agendaTemplate: string | null;
  preMaterials: string | null;
  minutesOwner: string | null;
  decisionMaker: string | null;
  note: string | null;
  order: number;
  stakeholderIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateMeetingProps {
  name?: string;
  purpose?: string | null;
  frequency?: string | null;
  dayTime?: string | null;
  requiredAttendees?: string | null;
  optionalAttendees?: string | null;
  agendaTemplate?: string | null;
  preMaterials?: string | null;
  minutesOwner?: string | null;
  decisionMaker?: string | null;
  note?: string | null;
  order?: number;
}

/**
 * 会議体エンティティ
 * プロジェクトの定例・臨時の会議体を表現する
 */
export class Meeting extends BaseEntity {
  private readonly _projectId: string;
  private _name: string;
  private _purpose: string | null;
  private _frequency: string | null;
  private _dayTime: string | null;
  private _requiredAttendees: string | null;
  private _optionalAttendees: string | null;
  private _agendaTemplate: string | null;
  private _preMaterials: string | null;
  private _minutesOwner: string | null;
  private _decisionMaker: string | null;
  private _note: string | null;
  private _order: number;
  private _stakeholderIds: string[];

  private constructor(
    id: string,
    projectId: string,
    name: string,
    purpose: string | null,
    frequency: string | null,
    dayTime: string | null,
    requiredAttendees: string | null,
    optionalAttendees: string | null,
    agendaTemplate: string | null,
    preMaterials: string | null,
    minutesOwner: string | null,
    decisionMaker: string | null,
    note: string | null,
    order: number,
    stakeholderIds: string[],
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._name = name;
    this._purpose = purpose;
    this._frequency = frequency;
    this._dayTime = dayTime;
    this._requiredAttendees = requiredAttendees;
    this._optionalAttendees = optionalAttendees;
    this._agendaTemplate = agendaTemplate;
    this._preMaterials = preMaterials;
    this._minutesOwner = minutesOwner;
    this._decisionMaker = decisionMaker;
    this._note = note;
    this._order = order;
    this._stakeholderIds = stakeholderIds;
  }

  /**
   * 新規会議体作成
   */
  static create(props: CreateMeetingProps, id: string): Meeting {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const name = props.name?.trim();
    if (!name || name.length < 1) {
      throw new ValidationError('Meeting name is required');
    }
    if (name.length > 200) {
      throw new ValidationError('Meeting name must be at most 200 characters');
    }

    const now = new Date();
    return new Meeting(
      id,
      props.projectId,
      name,
      props.purpose?.trim() || null,
      props.frequency?.trim() || null,
      props.dayTime?.trim() || null,
      props.requiredAttendees?.trim() || null,
      props.optionalAttendees?.trim() || null,
      props.agendaTemplate?.trim() || null,
      props.preMaterials?.trim() || null,
      props.minutesOwner?.trim() || null,
      props.decisionMaker?.trim() || null,
      props.note?.trim() || null,
      props.order ?? 0,
      [],
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructMeetingProps): Meeting {
    return new Meeting(
      props.id,
      props.projectId,
      props.name,
      props.purpose,
      props.frequency,
      props.dayTime,
      props.requiredAttendees,
      props.optionalAttendees,
      props.agendaTemplate,
      props.preMaterials,
      props.minutesOwner,
      props.decisionMaker,
      props.note,
      props.order,
      props.stakeholderIds ?? [],
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateMeetingProps): void {
    if (props.name !== undefined) {
      const trimmed = props.name?.trim();
      if (!trimmed || trimmed.length < 1) {
        throw new ValidationError('Meeting name is required');
      }
      if (trimmed.length > 200) {
        throw new ValidationError(
          'Meeting name must be at most 200 characters',
        );
      }
      this._name = trimmed;
    }
    if (props.purpose !== undefined) {
      this._purpose = props.purpose?.trim() || null;
    }
    if (props.frequency !== undefined) {
      this._frequency = props.frequency?.trim() || null;
    }
    if (props.dayTime !== undefined) {
      this._dayTime = props.dayTime?.trim() || null;
    }
    if (props.requiredAttendees !== undefined) {
      this._requiredAttendees = props.requiredAttendees?.trim() || null;
    }
    if (props.optionalAttendees !== undefined) {
      this._optionalAttendees = props.optionalAttendees?.trim() || null;
    }
    if (props.agendaTemplate !== undefined) {
      this._agendaTemplate = props.agendaTemplate?.trim() || null;
    }
    if (props.preMaterials !== undefined) {
      this._preMaterials = props.preMaterials?.trim() || null;
    }
    if (props.minutesOwner !== undefined) {
      this._minutesOwner = props.minutesOwner?.trim() || null;
    }
    if (props.decisionMaker !== undefined) {
      this._decisionMaker = props.decisionMaker?.trim() || null;
    }
    if (props.note !== undefined) {
      this._note = props.note?.trim() || null;
    }
    if (props.order !== undefined) {
      this._order = props.order;
    }
    this.touch();
  }

  /** 対象ステークホルダーを置き換える */
  setStakeholders(stakeholderIds: string[]): void {
    // 重複排除
    this._stakeholderIds = Array.from(new Set(stakeholderIds));
    this.touch();
  }

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get name(): string {
    return this._name;
  }

  get purpose(): string | null {
    return this._purpose;
  }

  get frequency(): string | null {
    return this._frequency;
  }

  get dayTime(): string | null {
    return this._dayTime;
  }

  get requiredAttendees(): string | null {
    return this._requiredAttendees;
  }

  get optionalAttendees(): string | null {
    return this._optionalAttendees;
  }

  get agendaTemplate(): string | null {
    return this._agendaTemplate;
  }

  get preMaterials(): string | null {
    return this._preMaterials;
  }

  get minutesOwner(): string | null {
    return this._minutesOwner;
  }

  get decisionMaker(): string | null {
    return this._decisionMaker;
  }

  get note(): string | null {
    return this._note;
  }

  get order(): number {
    return this._order;
  }

  get stakeholderIds(): string[] {
    return this._stakeholderIds;
  }
}
