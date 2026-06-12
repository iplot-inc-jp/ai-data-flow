import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

/**
 * GAP優先度（Prisma enum GapPriority と一致）
 */
export type GapPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * GAPステータス（Prisma enum GapStatus と一致）
 */
export type GapStatus = 'OPEN' | 'RESOLVED';

export interface CreateGapItemProps {
  projectId: string;
  phaseId?: string | null;
  businessArea: string;
  asisDescription?: string | null;
  tobeDescription?: string | null;
  gapDescription?: string | null;
  priority?: GapPriority;
  status?: GapStatus;
  ownerName?: string | null;
  order?: number;
  outOfScope?: boolean;
  asisFlowId?: string | null;
  asisNodeId?: string | null;
  tobeFlowId?: string | null;
  tobeNodeId?: string | null;
  issueTreeId?: string | null;
}

export interface ReconstructGapItemProps {
  id: string;
  projectId: string;
  phaseId: string | null;
  businessArea: string;
  asisDescription: string | null;
  tobeDescription: string | null;
  gapDescription: string | null;
  priority: GapPriority;
  status: GapStatus;
  ownerName: string | null;
  order: number;
  outOfScope: boolean;
  asisFlowId: string | null;
  asisNodeId: string | null;
  tobeFlowId: string | null;
  tobeNodeId: string | null;
  issueTreeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GapItem エンティティ
 * ASIS↔TOBE の差分（＝本当の課題）を表現し、SOLUTION型 IssueTree（打ち手）で改善される
 */
export class GapItem extends BaseEntity {
  private readonly _projectId: string;
  private _phaseId: string | null;
  private _businessArea: string;
  private _asisDescription: string | null;
  private _tobeDescription: string | null;
  private _gapDescription: string | null;
  private _priority: GapPriority;
  private _status: GapStatus;
  private _ownerName: string | null;
  private _order: number;
  private _outOfScope: boolean;
  private _asisFlowId: string | null;
  private _asisNodeId: string | null;
  private _tobeFlowId: string | null;
  private _tobeNodeId: string | null;
  private _issueTreeId: string | null;

  private constructor(
    id: string,
    projectId: string,
    phaseId: string | null,
    businessArea: string,
    asisDescription: string | null,
    tobeDescription: string | null,
    gapDescription: string | null,
    priority: GapPriority,
    status: GapStatus,
    ownerName: string | null,
    order: number,
    outOfScope: boolean,
    asisFlowId: string | null,
    asisNodeId: string | null,
    tobeFlowId: string | null,
    tobeNodeId: string | null,
    issueTreeId: string | null,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._phaseId = phaseId;
    this._businessArea = businessArea;
    this._asisDescription = asisDescription;
    this._tobeDescription = tobeDescription;
    this._gapDescription = gapDescription;
    this._priority = priority;
    this._status = status;
    this._ownerName = ownerName;
    this._order = order;
    this._outOfScope = outOfScope;
    this._asisFlowId = asisFlowId;
    this._asisNodeId = asisNodeId;
    this._tobeFlowId = tobeFlowId;
    this._tobeNodeId = tobeNodeId;
    this._issueTreeId = issueTreeId;
  }

  /**
   * 新規GAP作成
   */
  static create(props: CreateGapItemProps, id: string): GapItem {
    if (!props.projectId) {
      throw new ValidationError('Project ID is required');
    }

    const businessArea = props.businessArea?.trim();
    if (!businessArea || businessArea.length < 1) {
      throw new ValidationError('Business area is required');
    }
    if (businessArea.length > 200) {
      throw new ValidationError('Business area must be at most 200 characters');
    }

    const now = new Date();
    return new GapItem(
      id,
      props.projectId,
      props.phaseId ?? null,
      businessArea,
      props.asisDescription?.trim() || null,
      props.tobeDescription?.trim() || null,
      props.gapDescription?.trim() || null,
      props.priority ?? 'MEDIUM',
      props.status ?? 'OPEN',
      props.ownerName?.trim() || null,
      props.order ?? 0,
      props.outOfScope ?? false,
      props.asisFlowId ?? null,
      props.asisNodeId ?? null,
      props.tobeFlowId ?? null,
      props.tobeNodeId ?? null,
      props.issueTreeId ?? null,
      now,
      now,
    );
  }

  /**
   * DBからの再構築
   */
  static reconstruct(props: ReconstructGapItemProps): GapItem {
    return new GapItem(
      props.id,
      props.projectId,
      props.phaseId,
      props.businessArea,
      props.asisDescription,
      props.tobeDescription,
      props.gapDescription,
      props.priority,
      props.status,
      props.ownerName,
      props.order,
      props.outOfScope,
      props.asisFlowId,
      props.asisNodeId,
      props.tobeFlowId,
      props.tobeNodeId,
      props.issueTreeId,
      props.createdAt,
      props.updatedAt,
    );
  }

  // ========== ビジネスロジック ==========

  changeBusinessArea(businessArea: string): void {
    const trimmed = businessArea?.trim();
    if (!trimmed || trimmed.length < 1) {
      throw new ValidationError('Business area is required');
    }
    if (trimmed.length > 200) {
      throw new ValidationError('Business area must be at most 200 characters');
    }
    this._businessArea = trimmed;
    this.touch();
  }

  changeOwnerName(ownerName: string | null): void {
    this._ownerName = ownerName?.trim() || null;
    this.touch();
  }

  changePhase(phaseId: string | null): void {
    this._phaseId = phaseId ?? null;
    this.touch();
  }

  updateDescriptions(descriptions: {
    asis?: string | null;
    tobe?: string | null;
    gap?: string | null;
  }): void {
    if (descriptions.asis !== undefined) {
      this._asisDescription = descriptions.asis?.trim() || null;
    }
    if (descriptions.tobe !== undefined) {
      this._tobeDescription = descriptions.tobe?.trim() || null;
    }
    if (descriptions.gap !== undefined) {
      this._gapDescription = descriptions.gap?.trim() || null;
    }
    this.touch();
  }

  setPriority(priority: GapPriority): void {
    this._priority = priority;
    this.touch();
  }

  resolve(): void {
    this._status = 'RESOLVED';
    this.touch();
  }

  reopen(): void {
    this._status = 'OPEN';
    this.touch();
  }

  linkAsis(flowId: string | null, nodeId?: string | null): void {
    this._asisFlowId = flowId ?? null;
    this._asisNodeId = nodeId ?? null;
    this.touch();
  }

  linkTobe(flowId: string | null, nodeId?: string | null): void {
    this._tobeFlowId = flowId ?? null;
    this._tobeNodeId = nodeId ?? null;
    this.touch();
  }

  linkIssueTree(treeId: string | null): void {
    this._issueTreeId = treeId ?? null;
    this.touch();
  }

  reorder(order: number): void {
    this._order = order;
    this.touch();
  }

  setOutOfScope(outOfScope: boolean): void {
    this._outOfScope = outOfScope;
    this.touch();
  }

  // ========== Getter ==========

  get projectId(): string {
    return this._projectId;
  }

  get phaseId(): string | null {
    return this._phaseId;
  }

  get businessArea(): string {
    return this._businessArea;
  }

  get asisDescription(): string | null {
    return this._asisDescription;
  }

  get tobeDescription(): string | null {
    return this._tobeDescription;
  }

  get gapDescription(): string | null {
    return this._gapDescription;
  }

  get priority(): GapPriority {
    return this._priority;
  }

  get status(): GapStatus {
    return this._status;
  }

  get ownerName(): string | null {
    return this._ownerName;
  }

  get order(): number {
    return this._order;
  }

  get outOfScope(): boolean {
    return this._outOfScope;
  }

  get asisFlowId(): string | null {
    return this._asisFlowId;
  }

  get asisNodeId(): string | null {
    return this._asisNodeId;
  }

  get tobeFlowId(): string | null {
    return this._tobeFlowId;
  }

  get tobeNodeId(): string | null {
    return this._tobeNodeId;
  }

  get issueTreeId(): string | null {
    return this._issueTreeId;
  }
}
