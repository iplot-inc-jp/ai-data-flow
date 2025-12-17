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
  order: number;
  laneHeight: number;
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
    // 1. ロール一覧取得（orderでソート）
    const roles = await this.roleRepository.findByProjectId(input.projectId);

    // 2. orderでソートしてDTOに変換して返却
    return roles
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((role) => ({
        id: role.id,
        projectId: role.projectId,
        name: role.name,
        type: role.type,
        description: role.description,
        color: role.color,
        order: role.order ?? 0,
        laneHeight: role.laneHeight ?? 120,
      }));
  }
}

