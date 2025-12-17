import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * ユーザー登録リクエストDTO
 */
export class RegisterRequestDto {
  @ApiProperty({ example: 'user@example.com', description: 'メールアドレス' })
  @IsEmail({}, { message: '有効なメールアドレスを入力してください' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'パスワード（8文字以上）' })
  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上で入力してください' })
  @MaxLength(100, { message: 'パスワードは100文字以内で入力してください' })
  password: string;

  @ApiPropertyOptional({ example: '山田太郎', description: '名前' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '名前は100文字以内で入力してください' })
  name?: string;
}

/**
 * ユーザー登録レスポンスDTO
 */
export class RegisterResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({
    example: { id: 'uuid-xxxx-xxxx', email: 'user@example.com', name: '山田太郎' },
  })
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

