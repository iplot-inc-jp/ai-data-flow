import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export type RoleType = 'HUMAN' | 'SYSTEM' | 'OTHER';

export interface CreateRoleProps {
  projectId: string;
  name: string;
  type: RoleType;
  description?: string | null;
  color?: string | null;
}

export interface ReconstructRoleProps {
  id: string;
  projectId: string;
  name: string;
  type: RoleType;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ロールエンティティ
 * 業務フローの担当者（人/システム/その他）
 */
export class Role extends BaseEntity {
  private readonly _projectId: string;
  private _name: string;
  private _type: RoleType;
  private _description: string | null;
  private _color: string | null;

  private constructor(
    id: string,
    projectId: string,
    name: string,
    type: RoleType,
    description: string | null,
    color: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._name = name;
    this._type = type;
    this._description = description;
    this._color = color;
  }

  /**
   * 新規ロール作成
   */
  static create(props: CreateRoleProps, id: string): Role {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const name = props.name?.trim();
    if (!name || name.length < 1) {
      throw new ValidationError('Role name is required');
    }
    if (name.length > 50) {
      throw new ValidationError('Role name must be at most 50 characters');
    }

    if (!['HUMAN', 'SYSTEM', 'OTHER'].includes(props.type)) {
      throw new ValidationError('Invalid role type');
    }

    const color = props.color ? Role.validateColor(props.color) : null;

    const now = new Date();
    return new Role(
      id,
      props.projectId,
      name,
      props.type,
      props.description?.trim() || null,
      color,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructRoleProps): Role {
    return new Role(
      props.id,
      props.projectId,
      props.name,
      props.type,
      props.description,
      props.color,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  private static validateColor(color: string): string {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexColorRegex.test(color)) {
      throw new ValidationError('Color must be a valid hex color (e.g., #3B82F6)');
    }
    return color.toUpperCase();
  }

  changeName(name: string): void {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new ValidationError('Role name is required');
    }
    if (trimmed.length > 50) {
      throw new ValidationError('Role name must be at most 50 characters');
    }
    this._name = trimmed;
    this.touch();
  }

  changeType(type: RoleType): void {
    if (!['HUMAN', 'SYSTEM', 'OTHER'].includes(type)) {
      throw new ValidationError('Invalid role type');
    }
    this._type = type;
    this.touch();
  }

  changeDescription(description: string | null): void {
    this._description = description?.trim() || null;
    this.touch();
  }

  changeColor(color: string | null): void {
    this._color = color ? Role.validateColor(color) : null;
    this.touch();
  }

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get name(): string {
    return this._name;
  }

  get type(): RoleType {
    return this._type;
  }

  get description(): string | null {
    return this._description;
  }

  get color(): string | null {
    return this._color;
  }

  /**
   * ロールが人間かどうか
   */
  isHuman(): boolean {
    return this._type === 'HUMAN';
  }

  /**
   * ロールがシステムかどうか
   */
  isSystem(): boolean {
    return this._type === 'SYSTEM';
  }
}

