import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateReportTypeProps {
  projectId: string;
  name: string;
  description?: string | null;
  order?: number;
}

export interface ReconstructReportTypeProps {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 帳票種別エンティティ
 * DFDのデータフローが参照する帳票の種別。具体帳票ファイルは Attachment.reportTypeId で紐づく。
 */
export class ReportType extends BaseEntity {
  private readonly _projectId: string;
  private _name: string;
  private _description: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    name: string,
    description: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._name = name;
    this._description = description;
    this._order = order;
  }

  static create(props: CreateReportTypeProps, id: string): ReportType {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }
    const name = props.name?.trim();
    if (!name || name.length < 1) {
      throw new ValidationError('Report type name is required');
    }
    if (name.length > 200) {
      throw new ValidationError('Report type name must be at most 200 characters');
    }
    const now = new Date();
    return new ReportType(
      id,
      props.projectId,
      name,
      props.description ?? null,
      props.order ?? 0,
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructReportTypeProps): ReportType {
    return new ReportType(
      props.id,
      props.projectId,
      props.name,
      props.description,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: { name?: string; description?: string | null; order?: number }): void {
    if (props.name !== undefined) {
      const trimmed = props.name?.trim();
      if (!trimmed || trimmed.length < 1) {
        throw new ValidationError('Report type name is required');
      }
      if (trimmed.length > 200) {
        throw new ValidationError('Report type name must be at most 200 characters');
      }
      this._name = trimmed;
    }
    if (props.description !== undefined) {
      this._description = props.description ?? null;
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

  get name(): string {
    return this._name;
  }

  get description(): string | null {
    return this._description;
  }

  get order(): number {
    return this._order;
  }
}
