import { Controller, Post, Get, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IsArray, IsString, IsNumber, IsOptional } from 'class-validator';
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
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

class UpdateRoleOrderDto {
  @IsArray()
  @IsString({ each: true })
  roleIds: string[]; // 並び替え後のロールID配列
}

class UpdateRoleLaneHeightDto {
  @IsNumber()
  laneHeight: number;
}

@ApiTags('ロール')
@ApiBearerAuth()
@Controller('roles')
export class RoleController {
  constructor(
    private readonly createRoleUseCase: CreateRoleUseCase,
    private readonly getRolesUseCase: GetRolesUseCase,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository,
    private readonly prisma: PrismaService,
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
    @Body() dto: CreateRoleRequestDto,
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

  @Put('project/:projectId/order')
  @ApiOperation({ summary: 'ロールの並び順を更新' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateOrder(
    @Param('projectId') projectId: string,
    @Body() dto: UpdateRoleOrderDto,
  ): Promise<RoleResponseDto[]> {
    // トランザクションで一括更新
    await this.prisma.$transaction(
      dto.roleIds.map((roleId, index) =>
        this.prisma.role.update({
          where: { id: roleId },
          data: { order: index },
        })
      )
    );

    // 更新後のロール一覧を返す
    const roles = await this.prisma.role.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      name: r.name,
      type: r.type as RoleTypeDto,
      description: r.description,
      color: r.color,
      order: r.order,
      laneHeight: r.laneHeight,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  @Put(':id/lane-height')
  @ApiOperation({ summary: 'ロールのレーン高さを更新' })
  @ApiParam({ name: 'id', description: 'ロールID' })
  @ApiResponse({ status: 200, description: '更新成功' })
  async updateLaneHeight(
    @Param('id') id: string,
    @Body() dto: UpdateRoleLaneHeightDto,
  ): Promise<RoleResponseDto> {
    const role = await this.prisma.role.update({
      where: { id },
      data: { laneHeight: dto.laneHeight },
    });

    return {
      id: role.id,
      projectId: role.projectId,
      name: role.name,
      type: role.type as RoleTypeDto,
      description: role.description,
      color: role.color,
      order: role.order,
      laneHeight: role.laneHeight,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
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

