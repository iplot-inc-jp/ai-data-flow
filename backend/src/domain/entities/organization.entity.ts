import { BaseEntity } from './base.entity';
import { Slug } from '../value-objects';
import { ValidationError } from '../errors';

export interface CreateOrganizationProps {
  name: string;
  slug: string;
  description?: string | null;
}

export interface ReconstructOrganizationProps {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 組織エンティティ
 */
export class Organization extends BaseEntity {
  private _name: string;
  private _slug: Slug;
  private _description: string | null;

  private constructor(
    id: string,
    name: string,
    slug: Slug,
    description: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._name = name;
    this._slug = slug;
    this._description = description;
  }

  /**
   * 新規組織作成
   */
  static create(props: CreateOrganizationProps, id: string): Organization {
    const name = props.name?.trim();
    if (!name || name.length < 2) {
      throw new ValidationError('Organization name must be at least 2 characters');
    }
    if (name.length > 100) {
      throw new ValidationError('Organization name must be at most 100 characters');
    }

    const slug = Slug.create(props.slug);
    const description = props.description?.trim() || null;

    const now = new Date();
    return new Organization(id, name, slug, description, now, now);
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructOrganizationProps): Organization {
    return new Organization(
      props.id,
      props.name,
      Slug.reconstruct(props.slug),
      props.description,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  changeName(name: string): void {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < 2) {
      throw new ValidationError('Organization name must be at least 2 characters');
    }
    if (trimmed.length > 100) {
      throw new ValidationError('Organization name must be at most 100 characters');
    }
    this._name = trimmed;
    this.touch();
  }

  changeDescription(description: string | null): void {
    this._description = description?.trim() || null;
    this.touch();
  }

  // ========== Getter ==========

  get name(): string {
    return this._name;
  }

  get slug(): string {
    return this._slug.value;
  }

  get slugVO(): Slug {
    return this._slug;
  }

  get description(): string | null {
    return this._description;
  }
}

