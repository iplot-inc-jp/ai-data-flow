import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateSupplierProps {
  projectId: string;
  code?: string | null;
  name?: string | null;
  salesRep?: string | null;
  tel?: string | null;
  email?: string | null;
  leadTimeDays?: number | null;
  note?: string | null;
  order?: number;
}

export interface ReconstructSupplierProps {
  id: string;
  projectId: string;
  code: string | null;
  name: string;
  salesRep: string | null;
  tel: string | null;
  email: string | null;
  leadTimeDays: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSupplierProps {
  code?: string | null;
  name?: string | null;
  salesRep?: string | null;
  tel?: string | null;
  email?: string | null;
  leadTimeDays?: number | null;
  note?: string | null;
  order?: number;
}

/**
 * 仕入先マスタエンティティ
 * 仕入先の連絡先・リードタイムを管理する
 */
export class Supplier extends BaseEntity {
  private readonly _projectId: string;
  private _code: string | null;
  private _name: string;
  private _salesRep: string | null;
  private _tel: string | null;
  private _email: string | null;
  private _leadTimeDays: number | null;
  private _note: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    code: string | null,
    name: string,
    salesRep: string | null,
    tel: string | null,
    email: string | null,
    leadTimeDays: number | null,
    note: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._code = code;
    this._name = name;
    this._salesRep = salesRep;
    this._tel = tel;
    this._email = email;
    this._leadTimeDays = leadTimeDays;
    this._note = note;
    this._order = order;
  }

  /**
   * 新規仕入先作成
   */
  static create(props: CreateSupplierProps, id: string): Supplier {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const now = new Date();
    return new Supplier(
      id,
      props.projectId,
      props.code?.trim() || null,
      props.name?.trim() || '',
      props.salesRep?.trim() || null,
      props.tel?.trim() || null,
      props.email?.trim() || null,
      props.leadTimeDays ?? null,
      props.note?.trim() || null,
      props.order ?? 0,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructSupplierProps): Supplier {
    return new Supplier(
      props.id,
      props.projectId,
      props.code,
      props.name,
      props.salesRep,
      props.tel,
      props.email,
      props.leadTimeDays,
      props.note,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateSupplierProps): void {
    if (props.code !== undefined) {
      this._code = props.code?.trim() || null;
    }
    if (props.name !== undefined) {
      this._name = props.name?.trim() || '';
    }
    if (props.salesRep !== undefined) {
      this._salesRep = props.salesRep?.trim() || null;
    }
    if (props.tel !== undefined) {
      this._tel = props.tel?.trim() || null;
    }
    if (props.email !== undefined) {
      this._email = props.email?.trim() || null;
    }
    if (props.leadTimeDays !== undefined) {
      this._leadTimeDays = props.leadTimeDays ?? null;
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

  get name(): string {
    return this._name;
  }

  get salesRep(): string | null {
    return this._salesRep;
  }

  get tel(): string | null {
    return this._tel;
  }

  get email(): string | null {
    return this._email;
  }

  get leadTimeDays(): number | null {
    return this._leadTimeDays;
  }

  get note(): string | null {
    return this._note;
  }

  get order(): number {
    return this._order;
  }
}
