import { Inject, Injectable } from '@nestjs/common';
import {
  GapItem,
  GapPriority,
  GapStatus,
  IGapItemRepository,
  GAP_ITEM_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateGapItemInput {
  userId: string;
  projectId: string;
  phaseId?: string | null;
  businessArea: string;
  asisDescription?: string | null;
  tobeDescription?: string | null;
  gapDescription?: string | null;
  priority?: GapPriority;
  ownerName?: string | null;
  order?: number;
  asisFlowId?: string | null;
  asisNodeId?: string | null;
  tobeFlowId?: string | null;
  tobeNodeId?: string | null;
  issueTreeId?: string | null;
}

export interface GapItemOutput {
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
  asisFlowId: string | null;
  asisNodeId: string | null;
  tobeFlowId: string | null;
  tobeNodeId: string | null;
  issueTreeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toGapItemOutput(gapItem: GapItem): GapItemOutput {
  return {
    id: gapItem.id,
    projectId: gapItem.projectId,
    phaseId: gapItem.phaseId,
    businessArea: gapItem.businessArea,
    asisDescription: gapItem.asisDescription,
    tobeDescription: gapItem.tobeDescription,
    gapDescription: gapItem.gapDescription,
    priority: gapItem.priority,
    status: gapItem.status,
    ownerName: gapItem.ownerName,
    order: gapItem.order,
    asisFlowId: gapItem.asisFlowId,
    asisNodeId: gapItem.asisNodeId,
    tobeFlowId: gapItem.tobeFlowId,
    tobeNodeId: gapItem.tobeNodeId,
    issueTreeId: gapItem.issueTreeId,
    createdAt: gapItem.createdAt,
    updatedAt: gapItem.updatedAt,
  };
}

/**
 * GAP作成ユースケース
 */
@Injectable()
export class CreateGapItemUseCase {
  constructor(
    @Inject(GAP_ITEM_REPOSITORY)
    private readonly gapItemRepository: IGapItemRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateGapItemInput): Promise<GapItemOutput> {
    // 1. プロジェクト存在確認
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    // 2. 組織メンバー確認
    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 3. ID生成
    const id = this.gapItemRepository.generateId();

    // 4. エンティティ生成
    const gapItem = GapItem.create(
      {
        projectId: input.projectId,
        phaseId: input.phaseId,
        businessArea: input.businessArea,
        asisDescription: input.asisDescription,
        tobeDescription: input.tobeDescription,
        gapDescription: input.gapDescription,
        priority: input.priority,
        ownerName: input.ownerName,
        order: input.order,
        asisFlowId: input.asisFlowId,
        asisNodeId: input.asisNodeId,
        tobeFlowId: input.tobeFlowId,
        tobeNodeId: input.tobeNodeId,
        issueTreeId: input.issueTreeId,
      },
      id,
    );

    // 5. 永続化
    await this.gapItemRepository.save(gapItem);

    // 6. 出力返却
    return toGapItemOutput(gapItem);
  }
}
