import {
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NodeVerificationDto,
  NodeRecommendationDto,
} from './create-issue-tree.dto';

/**
 * ノード種別DTO
 * - ISSUE: 課題（論点）
 * - CAUSE: 原因（なぜ型の掘り下げ）
 * - COUNTERMEASURE: 打ち手（対策）
 */
export enum IssueNodeKindDto {
  ISSUE = 'ISSUE',
  CAUSE = 'CAUSE',
  COUNTERMEASURE = 'COUNTERMEASURE',
}

/**
 * イシューノード追加リクエストDTO
 */
export class AddIssueNodeRequestDto {
  @ApiPropertyOptional({
    example: 'uuid-parent-node',
    description: '親ノードID（ルートの場合は省略）',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 0, description: '兄弟内の表示順序' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiProperty({ example: 'オンボーディングが分かりにくい', description: 'ラベル' })
  @IsString()
  @MinLength(1, { message: 'ラベルは必須です' })
  label: string;

  @ApiPropertyOptional({
    enum: IssueNodeKindDto,
    example: 'ISSUE',
    description: 'ノード種別（ISSUE: 課題 / CAUSE: 原因 / COUNTERMEASURE: 打ち手）',
  })
  @IsOptional()
  @IsEnum(IssueNodeKindDto)
  kind?: IssueNodeKindDto;

  @ApiPropertyOptional({ enum: NodeVerificationDto, example: 'NA' })
  @IsOptional()
  @IsEnum(NodeVerificationDto)
  verification?: NodeVerificationDto;

  @ApiPropertyOptional({ enum: NodeRecommendationDto, example: 'NA' })
  @IsOptional()
  @IsEnum(NodeRecommendationDto)
  recommendation?: NodeRecommendationDto;

  @ApiPropertyOptional({ example: 'アンケート結果より', description: '根拠', nullable: true })
  @IsOptional()
  @IsString()
  evidence?: string | null;

  @ApiPropertyOptional({
    example: 'uuid-why-node',
    description: '根本原因ノードID（SOLUTION型→WHY型確定ノード参照）',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  rootCauseNodeId?: string | null;

  @ApiPropertyOptional({ example: {}, description: 'メタデータ' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * イシューノード更新リクエストDTO
 */
export class UpdateIssueNodeRequestDto {
  @ApiPropertyOptional({ example: 'オンボーディングが分かりにくい', description: 'ラベル' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'ラベルは必須です' })
  label?: string;

  @ApiPropertyOptional({
    enum: IssueNodeKindDto,
    example: 'CAUSE',
    description: 'ノード種別（ISSUE: 課題 / CAUSE: 原因 / COUNTERMEASURE: 打ち手）',
  })
  @IsOptional()
  @IsEnum(IssueNodeKindDto)
  kind?: IssueNodeKindDto;

  @ApiPropertyOptional({ example: 'アンケート結果より', description: '根拠', nullable: true })
  @IsOptional()
  @IsString()
  evidence?: string | null;

  @ApiPropertyOptional({ enum: NodeVerificationDto, example: 'CONFIRMED' })
  @IsOptional()
  @IsEnum(NodeVerificationDto)
  verification?: NodeVerificationDto;

  @ApiPropertyOptional({ enum: NodeRecommendationDto, example: 'ADOPT' })
  @IsOptional()
  @IsEnum(NodeRecommendationDto)
  recommendation?: NodeRecommendationDto;

  @ApiPropertyOptional({
    example: 'uuid-parent-node',
    description: '親ノードID（ルートにする場合はnull）',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 0, description: '兄弟内の表示順序' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({
    example: 'uuid-why-node',
    description: '根本原因ノードID',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  rootCauseNodeId?: string | null;

  @ApiPropertyOptional({ example: {}, description: 'メタデータ' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * イシューノード検証状態設定リクエストDTO
 */
export class SetNodeVerificationRequestDto {
  @ApiProperty({ enum: NodeVerificationDto, example: 'CONFIRMED' })
  @IsEnum(NodeVerificationDto, {
    message:
      '検証状態はCONFIRMED, REJECTED, UNKNOWN, NEEDS_HEARING, NAのいずれかを指定してください',
  })
  verification: NodeVerificationDto;

  @ApiPropertyOptional({ example: 'アンケート結果より', description: '根拠', nullable: true })
  @IsOptional()
  @IsString()
  evidence?: string | null;
}

/**
 * イシューノードレスポンスDTO
 */
export class IssueNodeResponseDto {
  @ApiProperty({ example: 'uuid-xxxx-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-tree-xxxx' })
  treeId: string;

  @ApiProperty({ example: 'uuid-parent-node', nullable: true })
  parentId: string | null;

  @ApiProperty({ example: 0, description: '階層の深さ' })
  depth: number;

  @ApiProperty({ example: 0, description: '兄弟内の表示順序' })
  order: number;

  @ApiProperty({ example: 'オンボーディングが分かりにくい' })
  label: string;

  @ApiProperty({ enum: IssueNodeKindDto, example: 'ISSUE' })
  kind: IssueNodeKindDto;

  @ApiProperty({ enum: NodeVerificationDto, example: 'NA' })
  verification: NodeVerificationDto;

  @ApiProperty({ enum: NodeRecommendationDto, example: 'NA' })
  recommendation: NodeRecommendationDto;

  @ApiProperty({ example: 'アンケート結果より', nullable: true })
  evidence: string | null;

  @ApiProperty({ example: 'uuid-why-node', nullable: true })
  rootCauseNodeId: string | null;

  @ApiProperty({ example: {} })
  metadata: Record<string, unknown>;

  @ApiProperty()
  createdAt?: Date;

  @ApiProperty()
  updatedAt?: Date;
}

/**
 * ノード付きイシューツリーレスポンスDTO
 */
export class IssueTreeWithNodesResponseDto {
  @ApiProperty({ example: 'uuid-xxxx-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-project-xxxx' })
  projectId: string;

  @ApiProperty({ example: 'WHY' })
  type: string;

  @ApiProperty({ example: '解約率が高い' })
  name: string;

  @ApiProperty({ example: 'なぜ解約率が高いのか？', nullable: true })
  rootQuestion: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: [IssueNodeResponseDto] })
  nodes: IssueNodeResponseDto[];
}
