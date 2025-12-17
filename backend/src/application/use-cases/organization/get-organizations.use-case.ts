import { Inject, Injectable } from '@nestjs/common';
import {
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../../../domain';

export interface GetOrganizationsInput {
  userId: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

/**
 * ユーザーの組織一覧取得ユースケース
 */
@Injectable()
export class GetOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetOrganizationsInput): Promise<OrganizationDto[]> {
    // 1. ユーザーの組織一覧取得
    const organizations = await this.organizationRepository.findByUserId(input.userId);

    // 2. DTOに変換して返却
    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
    }));
  }
}

