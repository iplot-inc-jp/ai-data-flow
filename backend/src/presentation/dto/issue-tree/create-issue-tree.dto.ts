import { IsString, MinLength, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum IssueTreeTypeDto {
  WHY = 'WHY',
  SOLUTION = 'SOLUTION',
}

/**
 * ツリーパターンDTO（作成時に選ぶテンプレ）
 * - ISSUE_POINT: イシューツリー（論点・調査）
 * - WHY: Whyツリー（原因究明）
 * - WHAT: Whatツリー（対象分割）
 * - HOW: Howツリー（打ち手・発散）
 * - MECE_ACTION: MECEアクションツリー（打ち手・網羅）
 * - KPI: KPIツリー
 */
export enum IssueTreePatternDto {
  ISSUE_POINT = 'ISSUE_POINT',
  WHY = 'WHY',
  WHAT = 'WHAT',
  HOW = 'HOW',
  MECE_ACTION = 'MECE_ACTION',
  KPI = 'KPI',
}

export enum NodeVerificationDto {
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  UNKNOWN = 'UNKNOWN',
  NEEDS_HEARING = 'NEEDS_HEARING',
  NA = 'NA',
}

export enum NodeRecommendationDto {
  ADOPT = 'ADOPT',
  HOLD = 'HOLD',
  REJECT = 'REJECT',
  NA = 'NA',
}

/**
 * イシューツリー作成リクエストDTO
 */
export class CreateIssueTreeRequestDto {
  @ApiPropertyOptional({
    enum: IssueTreeTypeDto,
    example: 'WHY',
    description: 'ツリー型（旧・互換用。WHY: なぜ型、SOLUTION: 打ち手型）。省略時はWHY。',
  })
  @IsOptional()
  @IsEnum(IssueTreeTypeDto, {
    message: '型はWHYまたはSOLUTIONを指定してください',
  })
  type?: IssueTreeTypeDto;

  @ApiPropertyOptional({
    enum: IssueTreePatternDto,
    example: 'ISSUE_POINT',
    description:
      'ツリーパターン（作成テンプレ）。省略時はISSUE_POINT。',
  })
  @IsOptional()
  @IsEnum(IssueTreePatternDto)
  pattern?: IssueTreePatternDto;

  @ApiProperty({ example: '解約率が高い', description: 'ツリー名' })
  @IsString()
  @MinLength(1, { message: 'ツリー名は必須です' })
  @MaxLength(200, { message: 'ツリー名は200文字以内で入力してください' })
  name: string;

  @ApiPropertyOptional({
    example: 'なぜ解約率が高いのか？',
    description: 'ルートの問い',
  })
  @IsOptional()
  @IsString()
  rootQuestion?: string;

  @ApiPropertyOptional({
    example: 'uuid-gap-xxxx',
    description: 'リンクするGAP ID（指定時、作成したツリーをこのGAPに紐付ける）',
  })
  @IsOptional()
  @IsString()
  gapItemId?: string;
}

/**
 * イシューツリーレスポンスDTO
 */
export class IssueTreeResponseDto {
  @ApiProperty({ example: 'uuid-xxxx-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-project-xxxx' })
  projectId: string;

  @ApiProperty({ enum: IssueTreeTypeDto, example: 'WHY' })
  type: IssueTreeTypeDto;

  @ApiProperty({ enum: IssueTreePatternDto, example: 'ISSUE_POINT' })
  pattern: IssueTreePatternDto;

  @ApiProperty({ example: '解約率が高い' })
  name: string;

  @ApiProperty({ example: 'なぜ解約率が高いのか？', nullable: true })
  rootQuestion: string | null;

  @ApiProperty()
  createdAt?: Date;

  @ApiProperty()
  updatedAt?: Date;
}
