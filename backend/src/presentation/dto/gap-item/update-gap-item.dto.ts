import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * GAP更新リクエストDTO（全フィールド任意）
 */
export class UpdateGapItemRequestDto {
  @ApiPropertyOptional({ example: '受発注業務', description: '業務領域' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '業務領域は必須です' })
  @MaxLength(200, { message: '業務領域は200文字以内で入力してください' })
  businessArea?: string;

  @ApiPropertyOptional({ example: 'uuid-phase-xxxx', description: 'フェーズID' })
  @IsOptional()
  @IsString()
  phaseId?: string | null;

  @ApiPropertyOptional({
    example: '紙の注文書をFAXで受信している',
    description: 'ASIS（現状）の説明',
  })
  @IsOptional()
  @IsString()
  asisDescription?: string | null;

  @ApiPropertyOptional({
    example: 'Webフォームで自動受注する',
    description: 'TOBE（あるべき姿）の説明',
  })
  @IsOptional()
  @IsString()
  tobeDescription?: string | null;

  @ApiPropertyOptional({
    example: '手入力による転記ミスと処理遅延が発生している',
    description: 'GAP（差分＝本当の課題）の説明',
  })
  @IsOptional()
  @IsString()
  gapDescription?: string | null;

  @ApiPropertyOptional({
    example: 'HIGH',
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    description: '優先度',
  })
  @IsOptional()
  @IsEnum(['HIGH', 'MEDIUM', 'LOW'], {
    message: '優先度は HIGH / MEDIUM / LOW のいずれかです',
  })
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';

  @ApiPropertyOptional({ example: '山田太郎', description: '担当者名' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '担当者名は100文字以内で入力してください' })
  ownerName?: string | null;

  @ApiPropertyOptional({ example: 0, description: '表示順' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ example: 'uuid-flow-xxxx', description: 'ASISフローID' })
  @IsOptional()
  @IsString()
  asisFlowId?: string | null;

  @ApiPropertyOptional({ example: 'uuid-node-xxxx', description: 'ASISノードID' })
  @IsOptional()
  @IsString()
  asisNodeId?: string | null;

  @ApiPropertyOptional({ example: 'uuid-flow-yyyy', description: 'TOBEフローID' })
  @IsOptional()
  @IsString()
  tobeFlowId?: string | null;

  @ApiPropertyOptional({ example: 'uuid-node-yyyy', description: 'TOBEノードID' })
  @IsOptional()
  @IsString()
  tobeNodeId?: string | null;

  @ApiPropertyOptional({
    example: 'uuid-issuetree-xxxx',
    description: 'この GAP を改善する打ち手ツリー（SOLUTION型 IssueTree）のID',
  })
  @IsOptional()
  @IsString()
  issueTreeId?: string | null;
}
