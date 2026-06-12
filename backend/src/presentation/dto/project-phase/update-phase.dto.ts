import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PHASE_STATUS_VALUES, PhaseStatusValue } from './create-phase.dto';

/**
 * フェーズ更新リクエストDTO（summary / status / order）
 */
export class UpdatePhaseRequestDto {
  @ApiPropertyOptional({
    enum: PHASE_STATUS_VALUES,
    example: 'IN_PROGRESS',
    description: 'フェーズ状態',
  })
  @IsOptional()
  @IsIn(PHASE_STATUS_VALUES as unknown as string[], {
    message: '無効なフェーズ状態です',
  })
  status?: PhaseStatusValue;

  @ApiPropertyOptional({ example: 1, description: '並び順' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ example: '更新後のサマリ', description: 'サマリ' })
  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: 'サマリは10000文字以内で入力してください' })
  summary?: string;

  @ApiPropertyOptional({
    example: '更新後の詳細（Markdown等の長文）',
    description: '詳細本文',
  })
  @IsOptional()
  @IsString()
  detail?: string;
}
