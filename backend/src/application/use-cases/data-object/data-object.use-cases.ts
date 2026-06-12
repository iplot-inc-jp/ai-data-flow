import { Inject, Injectable } from '@nestjs/common';
import {
  DATA_OBJECT_REPOSITORY, IDataObjectRepository,
  PROJECT_REPOSITORY, ProjectRepository,
  ORGANIZATION_REPOSITORY, OrganizationRepository,
  EntityNotFoundError,
  DataObject,
} from '../../../domain';
import { authorizeProject } from './data-object-authz';
import { DataObjectOutput, toDataObjectOutput } from './data-object.output';

export interface CreateDataObjectInput {
  userId: string;
  projectId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  positionX?: number;
  positionY?: number;
  order?: number;
}

@Injectable()
export class CreateDataObjectUseCase {
  constructor(
    @Inject(DATA_OBJECT_REPOSITORY) private readonly repo: IDataObjectRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: CreateDataObjectInput): Promise<DataObjectOutput> {
    await authorizeProject(this.projectRepo, this.orgRepo, input.projectId, input.userId);
    const order = input.order ?? (await this.repo.nextOrder(input.projectId));
    const object = DataObject.create(
      {
        projectId: input.projectId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        positionX: input.positionX ?? 0,
        positionY: input.positionY ?? 0,
        order,
      },
      this.repo.generateId(),
    );
    await this.repo.save(object);
    return toDataObjectOutput(object);
  }
}

export interface UpdateDataObjectInput {
  userId: string;
  id: string;
  name?: string;
  description?: string | null;
  color?: string | null;
  order?: number;
}

@Injectable()
export class UpdateDataObjectUseCase {
  constructor(
    @Inject(DATA_OBJECT_REPOSITORY) private readonly repo: IDataObjectRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: UpdateDataObjectInput): Promise<DataObjectOutput> {
    const object = await this.repo.findById(input.id);
    if (!object) throw new EntityNotFoundError('DataObject', input.id);
    await authorizeProject(this.projectRepo, this.orgRepo, object.projectId, input.userId);

    if (input.name !== undefined) object.updateName(input.name);
    if (input.description !== undefined) object.updateDescription(input.description);
    if (input.color !== undefined) object.updateColor(input.color);
    if (input.order !== undefined) object.updateOrder(input.order);
    await this.repo.save(object);
    // 単体レスポンスでも紐づく tables / dfdNodes を返す（クライアントのストア置換で参照が消えないように）
    const refs = await this.repo.findObjectRefs(object.id);
    return toDataObjectOutput(object, refs.tables, refs.dfdNodes);
  }
}

export interface DeleteDataObjectInput { userId: string; id: string; }

@Injectable()
export class DeleteDataObjectUseCase {
  constructor(
    @Inject(DATA_OBJECT_REPOSITORY) private readonly repo: IDataObjectRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepo: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY) private readonly orgRepo: OrganizationRepository,
  ) {}

  async execute(input: DeleteDataObjectInput): Promise<void> {
    const object = await this.repo.findById(input.id);
    if (!object) throw new EntityNotFoundError('DataObject', input.id);
    await authorizeProject(this.projectRepo, this.orgRepo, object.projectId, input.userId);
    await this.repo.delete(input.id);
  }
}
