import { IsString, MinLength, MaxLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RoleTypeDto {
  HUMAN = 'HUMAN',
  SYSTEM = 'SYSTEM',
  OTHER = 'OTHER',
}

/**
 * ロール作成リクエストDTO
 */
export class CreateRoleRequestDto {
  @ApiProperty({ example: '管理者', description: 'ロール名' })
  @IsString()
  @MinLength(1, { message: 'ロール名は必須です' })
  @MaxLength(50, { message: 'ロール名は50文字以内で入力してください' })
  name: string;

  @ApiProperty({
    enum: RoleTypeDto,
    example: 'HUMAN',
    description: 'ロールタイプ（HUMAN: 人、SYSTEM: システム、OTHER: その他）',
  })
  @IsEnum(RoleTypeDto, { message: 'タイプはHUMAN, SYSTEM, OTHERのいずれかを指定してください' })
  type: RoleTypeDto;

  @ApiPropertyOptional({ example: 'システム管理者', description: '説明' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '説明は200文字以内で入力してください' })
  description?: string;

  @ApiPropertyOptional({ example: '#3B82F6', description: 'カラー（HEX形式）' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'カラーは#RRGGBB形式で入力してください',
  })
  color?: string;
}

/**
 * ロールレスポンスDTO
 */
export class RoleResponseDto {
  @ApiProperty({ example: 'uuid-xxxx-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-project-xxxx' })
  projectId: string;

  @ApiProperty({ example: '管理者' })
  name: string;

  @ApiProperty({ enum: RoleTypeDto, example: 'HUMAN' })
  type: RoleTypeDto;

  @ApiProperty({ example: 'システム管理者', nullable: true })
  description: string | null;

  @ApiProperty({ example: '#3B82F6', nullable: true })
  color: string | null;
}

