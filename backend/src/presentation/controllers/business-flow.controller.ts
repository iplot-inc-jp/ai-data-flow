import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  BUSINESS_FLOW_REPOSITORY,
  IBusinessFlowRepository,
  FLOW_NODE_REPOSITORY,
  IFlowNodeRepository,
  CRUD_MAPPING_REPOSITORY,
  ICrudMappingRepository,
  BusinessFlow,
  FlowNode,
  FlowEdge,
} from '../../domain';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { v4 as uuid } from 'uuid';

// DTOs
class CreateBusinessFlowDto {
  projectId: string;
  name: string;
  description?: string;
  parentId?: string;
}

class UpdateBusinessFlowDto {
  name?: string;
  description?: string;
}

class CreateFlowNodeDto {
  type?: string;
  label: string;
  description?: string;
  positionX: number;
  positionY: number;
  roleId?: string;
}

class UpdateFlowNodeDto {
  type?: string;
  label?: string;
  description?: string;
  positionX?: number;
  positionY?: number;
  roleId?: string;
}

class CreateFlowEdgeDto {
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  condition?: string;
}

class UpdateFlowEdgeDto {
  label?: string;
  condition?: string;
}

class CreateChildFlowDto {
  name: string;
  description?: string;
}

@ApiTags('Business Flows')
@ApiBearerAuth()
@Controller('business-flows')
export class BusinessFlowController {
  constructor(
    @Inject(BUSINESS_FLOW_REPOSITORY)
    private readonly flowRepository: IBusinessFlowRepository,
    @Inject(FLOW_NODE_REPOSITORY)
    private readonly nodeRepository: IFlowNodeRepository,
    @Inject(CRUD_MAPPING_REPOSITORY)
    private readonly crudMappingRepository: ICrudMappingRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Get('project/:projectId')
  @ApiOperation({ summary: 'プロジェクトのルートフロー一覧を取得' })
  async getRootFlows(@Param('projectId') projectId: string) {
    const flows = await this.flowRepository.findRootFlowsByProjectId(projectId);
    return flows.map((f) => this.toResponse(f));
  }

  @Get('project/:projectId/all')
  @ApiOperation({ summary: 'プロジェクトの全フロー一覧を取得（階層含む）' })
  async getAllFlows(@Param('projectId') projectId: string) {
    const flows = await this.flowRepository.findByProjectId(projectId);
    return flows.map((f) => this.toResponse(f));
  }

  @Get(':id')
  @ApiOperation({ summary: 'フロー詳細を取得（ノード・エッジ含む）' })
  async getById(@Param('id') id: string) {
    const flow = await this.flowRepository.findById(id);
    if (!flow) {
      return { error: 'Business flow not found' };
    }

    // ノードとエッジを取得
    const nodes = await this.prisma.flowNode.findMany({
      where: { flowId: id },
      include: {
        role: true,
        childFlow: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const edges = await this.prisma.flowEdge.findMany({
      where: { flowId: id },
      orderBy: { createdAt: 'asc' },
    });

    // 子フロー一覧
    const children = await this.flowRepository.findChildrenByParentId(id);

    // パンくず用の親フロー階層を取得
    const breadcrumbs = await this.getBreadcrumbs(flow);

    return {
      ...this.toResponse(flow),
      nodes: nodes.map((n) => ({
        id: n.id,
        flowId: n.flowId,
        type: n.type,
        label: n.label,
        description: n.description,
        positionX: n.positionX,
        positionY: n.positionY,
        roleId: n.roleId,
        role: n.role
          ? { id: n.role.id, name: n.role.name, color: n.role.color, type: n.role.type }
          : null,
        childFlowId: n.childFlowId,
        childFlow: n.childFlow
          ? { id: n.childFlow.id, name: n.childFlow.name }
          : null,
        hasChildFlow: !!n.childFlowId,
        metadata: n.metadata,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        flowId: e.flowId,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
        label: e.label,
        condition: e.condition,
      })),
      children: children.map((c) => this.toResponse(c)),
      breadcrumbs,
    };
  }

  @Post()
  @ApiOperation({ summary: 'フローを作成' })
  async create(@Body() dto: CreateBusinessFlowDto) {
    let depth = 0;

    if (dto.parentId) {
      const parent = await this.flowRepository.findById(dto.parentId);
      if (parent) {
        depth = parent.depth + 1;
      }
    }

    const flow = BusinessFlow.create({
      id: uuid(),
      projectId: dto.projectId,
      name: dto.name,
      description: dto.description,
      parentId: dto.parentId,
      depth,
    });

    const saved = await this.flowRepository.save(flow);
    return this.toResponse(saved);
  }

  @Put(':id')
  @ApiOperation({ summary: 'フローを更新' })
  async update(@Param('id') id: string, @Body() dto: UpdateBusinessFlowDto) {
    const flow = await this.flowRepository.findById(id);
    if (!flow) {
      return { error: 'Business flow not found' };
    }

    if (dto.name) flow.updateName(dto.name);
    if (dto.description !== undefined) flow.updateDescription(dto.description);

    const saved = await this.flowRepository.save(flow);
    return this.toResponse(saved);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'フローを削除' })
  async delete(@Param('id') id: string) {
    await this.flowRepository.delete(id);
    return { success: true };
  }

  // ========== Node Endpoints ==========

  @Post(':flowId/nodes')
  @ApiOperation({ summary: 'ノードを作成' })
  async createNode(
    @Param('flowId') flowId: string,
    @Body() dto: CreateFlowNodeDto,
  ) {
    const node = FlowNode.create({
      id: uuid(),
      flowId,
      type: (dto.type as any) || 'PROCESS',
      label: dto.label,
      description: dto.description,
      positionX: dto.positionX,
      positionY: dto.positionY,
      roleId: dto.roleId,
    });

    const saved = await this.nodeRepository.save(node);
    return this.nodeToResponse(saved);
  }

  @Put(':flowId/nodes/:nodeId')
  @ApiOperation({ summary: 'ノードを更新' })
  async updateNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateFlowNodeDto,
  ) {
    const node = await this.nodeRepository.findById(nodeId);
    if (!node) {
      return { error: 'Node not found' };
    }

    if (dto.label) node.updateLabel(dto.label);
    if (dto.description !== undefined) node.updateDescription(dto.description);
    if (dto.positionX !== undefined && dto.positionY !== undefined) {
      node.updatePosition(dto.positionX, dto.positionY);
    }
    if (dto.type) node.updateType(dto.type as any);
    if (dto.roleId !== undefined) node.assignRole(dto.roleId);

    const saved = await this.nodeRepository.save(node);
    return this.nodeToResponse(saved);
  }

  @Delete(':flowId/nodes/:nodeId')
  @ApiOperation({ summary: 'ノードを削除' })
  async deleteNode(@Param('nodeId') nodeId: string) {
    await this.nodeRepository.delete(nodeId);
    return { success: true };
  }

  // ========== Edge Endpoints ==========

  @Post(':flowId/edges')
  @ApiOperation({ summary: 'エッジを作成' })
  async createEdge(
    @Param('flowId') flowId: string,
    @Body() dto: CreateFlowEdgeDto,
  ) {
    const edge = await this.prisma.flowEdge.create({
      data: {
        id: uuid(),
        flowId,
        sourceNodeId: dto.sourceNodeId,
        targetNodeId: dto.targetNodeId,
        label: dto.label,
        condition: dto.condition,
      },
    });

    return {
      id: edge.id,
      flowId: edge.flowId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      condition: edge.condition,
    };
  }

  @Put(':flowId/edges/:edgeId')
  @ApiOperation({ summary: 'エッジを更新' })
  async updateEdge(
    @Param('edgeId') edgeId: string,
    @Body() dto: UpdateFlowEdgeDto,
  ) {
    const edge = await this.prisma.flowEdge.update({
      where: { id: edgeId },
      data: {
        label: dto.label,
        condition: dto.condition,
      },
    });

    return {
      id: edge.id,
      flowId: edge.flowId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      condition: edge.condition,
    };
  }

  @Delete(':flowId/edges/:edgeId')
  @ApiOperation({ summary: 'エッジを削除' })
  async deleteEdge(@Param('edgeId') edgeId: string) {
    await this.prisma.flowEdge.delete({ where: { id: edgeId } });
    return { success: true };
  }

  // ========== Child Flow Endpoints ==========

  @Post(':flowId/nodes/:nodeId/child-flow')
  @ApiOperation({ summary: 'ノードに子フローを作成・紐付け' })
  async createChildFlow(
    @Param('flowId') flowId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: CreateChildFlowDto,
  ) {
    const parentFlow = await this.flowRepository.findById(flowId);
    const node = await this.nodeRepository.findById(nodeId);

    if (!parentFlow || !node) {
      return { error: 'Parent flow or node not found' };
    }

    // 子フローを作成
    const childFlow = BusinessFlow.createChildFlow({
      id: uuid(),
      projectId: parentFlow.projectId,
      name: dto.name || `${node.label}の詳細`,
      description: dto.description,
      parentId: flowId,
      parentDepth: parentFlow.depth,
    });

    const savedFlow = await this.flowRepository.save(childFlow);

    // ノードに子フローを紐付け
    node.linkChildFlow(savedFlow.id);
    await this.nodeRepository.save(node);

    return {
      childFlow: this.toResponse(savedFlow),
      node: this.nodeToResponse(node),
    };
  }

  @Delete(':flowId/nodes/:nodeId/child-flow')
  @ApiOperation({ summary: 'ノードから子フローの紐付けを解除' })
  async unlinkChildFlow(@Param('nodeId') nodeId: string) {
    const node = await this.nodeRepository.findById(nodeId);
    if (!node) {
      return { error: 'Node not found' };
    }

    node.unlinkChildFlow();
    await this.nodeRepository.save(node);

    return { success: true };
  }

  // ========== CRUD Mappings for Flow ==========

  @Get(':flowId/crud-mappings')
  @ApiOperation({ summary: 'フローに紐づくCRUDマッピング一覧を取得' })
  async getCrudMappings(@Param('flowId') flowId: string) {
    const mappings = await this.crudMappingRepository.findByFlowId(flowId);
    return mappings.map((m) => ({
      id: m.id,
      columnId: m.columnId,
      operation: m.operation,
      roleId: m.roleId,
      flowId: m.flowId,
      flowNodeId: m.flowNodeId,
      how: m.how,
      condition: m.condition,
      description: m.description,
    }));
  }

  @Get(':flowId/nodes/:nodeId/crud-mappings')
  @ApiOperation({ summary: 'ノードに紐づくCRUDマッピング一覧を取得' })
  async getNodeCrudMappings(@Param('nodeId') nodeId: string) {
    const mappings = await this.crudMappingRepository.findByFlowNodeId(nodeId);
    return mappings.map((m) => ({
      id: m.id,
      columnId: m.columnId,
      operation: m.operation,
      roleId: m.roleId,
      flowId: m.flowId,
      flowNodeId: m.flowNodeId,
      how: m.how,
      condition: m.condition,
      description: m.description,
    }));
  }

  // ========== Mermaid Export ==========

  @Get(':id/mermaid')
  @ApiOperation({ summary: 'フローをMermaid形式でエクスポート' })
  async exportMermaid(@Param('id') id: string) {
    const flow = await this.flowRepository.findById(id);
    if (!flow) {
      return { error: 'Business flow not found' };
    }

    const nodes = await this.prisma.flowNode.findMany({
      where: { flowId: id },
      include: { role: true },
    });

    const edges = await this.prisma.flowEdge.findMany({
      where: { flowId: id },
    });

    let mermaid = 'flowchart TD\n';

    // ノードを追加
    for (const node of nodes) {
      const label = node.label.replace(/"/g, '\\"');
      const roleLabel = node.role ? ` [${node.role.name}]` : '';

      switch (node.type) {
        case 'START':
          mermaid += `  ${node.id}(("${label}"))\n`;
          break;
        case 'END':
          mermaid += `  ${node.id}(("${label}"))\n`;
          break;
        case 'DECISION':
          mermaid += `  ${node.id}{"${label}${roleLabel}"}\n`;
          break;
        case 'DATA_STORE':
          mermaid += `  ${node.id}[("${label}")]\n`;
          break;
        default:
          mermaid += `  ${node.id}["${label}${roleLabel}"]\n`;
      }
    }

    mermaid += '\n';

    // エッジを追加
    for (const edge of edges) {
      if (edge.label) {
        mermaid += `  ${edge.sourceNodeId} -->|"${edge.label}"| ${edge.targetNodeId}\n`;
      } else {
        mermaid += `  ${edge.sourceNodeId} --> ${edge.targetNodeId}\n`;
      }
    }

    return {
      flowId: id,
      flowName: flow.name,
      mermaid,
    };
  }

  private async getBreadcrumbs(flow: BusinessFlow): Promise<{ id: string; name: string }[]> {
    const breadcrumbs: { id: string; name: string }[] = [];
    let currentFlow: BusinessFlow | null = flow;

    while (currentFlow) {
      breadcrumbs.unshift({ id: currentFlow.id, name: currentFlow.name });

      if (currentFlow.parentId) {
        currentFlow = await this.flowRepository.findById(currentFlow.parentId);
      } else {
        currentFlow = null;
      }
    }

    return breadcrumbs;
  }

  private toResponse(flow: BusinessFlow) {
    return {
      id: flow.id,
      projectId: flow.projectId,
      name: flow.name,
      description: flow.description,
      version: flow.version,
      parentId: flow.parentId,
      depth: flow.depth,
      isRootFlow: flow.isRootFlow,
      isChildFlow: flow.isChildFlow,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    };
  }

  private nodeToResponse(node: FlowNode) {
    return {
      id: node.id,
      flowId: node.flowId,
      type: node.type,
      label: node.label,
      description: node.description,
      positionX: node.positionX,
      positionY: node.positionY,
      roleId: node.roleId,
      childFlowId: node.childFlowId,
      hasChildFlow: node.hasChildFlow,
      isBusinessBlock: node.isBusinessBlock,
      metadata: node.metadata,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }
}

