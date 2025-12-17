import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 組織作成リクエストDTO
 */
export class CreateOrganizationRequestDto {
  @ApiProperty({ example: 'My Company', description: '組織名' })
  @IsString()
  @MinLength(2, { message: '組織名は2文字以上で入力してください' })
  @MaxLength(100, { message: '組織名は100文字以内で入力してください' })
  name: string;

  @ApiProperty({ example: 'my-company', description: 'スラッグ（URL用識別子）' })
  @IsString()
  @MinLength(2, { message: 'スラッグは2文字以上で入力してください' })
  @MaxLength(100, { message: 'スラッグは100文字以内で入力してください' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'スラッグは英小文字、数字、ハイフンのみ使用できます',
  })
  slug: string;

  @ApiPropertyOptional({ example: '会社の説明', description: '説明' })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '説明は500文字以内で入力してください' })
  description?: string;
}

/**
 * 組織レスポンスDTO
 */
export class OrganizationResponseDto {
  @ApiProperty({ example: 'uuid-xxxx-xxxx' })
  id: string;

  @ApiProperty({ example: 'My Company' })
  name: string;

  @ApiProperty({ example: 'my-company' })
  slug: string;

  @ApiProperty({ example: '会社の説明', nullable: true })
  description: string | null;
}

