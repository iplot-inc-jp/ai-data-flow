import { Inject, Injectable } from '@nestjs/common';
import {
  Project,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityAlreadyExistsError,
  ForbiddenError,
} from '../../../domain';

export interface CreateProjectInput {
  userId: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
}

export interface CreateProjectOutput {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * プロジェクト作成ユースケース
 */
@Injectable()
export class CreateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateProjectInput): Promise<CreateProjectOutput> {
    // 1. 組織へのアクセス権確認
    const isMember = await this.organizationRepository.isMember(
      input.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 2. スラッグ重複チェック（組織内）
    const exists = await this.projectRepository.existsByOrganizationIdAndSlug(
      input.organizationId,
      input.slug,
    );
    if (exists) {
      throw new EntityAlreadyExistsError('Project', 'slug', input.slug);
    }

    // 3. ID生成
    const id = this.projectRepository.generateId();

    // 4. プロジェクトエンティティ生成（ドメインロジック）
    const project = Project.create(
      {
        organizationId: input.organizationId,
        name: input.name,
        slug: input.slug,
        description: input.description,
      },
      id,
    );

    // 5. 永続化
    await this.projectRepository.save(project);

    // 6. 出力返却
    return {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
    };
  }
}

