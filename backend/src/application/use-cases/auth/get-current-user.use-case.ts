import { Inject, Injectable } from '@nestjs/common';
import {
  UserRepository,
  USER_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
} from '../../../domain';

export interface GetCurrentUserInput {
  userId: string;
}

export interface GetCurrentUserOutput {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  organizations: {
    id: string;
    name: string;
    slug: string;
    role: string;
  }[];
}

/**
 * 現在のユーザー情報取得ユースケース
 */
@Injectable()
export class GetCurrentUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetCurrentUserInput): Promise<GetCurrentUserOutput> {
    // 1. ユーザー取得
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new EntityNotFoundError('User', input.userId);
    }

    // 2. 所属組織取得
    const organizations = await this.organizationRepository.findByUserId(user.id);

    // 3. 各組織のロールを取得
    const orgsWithRoles = await Promise.all(
      organizations.map(async (org) => {
        const role = await this.organizationRepository.getMemberRole(org.id, user.id);
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: role || 'MEMBER',
        };
      }),
    );

    // 4. 出力返却
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      organizations: orgsWithRoles,
    };
  }
}

