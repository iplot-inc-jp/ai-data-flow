import { Inject, Injectable } from '@nestjs/common';
import {
  RoleType,
  RoleRepository,
  ROLE_REPOSITORY,
} from '../../../domain';

export interface GetRolesInput {
  projectId: string;
}

export interface RoleDto {
  id: string;
  projectId: string;
  name: string;
  type: RoleType;
  description: string | null;
  color: string | null;
}

/**
 * ロール一覧取得ユースケース
 */
@Injectable()
export class GetRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
  ) {}

  async execute(input: GetRolesInput): Promise<RoleDto[]> {
    // 1. ロール一覧取得
    const roles = await this.roleRepository.findByProjectId(input.projectId);

    // 2. DTOに変換して返却
    return roles.map((role) => ({
      id: role.id,
      projectId: role.projectId,
      name: role.name,
      type: role.type,
      description: role.description,
      color: role.color,
    }));
  }
}

