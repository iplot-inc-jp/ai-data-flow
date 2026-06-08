import { Inject, Injectable } from '@nestjs/common';
import {
  AsisMemo,
  IAsisMemoRepository,
  ASIS_MEMO_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface CreateAsisMemoInput {
  userId: string;
  projectId: string;
  topic?: string | null;
  currentState?: string | null;
  pain?: string | null;
  restriction?: string | null;
  note?: string | null;
  order?: number;
}

export interface AsisMemoOutput {
  id: string;
  projectId: string;
  topic: string | null;
  currentState: string | null;
  pain: string | null;
  restriction: string | null;
  note: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toAsisMemoOutput(asisMemo: AsisMemo): AsisMemoOutput {
  return {
    id: asisMemo.id,
    projectId: asisMemo.projectId,
    topic: asisMemo.topic,
    currentState: asisMemo.currentState,
    pain: asisMemo.pain,
    restriction: asisMemo.restriction,
    note: asisMemo.note,
    order: asisMemo.order,
    createdAt: asisMemo.createdAt,
    updatedAt: asisMemo.updatedAt,
  };
}

/**
 * ASISメモ作成ユースケース
 */
@Injectable()
export class CreateAsisMemoUseCase {
  constructor(
    @Inject(ASIS_MEMO_REPOSITORY)
    private readonly asisMemoRepository: IAsisMemoRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateAsisMemoInput): Promise<AsisMemoOutput> {
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
    const id = this.asisMemoRepository.generateId();

    // 4. エンティティ生成
    const asisMemo = AsisMemo.create(
      {
        projectId: input.projectId,
        topic: input.topic,
        currentState: input.currentState,
        pain: input.pain,
        restriction: input.restriction,
        note: input.note,
        order: input.order,
      },
      id,
    );

    // 5. 永続化
    await this.asisMemoRepository.save(asisMemo);

    // 6. 出力返却
    return toAsisMemoOutput(asisMemo);
  }
}
