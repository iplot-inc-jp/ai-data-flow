import { Inject, Injectable } from '@nestjs/common';
import {
  TobeVision,
  ITobeVisionRepository,
  TOBE_VISION_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  IBusinessFlowRepository,
  BUSINESS_FLOW_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../../domain';

/**
 * asisFlowId が指定された場合、その業務フローが
 * 「存在し・同一プロジェクトに属し・kind === 'ASIS'」であることを検証する。
 * null/未指定（紐づけ解除）はスキップ。
 */
export async function assertAsisFlowBelongsToProject(
  businessFlowRepository: IBusinessFlowRepository,
  asisFlowId: string | null | undefined,
  projectId: string,
): Promise<void> {
  if (!asisFlowId) return;
  const flow = await businessFlowRepository.findById(asisFlowId);
  if (!flow) {
    throw new EntityNotFoundError('BusinessFlow', asisFlowId);
  }
  if (flow.projectId !== projectId) {
    throw new ValidationError(
      'asisFlowId must reference a business flow in the same project',
    );
  }
  if (flow.kind !== 'ASIS') {
    throw new ValidationError('asisFlowId must reference an ASIS business flow');
  }
}

export interface CreateTobeVisionInput {
  userId: string;
  projectId: string;
  area?: string | null;
  vision?: string | null;
  countermeasure?: string | null;
  effect?: string | null;
  order?: number;
  subProjectId?: string | null;
  asisFlowId?: string | null;
}

export interface TobeVisionOutput {
  id: string;
  projectId: string;
  area: string | null;
  vision: string | null;
  countermeasure: string | null;
  effect: string | null;
  order: number;
  subProjectId: string | null;
  asisFlowId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toTobeVisionOutput(tobeVision: TobeVision): TobeVisionOutput {
  return {
    id: tobeVision.id,
    projectId: tobeVision.projectId,
    area: tobeVision.area,
    vision: tobeVision.vision,
    countermeasure: tobeVision.countermeasure,
    effect: tobeVision.effect,
    order: tobeVision.order,
    subProjectId: tobeVision.subProjectId,
    asisFlowId: tobeVision.asisFlowId,
    createdAt: tobeVision.createdAt,
    updatedAt: tobeVision.updatedAt,
  };
}

/**
 * TOBEビジョン作成ユースケース
 */
@Injectable()
export class CreateTobeVisionUseCase {
  constructor(
    @Inject(TOBE_VISION_REPOSITORY)
    private readonly tobeVisionRepository: ITobeVisionRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
    @Inject(BUSINESS_FLOW_REPOSITORY)
    private readonly businessFlowRepository: IBusinessFlowRepository,
  ) {}

  async execute(input: CreateTobeVisionInput): Promise<TobeVisionOutput> {
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

    // 2.5 asisFlowId 整合性確認（同一プロジェクトの ASIS フローのみ許可）
    await assertAsisFlowBelongsToProject(
      this.businessFlowRepository,
      input.asisFlowId,
      input.projectId,
    );

    // 3. ID生成
    const id = this.tobeVisionRepository.generateId();

    // 4. エンティティ生成
    const tobeVision = TobeVision.create(
      {
        projectId: input.projectId,
        area: input.area,
        vision: input.vision,
        countermeasure: input.countermeasure,
        effect: input.effect,
        order: input.order,
        subProjectId: input.subProjectId,
        asisFlowId: input.asisFlowId,
      },
      id,
    );

    // 5. 永続化
    await this.tobeVisionRepository.save(tobeVision);

    // 6. 出力返却
    return toTobeVisionOutput(tobeVision);
  }
}
