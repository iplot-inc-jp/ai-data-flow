import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export type RelationCardinalityValue = 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';

export interface CreateDataObjectRelationProps {
  projectId: string;
  sourceObjectId: string;
  targetObjectId: string;
  cardinality?: RelationCardinalityValue;
  label?: string | null;
  description?: string | null;
}

export interface ReconstructDataObjectRelationProps {
  id: string;
  projectId: string;
  sourceObjectId: string;
  targetObjectId: string;
  cardinality: RelationCardinalityValue;
  label: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** オブジェクト関係性マップの関係線（データオブジェクト間のリレーション） */
export class DataObjectRelation extends BaseEntity {
  private readonly _projectId: string;
  private _sourceObjectId: string;
  private _targetObjectId: string;
  private _cardinality: RelationCardinalityValue;
  private _label: string | null;
  private _description: string | null;

  private constructor(
    id: string,
    projectId: string,
    sourceObjectId: string,
    targetObjectId: string,
    cardinality: RelationCardinalityValue,
    label: string | null,
    description: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._sourceObjectId = sourceObjectId;
    this._targetObjectId = targetObjectId;
    this._cardinality = cardinality;
    this._label = label;
    this._description = description;
  }

  private static assertEndpoints(sourceObjectId: string, targetObjectId: string): void {
    if (!sourceObjectId) throw new ValidationError('Source object ID is required');
    if (!targetObjectId) throw new ValidationError('Target object ID is required');
    if (sourceObjectId === targetObjectId) {
      throw new ValidationError('Source and target objects must be different');
    }
  }

  static create(props: CreateDataObjectRelationProps, id: string): DataObjectRelation {
    if (!props.projectId) throw new ValidationError('Project ID is required');
    DataObjectRelation.assertEndpoints(props.sourceObjectId, props.targetObjectId);
    const now = new Date();
    return new DataObjectRelation(
      id,
      props.projectId,
      props.sourceObjectId,
      props.targetObjectId,
      props.cardinality ?? 'ONE_TO_MANY',
      props.label ?? null,
      props.description ?? null,
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructDataObjectRelationProps): DataObjectRelation {
    return new DataObjectRelation(
      props.id,
      props.projectId,
      props.sourceObjectId,
      props.targetObjectId,
      props.cardinality,
      props.label,
      props.description,
      props.createdAt,
      props.updatedAt,
    );
  }

  /** 端点の付け替え（source=target は拒否） */
  updateEndpoints(sourceObjectId: string, targetObjectId: string): void {
    DataObjectRelation.assertEndpoints(sourceObjectId, targetObjectId);
    this._sourceObjectId = sourceObjectId;
    this._targetObjectId = targetObjectId;
    this.touch();
  }

  updateCardinality(cardinality: RelationCardinalityValue): void {
    this._cardinality = cardinality;
    this.touch();
  }

  updateLabel(label: string | null): void {
    this._label = label ?? null;
    this.touch();
  }

  updateDescription(description: string | null): void {
    this._description = description ?? null;
    this.touch();
  }

  get projectId(): string { return this._projectId; }
  get sourceObjectId(): string { return this._sourceObjectId; }
  get targetObjectId(): string { return this._targetObjectId; }
  get cardinality(): RelationCardinalityValue { return this._cardinality; }
  get label(): string | null { return this._label; }
  get description(): string | null { return this._description; }
}
