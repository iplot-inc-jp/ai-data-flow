import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors/domain.error';

export type CrudOperation = 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';

export class CrudMapping extends BaseEntity {
  private _columnId: string;
  private _operation: CrudOperation;
  private _roleId: string;
  private _flowId: string | null;
  private _flowNodeId: string | null;
  private _how: string | null;
  private _condition: string | null;
  private _description: string | null;

  constructor(props: {
    id: string;
    columnId: string;
    operation: CrudOperation;
    roleId: string;
    flowId?: string | null;
    flowNodeId?: string | null;
    how?: string | null;
    condition?: string | null;
    description?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const now = new Date();
    super(props.id, props.createdAt ?? now, props.updatedAt ?? now);
    this._columnId = props.columnId;
    this._operation = props.operation;
    this._roleId = props.roleId;
    this._flowId = props.flowId ?? null;
    this._flowNodeId = props.flowNodeId ?? null;
    this._how = props.how ?? null;
    this._condition = props.condition ?? null;
    this._description = props.description ?? null;
  }

  get columnId(): string {
    return this._columnId;
  }

  get operation(): CrudOperation {
    return this._operation;
  }

  get roleId(): string {
    return this._roleId;
  }

  get flowId(): string | null {
    return this._flowId;
  }

  get flowNodeId(): string | null {
    return this._flowNodeId;
  }

  get how(): string | null {
    return this._how;
  }

  get condition(): string | null {
    return this._condition;
  }

  get description(): string | null {
    return this._description;
  }

  get isLinkedToFlow(): boolean {
    return this._flowId !== null;
  }

  get isLinkedToNode(): boolean {
    return this._flowNodeId !== null;
  }

  updateOperation(operation: CrudOperation): void {
    this._operation = operation;
  }

  updateRole(roleId: string): void {
    if (!roleId) {
      throw new ValidationError('Role ID is required');
    }
    this._roleId = roleId;
  }

  linkToFlow(flowId: string | null, flowNodeId: string | null): void {
    this._flowId = flowId;
    this._flowNodeId = flowNodeId;
  }

  updateHow(how: string | null): void {
    this._how = how;
  }

  updateCondition(condition: string | null): void {
    this._condition = condition;
  }

  updateDescription(description: string | null): void {
    this._description = description;
  }

  static create(props: {
    id: string;
    columnId: string;
    operation: CrudOperation;
    roleId: string;
    flowId?: string | null;
    flowNodeId?: string | null;
    how?: string | null;
    condition?: string | null;
    description?: string | null;
  }): CrudMapping {
    if (!props.columnId) {
      throw new ValidationError('Column ID is required');
    }
    if (!props.roleId) {
      throw new ValidationError('Role ID is required');
    }
    return new CrudMapping(props);
  }
}

