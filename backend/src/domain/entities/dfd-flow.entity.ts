import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateDfdFlowProps {
  diagramId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  dataItem: string;
  informationTypeId?: string | null;
  pathStyle?: string | null;
  labelT?: number | null;
  infoT?: number | null;
  order?: number;
}

export interface ReconstructDfdFlowProps {
  id: string;
  diagramId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  dataItem: string;
  informationTypeId: string | null;
  pathStyle: string | null;
  labelT: number | null;
  infoT: number | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/** DFDのデータフロー（ノード間の矢印。dataItem=データ項目, informationTypeId=情報種別参照） */
export class DfdFlow extends BaseEntity {
  private readonly _diagramId: string;
  private _sourceNodeId: string;
  private _targetNodeId: string;
  private _sourceHandle: string | null;
  private _targetHandle: string | null;
  private _dataItem: string;
  private _informationTypeId: string | null;
  private _pathStyle: string | null;
  private _labelT: number | null;
  private _infoT: number | null;
  private _order: number;

  private constructor(
    id: string,
    diagramId: string,
    sourceNodeId: string,
    targetNodeId: string,
    sourceHandle: string | null,
    targetHandle: string | null,
    dataItem: string,
    informationTypeId: string | null,
    pathStyle: string | null,
    labelT: number | null,
    infoT: number | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._diagramId = diagramId;
    this._sourceNodeId = sourceNodeId;
    this._targetNodeId = targetNodeId;
    this._sourceHandle = sourceHandle;
    this._targetHandle = targetHandle;
    this._dataItem = dataItem;
    this._informationTypeId = informationTypeId;
    this._pathStyle = pathStyle;
    this._labelT = labelT;
    this._infoT = infoT;
    this._order = order;
  }

  static create(props: CreateDfdFlowProps, id: string): DfdFlow {
    if (!props.diagramId) throw new ValidationError('Diagram ID is required');
    if (!props.sourceNodeId || !props.targetNodeId) {
      throw new ValidationError('Source and target node IDs are required');
    }
    const now = new Date();
    return new DfdFlow(
      id,
      props.diagramId,
      props.sourceNodeId,
      props.targetNodeId,
      props.sourceHandle ?? null,
      props.targetHandle ?? null,
      props.dataItem ?? '',
      props.informationTypeId ?? null,
      props.pathStyle ?? null,
      props.labelT ?? null,
      props.infoT ?? null,
      props.order ?? 0,
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructDfdFlowProps): DfdFlow {
    return new DfdFlow(
      props.id,
      props.diagramId,
      props.sourceNodeId,
      props.targetNodeId,
      props.sourceHandle,
      props.targetHandle,
      props.dataItem,
      props.informationTypeId,
      props.pathStyle,
      props.labelT,
      props.infoT,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  updateDataItem(dataItem: string): void {
    this._dataItem = dataItem ?? '';
    this.touch();
  }

  updateInformationType(informationTypeId: string | null): void {
    this._informationTypeId = informationTypeId ?? null;
    this.touch();
  }

  updatePathStyle(pathStyle: string | null): void {
    this._pathStyle = pathStyle ?? null;
    this.touch();
  }

  updateLabelT(labelT: number | null): void {
    this._labelT = labelT ?? null;
    this.touch();
  }

  updateInfoT(infoT: number | null): void {
    this._infoT = infoT ?? null;
    this.touch();
  }

  updateEndpoints(sourceNodeId: string, targetNodeId: string): void {
    if (!sourceNodeId || !targetNodeId) {
      throw new ValidationError('Source and target node IDs are required');
    }
    this._sourceNodeId = sourceNodeId;
    this._targetNodeId = targetNodeId;
    this.touch();
  }

  updateSourceHandle(sourceHandle: string | null): void {
    this._sourceHandle = sourceHandle ?? null;
    this.touch();
  }

  updateTargetHandle(targetHandle: string | null): void {
    this._targetHandle = targetHandle ?? null;
    this.touch();
  }

  updateOrder(order: number): void {
    this._order = order;
    this.touch();
  }

  get diagramId(): string { return this._diagramId; }
  get sourceNodeId(): string { return this._sourceNodeId; }
  get targetNodeId(): string { return this._targetNodeId; }
  get sourceHandle(): string | null { return this._sourceHandle; }
  get targetHandle(): string | null { return this._targetHandle; }
  get dataItem(): string { return this._dataItem; }
  get informationTypeId(): string | null { return this._informationTypeId; }
  get pathStyle(): string | null { return this._pathStyle; }
  get labelT(): number | null { return this._labelT; }
  get infoT(): number | null { return this._infoT; }
  get order(): number { return this._order; }
}
