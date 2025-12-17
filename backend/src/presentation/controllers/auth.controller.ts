import { Controller, Post, Body, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  RegisterUserUseCase,
  LoginUserUseCase,
  GetCurrentUserUseCase,
} from '../../application';
import {
  RegisterRequestDto,
  RegisterResponseDto,
  LoginRequestDto,
  LoginResponseDto,
} from '../dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';

@ApiTags('認証')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUserUseCase: RegisterUserUseCase,
    private readonly loginUserUseCase: LoginUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'ユーザー登録' })
  @ApiResponse({ status: 201, description: '登録成功', type: RegisterResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 409, description: 'メールアドレスが既に使用されています' })
  async register(@Body() dto: RegisterRequestDto): Promise<RegisterResponseDto> {
    const result = await this.registerUserUseCase.execute({
      email: dto.email,
      password: dto.password,
      name: dto.name,
    });
    return result;
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ログイン' })
  @ApiResponse({ status: 200, description: 'ログイン成功', type: LoginResponseDto })
  @ApiResponse({ status: 401, description: '認証エラー' })
  async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    const result = await this.loginUserUseCase.execute({
      email: dto.email,
      password: dto.password,
    });
    return result;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '現在のユーザー情報取得' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 401, description: '認証エラー' })
  async getCurrentUser(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.getCurrentUserUseCase.execute({
      userId: user.id,
    });
    return result;
  }
}

