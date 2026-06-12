import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateDataObjectProps {
  projectId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  positionX?: number;
  positionY?: number;
  order?: number;
}

export interface ReconstructDataObjectProps {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  color: string | null;
  positionX: number;
  positionY: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * データオブジェクト。
 * DFDのデータストア / オブジェクト関係性マップの「オブジェクト」/ ER図の点線囲み
 * を貫く同一マスタ。ER図では実態テーブル（Table）に細分化される。
 */
export class DataObject extends BaseEntity {
  private readonly _projectId: string;
  private _name: string;
  private _description: string | null;
  private _color: string | null;
  private _positionX: number;
  private _positionY: number;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    name: string,
    description: string | null,
    color: string | null,
    positionX: number,
    positionY: number,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._name = name;
    this._description = description;
    this._color = color;
    this._positionX = positionX;
    this._positionY = positionY;
    this._order = order;
  }

  static create(props: CreateDataObjectProps, id: string): DataObject {
    if (!props.projectId) throw new ValidationError('Project ID is required');
    const name = props.name?.trim();
    if (!name) throw new ValidationError('Data object name is required');
    const now = new Date();
    return new DataObject(
      id,
      props.projectId,
      name,
      props.description ?? null,
      props.color ?? null,
      props.positionX ?? 0,
      props.positionY ?? 0,
      props.order ?? 0,
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructDataObjectProps): DataObject {
    return new DataObject(
      props.id,
      props.projectId,
      props.name,
      props.description,
      props.color,
      props.positionX,
      props.positionY,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  updateName(name: string): void {
    const trimmed = name?.trim();
    if (!trimmed) throw new ValidationError('Data object name is required');
    this._name = trimmed;
    this.touch();
  }

  updateDescription(description: string | null): void {
    this._description = description ?? null;
    this.touch();
  }

  updateColor(color: string | null): void {
    this._color = color ?? null;
    this.touch();
  }

  updateOrder(order: number): void {
    this._order = order;
    this.touch();
  }

  updatePosition(x: number, y: number): void {
    this._positionX = x;
    this._positionY = y;
    this.touch();
  }

  get projectId(): string { return this._projectId; }
  get name(): string { return this._name; }
  get description(): string | null { return this._description; }
  get color(): string | null { return this._color; }
  get positionX(): number { return this._positionX; }
  get positionY(): number { return this._positionY; }
  get order(): number { return this._order; }
}
