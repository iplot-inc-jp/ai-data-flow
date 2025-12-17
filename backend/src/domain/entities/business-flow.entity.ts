import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors/domain.error';

export class BusinessFlow extends BaseEntity {
  private _projectId: string;
  private _name: string;
  private _description: string | null;
  private _version: number;
  private _parentId: string | null;
  private _depth: number;

  constructor(props: {
    id: string;
    projectId: string;
    name: string;
    description?: string | null;
    version?: number;
    parentId?: string | null;
    depth?: number;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const now = new Date();
    super(props.id, props.createdAt ?? now, props.updatedAt ?? now);
    this._projectId = props.projectId;
    this._name = props.name;
    this._description = props.description ?? null;
    this._version = props.version ?? 1;
    this._parentId = props.parentId ?? null;
    this._depth = props.depth ?? 0;
  }

  get projectId(): string {
    return this._projectId;
  }

  get name(): string {
    return this._name;
  }

  get description(): string | null {
    return this._description;
  }

  get version(): number {
    return this._version;
  }

  get parentId(): string | null {
    return this._parentId;
  }

  get depth(): number {
    return this._depth;
  }

  get isRootFlow(): boolean {
    return this._parentId === null;
  }

  get isChildFlow(): boolean {
    return this._parentId !== null;
  }

  updateName(name: string): void {
    if (!name || name.length === 0) {
      throw new ValidationError('Business flow name is required');
    }
    this._name = name;
  }

  updateDescription(description: string | null): void {
    this._description = description;
  }

  incrementVersion(): void {
    this._version += 1;
  }

  setParent(parentId: string | null, depth: number): void {
    this._parentId = parentId;
    this._depth = depth;
  }

  static create(props: {
    id: string;
    projectId: string;
    name: string;
    description?: string | null;
    parentId?: string | null;
    depth?: number;
  }): BusinessFlow {
    if (!props.name || props.name.length === 0) {
      throw new ValidationError('Business flow name is required');
    }
    return new BusinessFlow({
      ...props,
      version: 1,
      depth: props.depth ?? (props.parentId ? 1 : 0),
    });
  }

  static createChildFlow(props: {
    id: string;
    projectId: string;
    name: string;
    description?: string | null;
    parentId: string;
    parentDepth: number;
  }): BusinessFlow {
    return new BusinessFlow({
      id: props.id,
      projectId: props.projectId,
      name: props.name,
      description: props.description,
      version: 1,
      parentId: props.parentId,
      depth: props.parentDepth + 1,
    });
  }
}

