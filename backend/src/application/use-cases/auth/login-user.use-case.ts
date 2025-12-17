import { Inject, Injectable } from '@nestjs/common';
import {
  UserRepository,
  USER_REPOSITORY,
  PasswordHashService,
  PASSWORD_HASH_SERVICE,
  TokenService,
  TOKEN_SERVICE,
  UnauthorizedError,
} from '../../../domain';

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface LoginUserOutput {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * ユーザーログインユースケース
 */
@Injectable()
export class LoginUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(PASSWORD_HASH_SERVICE)
    private readonly passwordHashService: PasswordHashService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: LoginUserInput): Promise<LoginUserOutput> {
    // 1. ユーザー検索
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // 2. パスワード検証
    const isValid = await this.passwordHashService.compare(
      input.password,
      user.password,
    );
    if (!isValid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // 3. トークン生成
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
    });

    // 4. 出力返却
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

