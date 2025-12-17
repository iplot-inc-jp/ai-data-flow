import { Inject, Injectable } from '@nestjs/common';
import {
  Role,
  RoleType,
  RoleRepository,
  ROLE_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  EntityAlreadyExistsError,
  EntityNotFoundError,
} from '../../../domain';

export interface CreateRoleInput {
  projectId: string;
  name: string;
  type: RoleType;
  description?: string;
  color?: string;
}

export interface CreateRoleOutput {
  id: string;
  projectId: string;
  name: string;
  type: RoleType;
  description: string | null;
  color: string | null;
}

/**
 * ロール作成ユースケース
 */
@Injectable()
export class CreateRoleUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async execute(input: CreateRoleInput): Promise<CreateRoleOutput> {
    // 1. プロジェクト存在確認
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    // 2. 名前重複チェック（プロジェクト内）
    const exists = await this.roleRepository.existsByProjectIdAndName(
      input.projectId,
      input.name,
    );
    if (exists) {
      throw new EntityAlreadyExistsError('Role', 'name', input.name);
    }

    // 3. ID生成
    const id = this.roleRepository.generateId();

    // 4. ロールエンティティ生成（ドメインロジック）
    const role = Role.create(
      {
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        description: input.description,
        color: input.color,
      },
      id,
    );

    // 5. 永続化
    await this.roleRepository.save(role);

    // 6. 出力返却
    return {
      id: role.id,
      projectId: role.projectId,
      name: role.name,
      type: role.type,
      description: role.description,
      color: role.color,
    };
  }
}

