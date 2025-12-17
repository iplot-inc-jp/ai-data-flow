import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'ヘルスチェック' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

