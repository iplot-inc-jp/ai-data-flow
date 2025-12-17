import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * プロジェクト作成リクエストDTO
 */
export class CreateProjectRequestDto {
  @ApiProperty({ example: 'ECサイト', description: 'プロジェクト名' })
  @IsString()
  @MinLength(2, { message: 'プロジェクト名は2文字以上で入力してください' })
  @MaxLength(100, { message: 'プロジェクト名は100文字以内で入力してください' })
  name: string;

  @ApiProperty({ example: 'ec-site', description: 'スラッグ（URL用識別子）' })
  @IsString()
  @MinLength(2, { message: 'スラッグは2文字以上で入力してください' })
  @MaxLength(100, { message: 'スラッグは100文字以内で入力してください' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'スラッグは英小文字、数字、ハイフンのみ使用できます',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'ECサイトの業務フロー管理', description: '説明' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '説明は500文字以内で入力してください' })
  description?: string;
}

/**
 * プロジェクトレスポンスDTO
 */
export class ProjectResponseDto {
  @ApiProperty({ example: 'uuid-xxxx-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-org-xxxx' })
  organizationId: string;

  @ApiProperty({ example: 'ECサイト' })
  name: string;

  @ApiProperty({ example: 'ec-site' })
  slug: string;

  @ApiProperty({ example: 'ECサイトの業務フロー管理', nullable: true })
  description: string | null;
}

