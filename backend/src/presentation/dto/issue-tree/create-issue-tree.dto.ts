import { IsString, MinLength, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum IssueTreeTypeDto {
  WHY = 'WHY',
  SOLUTION = 'SOLUTION',
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
  @ApiProperty({
    enum: IssueTreeTypeDto,
    example: 'WHY',
    description: 'ツリー型（WHY: なぜ型、SOLUTION: 打ち手型）',
  })
  @IsEnum(IssueTreeTypeDto, {
    message: '型はWHYまたはSOLUTIONを指定してください',
  })
  type: IssueTreeTypeDto;

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

  @ApiProperty({ example: '解約率が高い' })
  name: string;

  @ApiProperty({ example: 'なぜ解約率が高いのか？', nullable: true })
  rootQuestion: string | null;

  @ApiProperty()
  createdAt?: Date;

  @ApiProperty()
  updatedAt?: Date;
}
