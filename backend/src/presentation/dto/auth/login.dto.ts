import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * ログインリクエストDTO
 */
export class LoginRequestDto {
  @ApiProperty({ example: 'user@example.com', description: 'メールアドレス' })
  @IsEmail({}, { message: '有効なメールアドレスを入力してください' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'パスワード' })
  @IsString()
  @MinLength(1, { message: 'パスワードを入力してください' })
  password: string;
}

/**
 * ログインレスポンスDTO
 */
export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({
    example: { id: 'uuid-xxxx', email: 'user@example.com', name: '山田太郎' },
  })
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

