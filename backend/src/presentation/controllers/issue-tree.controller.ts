import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CreateIssueTreeUseCase,
  GetIssueTreesUseCase,
  GetIssueTreeUseCase,
  UpdateIssueTreeUseCase,
  DeleteIssueTreeUseCase,
  AddIssueNodeUseCase,
  UpdateIssueNodeUseCase,
  DeleteIssueNodeUseCase,
  SetNodeVerificationUseCase,
} from '../../application';
import {
  CreateIssueTreeRequestDto,
  IssueTreeResponseDto,
  IssueTreeTypeDto,
  IssueNodeKindDto,
  NodeVerificationDto,
  NodeRecommendationDto,
  UpdateIssueTreeRequestDto,
  AddIssueNodeRequestDto,
  UpdateIssueNodeRequestDto,
  SetNodeVerificationRequestDto,
  IssueNodeResponseDto,
  IssueTreeWithNodesResponseDto,
} from '../dto';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';

@ApiTags('イシューツリー')
@ApiBearerAuth()
@Controller()
export class IssueTreeController {
  constructor(
    private readonly createIssueTreeUseCase: CreateIssueTreeUseCase,
    private readonly getIssueTreesUseCase: GetIssueTreesUseCase,
    private readonly getIssueTreeUseCase: GetIssueTreeUseCase,
    private readonly updateIssueTreeUseCase: UpdateIssueTreeUseCase,
    private readonly deleteIssueTreeUseCase: DeleteIssueTreeUseCase,
    private readonly addIssueNodeUseCase: AddIssueNodeUseCase,
    private readonly updateIssueNodeUseCase: UpdateIssueNodeUseCase,
    private readonly deleteIssueNodeUseCase: DeleteIssueNodeUseCase,
    private readonly setNodeVerificationUseCase: SetNodeVerificationUseCase,
  ) {}

  // ===========================================
  // イシューツリー
  // ===========================================

  @Get('projects/:projectId/issue-trees')
  @ApiOperation({ summary: 'イシューツリー一覧取得（任意で型フィルタ）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiQuery({ name: 'type', enum: IssueTreeTypeDto, required: false })
  @ApiResponse({ status: 200, description: '成功', type: [IssueTreeResponseDto] })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Query('type') type?: IssueTreeTypeDto,
  ): Promise<IssueTreeResponseDto[]> {
    const result = await this.getIssueTreesUseCase.execute({
      userId: user.id,
      projectId,
      type,
    });
    return result.map((tree) => ({
      ...tree,
      type: tree.type as IssueTreeTypeDto,
    }));
  }

  @Post('projects/:projectId/issue-trees')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'イシューツリー作成' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 201, description: '作成成功', type: IssueTreeResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateIssueTreeRequestDto,
  ): Promise<IssueTreeResponseDto> {
    const result = await this.createIssueTreeUseCase.execute({
      userId: user.id,
      projectId,
      type: dto.type,
      name: dto.name,
      rootQuestion: dto.rootQuestion,
      gapItemId: dto.gapItemId,
    });
    return {
      ...result,
      type: result.type as IssueTreeTypeDto,
    };
  }

  @Get('issue-trees/:id')
  @ApiOperation({ summary: 'イシューツリー詳細取得（ノードを含む）' })
  @ApiParam({ name: 'id', description: 'イシューツリーID' })
  @ApiResponse({ status: 200, description: '成功', type: IssueTreeWithNodesResponseDto })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'イシューツリーが見つかりません' })
  async findById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<IssueTreeWithNodesResponseDto> {
    const result = await this.getIssueTreeUseCase.execute({
      userId: user.id,
      treeId: id,
    });
    return {
      ...result,
      type: result.type as IssueTreeTypeDto,
      nodes: result.nodes.map((node) => ({
        ...node,
        kind: node.kind as IssueNodeKindDto,
        verification: node.verification as NodeVerificationDto,
        recommendation: node.recommendation as NodeRecommendationDto,
      })),
    };
  }

  @Put('issue-trees/:id')
  @ApiOperation({ summary: 'イシューツリー更新' })
  @ApiParam({ name: 'id', description: 'イシューツリーID' })
  @ApiResponse({ status: 200, description: '更新成功', type: IssueTreeResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'イシューツリーが見つかりません' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIssueTreeRequestDto,
  ): Promise<IssueTreeResponseDto> {
    const result = await this.updateIssueTreeUseCase.execute({
      userId: user.id,
      treeId: id,
      name: dto.name,
      rootQuestion: dto.rootQuestion,
      type: dto.type,
    });
    return {
      ...result,
      type: result.type as IssueTreeTypeDto,
    };
  }

  @Delete('issue-trees/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'イシューツリー削除' })
  @ApiParam({ name: 'id', description: 'イシューツリーID' })
  @ApiResponse({ status: 204, description: '削除成功' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'イシューツリーが見つかりません' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<void> {
    await this.deleteIssueTreeUseCase.execute({
      userId: user.id,
      treeId: id,
    });
  }

  // ===========================================
  // イシューノード
  // ===========================================

  @Post('issue-trees/:treeId/nodes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'イシューノード追加' })
  @ApiParam({ name: 'treeId', description: 'イシューツリーID' })
  @ApiResponse({ status: 201, description: '作成成功', type: IssueNodeResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'イシューツリーが見つかりません' })
  async addNode(
    @CurrentUser() user: CurrentUserPayload,
    @Param('treeId') treeId: string,
    @Body() dto: AddIssueNodeRequestDto,
  ): Promise<IssueNodeResponseDto> {
    const result = await this.addIssueNodeUseCase.execute({
      userId: user.id,
      treeId,
      parentId: dto.parentId,
      order: dto.order,
      label: dto.label,
      kind: dto.kind,
      verification: dto.verification,
      recommendation: dto.recommendation,
      evidence: dto.evidence,
      rootCauseNodeId: dto.rootCauseNodeId,
      metadata: dto.metadata,
    });
    return {
      ...result,
      kind: result.kind as IssueNodeKindDto,
      verification: result.verification as NodeVerificationDto,
      recommendation: result.recommendation as NodeRecommendationDto,
    };
  }

  @Put('issue-trees/:treeId/nodes/:nodeId')
  @ApiOperation({ summary: 'イシューノード更新' })
  @ApiParam({ name: 'treeId', description: 'イシューツリーID' })
  @ApiParam({ name: 'nodeId', description: 'イシューノードID' })
  @ApiResponse({ status: 200, description: '更新成功', type: IssueNodeResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'ノードが見つかりません' })
  async updateNode(
    @CurrentUser() user: CurrentUserPayload,
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateIssueNodeRequestDto,
  ): Promise<IssueNodeResponseDto> {
    const result = await this.updateIssueNodeUseCase.execute({
      userId: user.id,
      treeId,
      nodeId,
      label: dto.label,
      kind: dto.kind,
      evidence: dto.evidence,
      verification: dto.verification,
      recommendation: dto.recommendation,
      parentId: dto.parentId,
      order: dto.order,
      rootCauseNodeId: dto.rootCauseNodeId,
      metadata: dto.metadata,
    });
    return {
      ...result,
      kind: result.kind as IssueNodeKindDto,
      verification: result.verification as NodeVerificationDto,
      recommendation: result.recommendation as NodeRecommendationDto,
    };
  }

  @Delete('issue-trees/:treeId/nodes/:nodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'イシューノード削除' })
  @ApiParam({ name: 'treeId', description: 'イシューツリーID' })
  @ApiParam({ name: 'nodeId', description: 'イシューノードID' })
  @ApiResponse({ status: 204, description: '削除成功' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'ノードが見つかりません' })
  async removeNode(
    @CurrentUser() user: CurrentUserPayload,
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
  ): Promise<void> {
    await this.deleteIssueNodeUseCase.execute({
      userId: user.id,
      treeId,
      nodeId,
    });
  }

  @Put('issue-trees/:treeId/nodes/:nodeId/verification')
  @ApiOperation({ summary: 'イシューノードの検証状態設定' })
  @ApiParam({ name: 'treeId', description: 'イシューツリーID' })
  @ApiParam({ name: 'nodeId', description: 'イシューノードID' })
  @ApiResponse({ status: 200, description: '更新成功', type: IssueNodeResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'ノードが見つかりません' })
  async setVerification(
    @CurrentUser() user: CurrentUserPayload,
    @Param('treeId') treeId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: SetNodeVerificationRequestDto,
  ): Promise<IssueNodeResponseDto> {
    const result = await this.setNodeVerificationUseCase.execute({
      userId: user.id,
      treeId,
      nodeId,
      verification: dto.verification,
      evidence: dto.evidence,
    });
    return {
      ...result,
      kind: result.kind as IssueNodeKindDto,
      verification: result.verification as NodeVerificationDto,
      recommendation: result.recommendation as NodeRecommendationDto,
    };
  }
}
