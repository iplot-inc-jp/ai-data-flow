import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateDemandDataProps {
  projectId: string;
  productName?: string | null;
  period?: string | null;
  quantity?: number | null;
  note?: string | null;
  order?: number;
}

export interface ReconstructDemandDataProps {
  id: string;
  projectId: string;
  productName: string | null;
  period: string | null;
  quantity: number | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateDemandDataProps {
  productName?: string | null;
  period?: string | null;
  quantity?: number | null;
  note?: string | null;
  order?: number;
}

/**
 * 過去需要データエンティティ
 * 商品×期間ごとの需要実績を1行で管理する
 */
export class DemandData extends BaseEntity {
  private readonly _projectId: string;
  private _productName: string | null;
  private _period: string | null;
  private _quantity: number | null;
  private _note: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    productName: string | null,
    period: string | null,
    quantity: number | null,
    note: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._productName = productName;
    this._period = period;
    this._quantity = quantity;
    this._note = note;
    this._order = order;
  }

  /**
   * 新規需要データ作成
   */
  static create(props: CreateDemandDataProps, id: string): DemandData {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const now = new Date();
    return new DemandData(
      id,
      props.projectId,
      props.productName?.trim() || null,
      props.period?.trim() || null,
      props.quantity ?? null,
      props.note?.trim() || null,
      props.order ?? 0,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructDemandDataProps): DemandData {
    return new DemandData(
      props.id,
      props.projectId,
      props.productName,
      props.period,
      props.quantity,
      props.note,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: UpdateDemandDataProps): void {
    if (props.productName !== undefined) {
      this._productName = props.productName?.trim() || null;
    }
    if (props.period !== undefined) {
      this._period = props.period?.trim() || null;
    }
    if (props.quantity !== undefined) {
      this._quantity = props.quantity ?? null;
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

  get productName(): string | null {
    return this._productName;
  }

  get period(): string | null {
    return this._period;
  }

  get quantity(): number | null {
    return this._quantity;
  }

  get note(): string | null {
    return this._note;
  }

  get order(): number {
    return this._order;
  }
}
