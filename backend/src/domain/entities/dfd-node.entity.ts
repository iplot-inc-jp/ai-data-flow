import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export type DfdNodeKindValue = 'FUNCTION' | 'EXTERNAL_ENTITY' | 'DATA_STORE';

export interface CreateDfdNodeProps {
  diagramId: string;
  kind: DfdNodeKindValue;
  label: string;
  number?: string | null;
  refFlowId?: string | null;
  refNodeId?: string | null;
  /** DATA_STORE をデータオブジェクトマスタに紐づける（任意） */
  dataObjectId?: string | null;
  positionX?: number;
  positionY?: number;
}

export interface ReconstructDfdNodeProps {
  id: string;
  diagramId: string;
  kind: DfdNodeKindValue;
  label: string;
  number: string | null;
  refFlowId: string | null;
  refNodeId: string | null;
  dataObjectId: string | null;
  positionX: number;
  positionY: number;
  createdAt: Date;
  updatedAt: Date;
}

/** DFDノード（FUNCTION=処理 / EXTERNAL_ENTITY=外部実体 / DATA_STORE=データストア） */
export class DfdNode extends BaseEntity {
  private readonly _diagramId: string;
  private _kind: DfdNodeKindValue;
  private _label: string;
  private _number: string | null;
  private _refFlowId: string | null;
  private _refNodeId: string | null;
  private _dataObjectId: string | null;
  private _positionX: number;
  private _positionY: number;

  private constructor(
    id: string,
    diagramId: string,
    kind: DfdNodeKindValue,
    label: string,
    number: string | null,
    refFlowId: string | null,
    refNodeId: string | null,
    dataObjectId: string | null,
    positionX: number,
    positionY: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._diagramId = diagramId;
    this._kind = kind;
    this._label = label;
    this._number = number;
    this._refFlowId = refFlowId;
    this._refNodeId = refNodeId;
    this._dataObjectId = dataObjectId;
    this._positionX = positionX;
    this._positionY = positionY;
  }

  static create(props: CreateDfdNodeProps, id: string): DfdNode {
    if (!props.diagramId) throw new ValidationError('Diagram ID is required');
    const label = props.label?.trim();
    if (!label) throw new ValidationError('Node label is required');
    const now = new Date();
    return new DfdNode(
      id,
      props.diagramId,
      props.kind,
      label,
      props.number ?? null,
      props.refFlowId ?? null,
      props.refNodeId ?? null,
      props.dataObjectId ?? null,
      props.positionX ?? 0,
      props.positionY ?? 0,
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructDfdNodeProps): DfdNode {
    return new DfdNode(
      props.id,
      props.diagramId,
      props.kind,
      props.label,
      props.number,
      props.refFlowId,
      props.refNodeId,
      props.dataObjectId,
      props.positionX,
      props.positionY,
      props.createdAt,
      props.updatedAt,
    );
  }

  updateLabel(label: string): void {
    const trimmed = label?.trim();
    if (!trimmed) throw new ValidationError('Node label is required');
    this._label = trimmed;
    this.touch();
  }

  updateNumber(number: string | null): void {
    this._number = number ?? null;
    this.touch();
  }

  updateKind(kind: DfdNodeKindValue): void {
    this._kind = kind;
    this.touch();
  }

  /** データオブジェクトマスタとの紐づけ設定/解除 */
  updateDataObjectId(dataObjectId: string | null): void {
    this._dataObjectId = dataObjectId ?? null;
    this.touch();
  }

  updatePosition(x: number, y: number): void {
    this._positionX = x;
    this._positionY = y;
    this.touch();
  }

  get diagramId(): string { return this._diagramId; }
  get kind(): DfdNodeKindValue { return this._kind; }
  get label(): string { return this._label; }
  get number(): string | null { return this._number; }
  get refFlowId(): string | null { return this._refFlowId; }
  get refNodeId(): string | null { return this._refNodeId; }
  get dataObjectId(): string | null { return this._dataObjectId; }
  get positionX(): number { return this._positionX; }
  get positionY(): number { return this._positionY; }
}
