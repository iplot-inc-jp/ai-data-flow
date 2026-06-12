import { ApiProperty } from '@nestjs/swagger';

/**
 * GAPレスポンスDTO
 */
export class GapItemResponseDto {
  @ApiProperty({ example: 'uuid-gap-xxxx' })
  id: string;

  @ApiProperty({ example: 'uuid-project-xxxx' })
  projectId: string;

  @ApiProperty({ example: 'uuid-phase-xxxx', nullable: true })
  phaseId: string | null;

  @ApiProperty({ example: '受発注業務' })
  businessArea: string;

  @ApiProperty({ example: '紙の注文書をFAXで受信している', nullable: true })
  asisDescription: string | null;

  @ApiProperty({ example: 'Webフォームで自動受注する', nullable: true })
  tobeDescription: string | null;

  @ApiProperty({
    example: '手入力による転記ミスと処理遅延が発生している',
    nullable: true,
  })
  gapDescription: string | null;

  @ApiProperty({ example: 'HIGH', enum: ['HIGH', 'MEDIUM', 'LOW'] })
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  @ApiProperty({ example: 'OPEN', enum: ['OPEN', 'RESOLVED'] })
  status: 'OPEN' | 'RESOLVED';

  @ApiProperty({ example: '山田太郎', nullable: true })
  ownerName: string | null;

  @ApiProperty({ example: 0 })
  order: number;

  @ApiProperty({
    example: false,
    description: 'スコープ外フラグ（今回の取り組み範囲から除外した GAP）',
  })
  outOfScope: boolean;

  @ApiProperty({ example: 'uuid-flow-xxxx', nullable: true })
  asisFlowId: string | null;

  @ApiProperty({ example: 'uuid-node-xxxx', nullable: true })
  asisNodeId: string | null;

  @ApiProperty({ example: 'uuid-flow-yyyy', nullable: true })
  tobeFlowId: string | null;

  @ApiProperty({ example: 'uuid-node-yyyy', nullable: true })
  tobeNodeId: string | null;

  @ApiProperty({ example: 'uuid-issuetree-xxxx', nullable: true })
  issueTreeId: string | null;

  @ApiProperty({ example: '2026-06-06T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-06-06T00:00:00.000Z' })
  updatedAt: Date;
}
