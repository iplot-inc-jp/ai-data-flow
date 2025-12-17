import { Inject, Injectable } from '@nestjs/common';
import {
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  ForbiddenError,
} from '../../../domain';

export interface GetProjectsInput {
  userId: string;
  organizationId: string;
}

export interface ProjectDto {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * プロジェクト一覧取得ユースケース
 */
@Injectable()
export class GetProjectsUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetProjectsInput): Promise<ProjectDto[]> {
    // 1. 組織へのアクセス権確認
    const isMember = await this.organizationRepository.isMember(
      input.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 2. プロジェクト一覧取得
    const projects = await this.projectRepository.findByOrganizationId(
      input.organizationId,
    );

    // 3. DTOに変換して返却
    return projects.map((project) => ({
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
    }));
  }
}

