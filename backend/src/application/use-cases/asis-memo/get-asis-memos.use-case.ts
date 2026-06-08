import { Inject, Injectable } from '@nestjs/common';
import {
  IAsisMemoRepository,
  ASIS_MEMO_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import { AsisMemoOutput, toAsisMemoOutput } from './create-asis-memo.use-case';

export interface GetAsisMemosInput {
  userId: string;
  projectId: string;
}

/**
 * ASISメモ一覧取得ユースケース（プロジェクト内、order昇順）
 */
@Injectable()
export class GetAsisMemosUseCase {
  constructor(
    @Inject(ASIS_MEMO_REPOSITORY)
    private readonly asisMemoRepository: IAsisMemoRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetAsisMemosInput): Promise<AsisMemoOutput[]> {
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

    // 3. 一覧取得
    const asisMemos = await this.asisMemoRepository.findByProjectId(
      input.projectId,
    );

    // 4. DTOに変換して返却
    return asisMemos.map((r) => toAsisMemoOutput(r));
  }
}
