import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateProductProps {
  projectId: string;
  code?: string | null;
  name?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  minLot?: number | null;
  unitPrice?: number | null;
  note?: string | null;
  order?: number;
}

export interface ReconstructProductProps {
  id: string;
  projectId: string;
  code: string | null;
  name: string;
  supplierId: string | null;
  supplierName: string | null;
  minLot: number | null;
  unitPrice: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProductProps {
  code?: string | null;
  name?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  minLot?: number | null;
  unitPrice?: number | null;
  note?: string | null;
  order?: number;
}

/**
 * 商品マスタエンティティ
 * 商品ごとの仕入先・最小ロット・単価を管理する
 */
export class Product extends BaseEntity {
  private readonly _projectId: string;
  private _code: string | null;
  private _name: string;
  private _supplierId: string | null;
  private _supplierName: string | null;
  private _minLot: number | null;
  private _unitPrice: number | null;
  private _note: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    code: string | null,
    name: string,
    supplierId: string | null,
    supplierName: string | null,
    minLot: number | null,
    unitPrice: number | null,
    note: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._code = code;
    this._name = name;
    this._supplierId = supplierId;
    this._supplierName = supplierName;
    this._minLot = minLot;
    this._unitPrice = unitPrice;
    this._note = note;
    this._order = order;
  }

  /**
   * 新規商品作成
   */
  static create(props: CreateProductProps, id: string): Product {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const now = new Date();
    return new Product(
      id,
      props.projectId,
      props.code?.trim() || null,
      props.name?.trim() || '',
      props.supplierId?.trim() || null,
      props.supplierName?.trim() || null,
      props.minLot ?? null,
      props.unitPrice ?? null,
      props.note?.trim() || null,
      props.order ?? 0,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructProductProps): Product {
    return new Product(
      props.id,
      props.projectId,
      props.code,
      props.name,
      props.supplierId,
      props.supplierName,
      props.minLot,
      props.unitPrice,
      props.note,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateProductProps): void {
    if (props.code !== undefined) {
      this._code = props.code?.trim() || null;
    }
    if (props.name !== undefined) {
      this._name = props.name?.trim() || '';
    }
    if (props.supplierId !== undefined) {
      this._supplierId = props.supplierId?.trim() || null;
    }
    if (props.supplierName !== undefined) {
      this._supplierName = props.supplierName?.trim() || null;
    }
    if (props.minLot !== undefined) {
      this._minLot = props.minLot ?? null;
    }
    if (props.unitPrice !== undefined) {
      this._unitPrice = props.unitPrice ?? null;
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

  get supplierId(): string | null {
    return this._supplierId;
  }

  get supplierName(): string | null {
    return this._supplierName;
  }

  get minLot(): number | null {
    return this._minLot;
  }

  get unitPrice(): number | null {
    return this._unitPrice;
  }

  get note(): string | null {
    return this._note;
  }

  get order(): number {
    return this._order;
  }
}
