import { Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  CreateRoleUseCase,
  GetRolesUseCase,
} from '../../application';
import {
  CreateRoleRequestDto,
  RoleResponseDto,
  RoleTypeDto,
} from '../dto';
import { Inject } from '@nestjs/common';
import { ROLE_REPOSITORY, RoleRepository } from '../../domain';

@ApiTags('ロール')
@ApiBearerAuth()
@Controller('roles')
export class RoleController {
  constructor(
    private readonly createRoleUseCase: CreateRoleUseCase,
    private readonly getRolesUseCase: GetRolesUseCase,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
  ) {}

  @Get('project/:projectId')
  @ApiOperation({ summary: 'ロール一覧取得' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 200, description: '成功', type: [RoleResponseDto] })
  async findByProject(
    @Param('projectId') projectId: string,
  ): Promise<RoleResponseDto[]> {
    const result = await this.getRolesUseCase.execute({
      projectId,
    });
    return result.map((r) => ({
      ...r,
      type: r.type as RoleTypeDto,
    }));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ロール作成' })
  @ApiResponse({ status: 201, description: '作成成功', type: RoleResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  @ApiResponse({ status: 409, description: '同名のロールが既に存在します' })
  async create(
    @Body() dto: CreateRoleRequestDto & { projectId: string },
  ): Promise<RoleResponseDto> {
    const result = await this.createRoleUseCase.execute({
      projectId: dto.projectId,
      name: dto.name,
      type: dto.type,
      description: dto.description,
      color: dto.color,
    });
    return {
      ...result,
      type: result.type as RoleTypeDto,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ロール削除' })
  @ApiResponse({ status: 200, description: '削除成功' })
  async delete(@Param('id') id: string) {
    await this.roleRepository.delete(id);
    return { success: true };
  }
}

