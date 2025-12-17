import { Inject, Injectable } from '@nestjs/common';
import {
  User,
  UserRepository,
  USER_REPOSITORY,
  PasswordHashService,
  PASSWORD_HASH_SERVICE,
  TokenService,
  TOKEN_SERVICE,
  EntityAlreadyExistsError,
} from '../../../domain';

export interface RegisterUserInput {
  email: string;
  password: string;
  name?: string;
}

export interface RegisterUserOutput {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * ユーザー登録ユースケース
 * オーケストレーションのみ、ビジネスロジックはドメイン層に委譲
 */
@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASH_SERVICE)
    private readonly passwordHashService: PasswordHashService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    // 1. メールアドレスの重複チェック
    const exists = await this.userRepository.existsByEmail(input.email);
    if (exists) {
      throw new EntityAlreadyExistsError('User', 'email', input.email);
    }

    // 2. パスワードハッシュ化（インフラサービス）
    const hashedPassword = await this.passwordHashService.hash(input.password);

    // 3. ID生成（インフラ）
    const id = this.userRepository.generateId();

    // 4. ユーザーエンティティ生成（ドメインロジック）
    const user = User.create(
      {
        email: input.email,
        password: input.password,
        name: input.name,
      },
      hashedPassword,
      id,
    );

    // 5. 永続化
    await this.userRepository.save(user);

    // 6. トークン生成
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
    });

    // 7. 出力DTO返却
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}

