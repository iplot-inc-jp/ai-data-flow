import { Inject, Injectable } from '@nestjs/common';
import {
  DFD_REPOSITORY, IDfdRepository,
  DATA_OBJECT_REPOSITORY, IDataObjectRepository,
  PROJECT_REPOSITORY, ProjectRepository,
  ORGANIZATION_REPOSITORY, OrganizationRepository,
  EntityNotFoundError, ValidationError,
  DfdNode,
} from '../../../domain';
import { DfdNodeKindValue } from '../../../domain/entities/dfd-node.entity';
import { authorizeDiagram } from './dfd-authz';
import { DfdNodeOutput, toDfdNodeOutput } from './dfd.output';

/** dataObjectId の参照先が存在し、図と同一プロジェクトに属することを検証する */
async function assertDataObjectInProject(
  dataObjectRepo: IDataObjectRepository,
  projectId: string,
  dataObjectId: string,
): Promise<void> {
  const object = await dataObjectRepo.findById(dataObjectId);
  if (!object) throw new EntityNotFoundError('DataObject', dataObjectId);
  if (object.projectId !== projectId) {
    throw new ValidationError('Data object does not belong to this project');
  }
}

export interface AddDfdNodeInput {
  userId: string;
  diagramId: string;
  kind: DfdNodeKindValue;
  label: string;
  number?: string | null;
  refFlowId?: string | null;
  refNodeId?: string | null;
  /** DATA_STORE をデータオブジェクトマスタに紐づける（任意） */
  dataObjectId?: string | null;
  positionX?: number;
  positionY?: number;
}

@Injectable()
export class AddDfdNodeUseCase {
  constructor(
    @Inject(DFD_REPOSITORY) private readonly repo: IDfdRepository,
    @Inject(DATA_OBJECT_REPOSITORY) private readonly dataObjectRepo: IDataObjectRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: AddDfdNodeInput): Promise<DfdNodeOutput> {
    const diagram = await authorizeDiagram(this.repo, this.projectRepo, this.orgRepo, input.diagramId, input.userId);
    if (input.dataObjectId != null) {
      await assertDataObjectInProject(this.dataObjectRepo, diagram.projectId, input.dataObjectId);
    }
    const node = DfdNode.create(
      {
        diagramId: input.diagramId,
        kind: input.kind,
        label: input.label,
        number: input.number ?? null,
        refFlowId: input.refFlowId ?? null,
        refNodeId: input.refNodeId ?? null,
        dataObjectId: input.dataObjectId ?? null,
        positionX: input.positionX ?? 0,
        positionY: input.positionY ?? 0,
      },
      this.repo.generateId(),
    );
    await this.repo.saveNode(node);
    return toDfdNodeOutput(node);
  }
}

export interface UpdateDfdNodeInput {
  userId: string;
  id: string;
  label?: string;
  number?: string | null;
  kind?: DfdNodeKindValue;
  /** DATA_STORE のデータオブジェクトマスタ紐づけ（null で解除） */
  dataObjectId?: string | null;
  positionX?: number;
  positionY?: number;
}

@Injectable()
export class UpdateDfdNodeUseCase {
  constructor(
    @Inject(DFD_REPOSITORY) private readonly repo: IDfdRepository,
    @Inject(DATA_OBJECT_REPOSITORY) private readonly dataObjectRepo: IDataObjectRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: UpdateDfdNodeInput): Promise<DfdNodeOutput> {
    const node = await this.repo.findNodeById(input.id);
    if (!node) throw new EntityNotFoundError('DfdNode', input.id);
    const diagram = await authorizeDiagram(this.repo, this.projectRepo, this.orgRepo, node.diagramId, input.userId);
    // undefined=変更なし / null=紐づけ解除。文字列のときのみ参照先を検証する
    if (input.dataObjectId != null) {
      await assertDataObjectInProject(this.dataObjectRepo, diagram.projectId, input.dataObjectId);
    }

    if (input.label !== undefined) node.updateLabel(input.label);
    if (input.number !== undefined) node.updateNumber(input.number);
    if (input.kind !== undefined) node.updateKind(input.kind);
    if (input.dataObjectId !== undefined) node.updateDataObjectId(input.dataObjectId);
    if (input.positionX !== undefined || input.positionY !== undefined) {
      node.updatePosition(
        input.positionX ?? node.positionX,
        input.positionY ?? node.positionY,
      );
    }
    await this.repo.saveNode(node);
    return toDfdNodeOutput(node);
  }
}

export interface DeleteDfdNodeInput { userId: string; id: string; }

@Injectable()
export class DeleteDfdNodeUseCase {
  constructor(
    @Inject(DFD_REPOSITORY) private readonly repo: IDfdRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: DeleteDfdNodeInput): Promise<void> {
    const node = await this.repo.findNodeById(input.id);
    if (!node) {
      throw new EntityNotFoundError('DfdNode', input.id);
    }
    await authorizeDiagram(this.repo, this.projectRepo, this.orgRepo, node.diagramId, input.userId);
    await this.repo.deleteNode(input.id);
  }
}
