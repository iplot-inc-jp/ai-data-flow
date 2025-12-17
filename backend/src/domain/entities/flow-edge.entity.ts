import { BaseEntity } from './base.entity';

export class FlowEdge extends BaseEntity {
  private _flowId: string;
  private _sourceNodeId: string;
  private _targetNodeId: string;
  private _label: string | null;
  private _condition: string | null;

  constructor(props: {
    id: string;
    flowId: string;
    sourceNodeId: string;
    targetNodeId: string;
    label?: string | null;
    condition?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const now = new Date();
    super(props.id, props.createdAt ?? now, props.updatedAt ?? now);
    this._flowId = props.flowId;
    this._sourceNodeId = props.sourceNodeId;
    this._targetNodeId = props.targetNodeId;
    this._label = props.label ?? null;
    this._condition = props.condition ?? null;
  }

  get flowId(): string {
    return this._flowId;
  }

  get sourceNodeId(): string {
    return this._sourceNodeId;
  }

  get targetNodeId(): string {
    return this._targetNodeId;
  }

  get label(): string | null {
    return this._label;
  }

  get condition(): string | null {
    return this._condition;
  }

  updateLabel(label: string | null): void {
    this._label = label;
  }

  updateCondition(condition: string | null): void {
    this._condition = condition;
  }

  static create(props: {
    id: string;
    flowId: string;
    sourceNodeId: string;
    targetNodeId: string;
    label?: string | null;
    condition?: string | null;
  }): FlowEdge {
    return new FlowEdge(props);
  }
}

