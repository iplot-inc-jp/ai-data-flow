import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PHASE_KIND_VALUES = [
  'BACKGROUND',
  'ASIS_DATA',
  'HEARING',
  'ISSUE_ANALYSIS',
  'TOBE',
  'PROPOSAL',
  'REQUIREMENTS',
  'EXECUTION',
] as const;

export const PHASE_STATUS_VALUES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'BLOCKED',
  'APPROVED',
  'DONE',
] as const;

export type PhaseKindValue = (typeof PHASE_KIND_VALUES)[number];
export type PhaseStatusValue = (typeof PHASE_STATUS_VALUES)[number];

/**
 * フェーズ作成リクエストDTO
 */
export class CreatePhaseRequestDto {
  @ApiProperty({
    enum: PHASE_KIND_VALUES,
    example: 'BACKGROUND',
    description: 'フェーズ種別（Ph.0〜7）',
  })
  @IsIn(PHASE_KIND_VALUES as unknown as string[], {
    message: '無効なフェーズ種別です',
  })
  kind: PhaseKindValue;

  @ApiPropertyOptional({ example: 0, description: '並び順（省略時は種別の標準順）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    enum: PHASE_STATUS_VALUES,
    example: 'NOT_STARTED',
    description: 'フェーズ状態（省略時は NOT_STARTED）',
  })
  @IsOptional()
  @IsIn(PHASE_STATUS_VALUES as unknown as string[], {
    message: '無効なフェーズ状態です',
  })
  status?: PhaseStatusValue;

  @ApiPropertyOptional({ example: '背景理解のサマリ', description: 'サマリ' })
  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: 'サマリは10000文字以内で入力してください' })
  summary?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: {},
    description: 'メタデータ（任意のJSON）',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * フェーズレスポンスDTO
 */
export class PhaseResponseDto {
  @ApiProperty({ example: 'uuid-phase-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-project-xxxx' })
  projectId: string;

  @ApiProperty({ enum: PHASE_KIND_VALUES, example: 'BACKGROUND' })
  kind: PhaseKindValue;

  @ApiProperty({ example: 0 })
  order: number;

  @ApiProperty({ enum: PHASE_STATUS_VALUES, example: 'NOT_STARTED' })
  status: PhaseStatusValue;

  @ApiProperty({ example: '背景理解のサマリ', nullable: true })
  summary: string | null;

  @ApiProperty({ example: '詳細本文（Markdown等の長文）', nullable: true })
  detail: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: {},
  })
  metadata: Record<string, unknown>;
}
