import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface DfdDiagramFields {
  title: string | null;
  docId: string | null;
  authorName: string | null;
  approverName: string | null;
}

export interface CreateDfdDiagramProps extends Partial<DfdDiagramFields> {
  projectId: string;
  flowId?: string | null;
}

export interface ReconstructDfdDiagramProps extends DfdDiagramFields {
  id: string;
  projectId: string;
  flowId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** DFD（データフロー図）の図ヘッダ。第1=projectレベル(flowId=null) / 第2=flowレベル(flowId指定) */
export class DfdDiagram extends BaseEntity {
  private readonly _projectId: string;
  private readonly _flowId: string | null;
  private _fields: DfdDiagramFields;

  private constructor(
    id: string,
    projectId: string,
    flowId: string | null,
    fields: DfdDiagramFields,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._projectId = projectId;
    this._flowId = flowId;
    this._fields = fields;
  }

  static create(props: CreateDfdDiagramProps, id: string): DfdDiagram {
    if (!props.projectId) throw new ValidationError('Project ID is required');
    const now = new Date();
    return new DfdDiagram(
      id,
      props.projectId,
      props.flowId ?? null,
      {
        title: props.title ?? null,
        docId: props.docId ?? null,
        authorName: props.authorName ?? null,
        approverName: props.approverName ?? null,
      },
      now,
      now,
    );
  }

  static reconstruct(props: ReconstructDfdDiagramProps): DfdDiagram {
    return new DfdDiagram(
      props.id,
      props.projectId,
      props.flowId,
      {
        title: props.title,
        docId: props.docId,
        authorName: props.authorName,
        approverName: props.approverName,
      },
      props.createdAt,
      props.updatedAt,
    );
  }

  /** 部分更新（渡されたキーのみ上書き） */
  update(patch: Partial<DfdDiagramFields>): void {
    if ('title' in patch) this._fields.title = patch.title ?? null;
    if ('docId' in patch) this._fields.docId = patch.docId ?? null;
    if ('authorName' in patch) this._fields.authorName = patch.authorName ?? null;
    if ('approverName' in patch) this._fields.approverName = patch.approverName ?? null;
    this.touch();
  }

  get projectId(): string { return this._projectId; }
  get flowId(): string | null { return this._flowId; }
  get fields(): DfdDiagramFields { return { ...this._fields }; }
}
