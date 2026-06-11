import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface CreateRoadmapPhaseProps {
  projectId: string;
  name: string;
  legacyKey?: string | null;
  order?: number;
}

export interface ReconstructRoadmapPhaseProps {
  id: string;
  projectId: string;
  name: string;
  legacyKey: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ロードマップフェーズエンティティ
 * ロードマップ（カンバン）の列マスタ。プロジェクトごとに追加・改名・並べ替え可能。
 * legacyKey は旧固定3フェーズ（'Q'|'P2'|'P3'）との互換キーで、作成後は変更不可。
 */
export class RoadmapPhase extends BaseEntity {
  private readonly _projectId: string;
  private _name: string;
  private readonly _legacyKey: string | null;
  private _order: number;

  private constructor(
    id: string,
    projectId: string,
    name: string,
    legacyKey: string | null,
    order: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._name = name;
    this._legacyKey = legacyKey;
    this._order = order;
  }

  static create(props: CreateRoadmapPhaseProps, id: string): RoadmapPhase {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }
    const name = props.name?.trim();
    if (!name || name.length < 1) {
      throw new ValidationError('Roadmap phase name is required');
    }
    if (name.length > 200) {
      throw new ValidationError('Roadmap phase name must be at most 200 characters');
    }
    const now = new Date();
    return new RoadmapPhase(
      id,
      props.projectId,
      name,
      props.legacyKey ?? null,
      props.order ?? 0,
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructRoadmapPhaseProps): RoadmapPhase {
    return new RoadmapPhase(
      props.id,
      props.projectId,
      props.name,
      props.legacyKey,
      props.order,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  update(props: { name?: string; order?: number }): void {
    if (props.name !== undefined) {
      const trimmed = props.name?.trim();
      if (!trimmed || trimmed.length < 1) {
        throw new ValidationError('Roadmap phase name is required');
      }
      if (trimmed.length > 200) {
        throw new ValidationError('Roadmap phase name must be at most 200 characters');
      }
      this._name = trimmed;
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

  get legacyKey(): string | null {
    return this._legacyKey;
  }

  get order(): number {
    return this._order;
  }
}
