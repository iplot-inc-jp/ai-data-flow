import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PHASE_STATUS_VALUES, PhaseStatusValue } from './create-phase.dto';

/**
 * フェーズ状態遷移リクエストDTO
 */
export class TransitionPhaseRequestDto {
  @ApiProperty({
    enum: PHASE_STATUS_VALUES,
    example: 'IN_PROGRESS',
    description: '遷移先の状態',
  })
  @IsIn(PHASE_STATUS_VALUES as unknown as string[], {
    message: '無効なフェーズ状態です',
  })
  status: PhaseStatusValue;
}
