import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import {
  CreateOrganizationUseCase,
  GetOrganizationsUseCase,
} from '../../application';
import {
  CreateOrganizationRequestDto,
  OrganizationResponseDto,
} from '../dto';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';

@ApiTags('組織')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly createOrganizationUseCase: CreateOrganizationUseCase,
    private readonly getOrganizationsUseCase: GetOrganizationsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '組織作成' })
  @ApiResponse({ status: 201, description: '作成成功', type: OrganizationResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 409, description: 'スラッグが既に使用されています' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateOrganizationRequestDto,
  ): Promise<OrganizationResponseDto> {
    const result = await this.createOrganizationUseCase.execute({
      userId: user.id,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
    });
    return result;
  }

  @Get()
  @ApiOperation({ summary: '組織一覧取得' })
  @ApiResponse({ status: 200, description: '成功', type: [OrganizationResponseDto] })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OrganizationResponseDto[]> {
    const result = await this.getOrganizationsUseCase.execute({
      userId: user.id,
    });
    return result;
  }
}

