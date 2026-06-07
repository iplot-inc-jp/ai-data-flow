import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors';

export interface FlowDefinitionFields {
  purpose: string | null;
  owner: string | null;
  stakeholders: string | null;
  input: string | null;
  inputDetail: string | null;
  trigger: string | null;
  doSteps: string[];
  output: string | null;
  nextProcess: string | null;
  exceptionHandling: string | null;
  frequency: string | null;
  system: string | null;
  tacitNotes: string | null;
}

export interface CreateFlowDefinitionProps extends Partial<FlowDefinitionFields> {
  flowId: string;
}

export interface ReconstructFlowDefinitionProps extends FlowDefinitionFields {
  id: string;
  flowId: string;
  createdAt: Date;
  updatedAt: Date;
}

const STR_KEYS: (keyof FlowDefinitionFields)[] = [
  'purpose', 'owner', 'stakeholders', 'input', 'inputDetail', 'trigger',
  'output', 'nextProcess', 'exceptionHandling', 'frequency', 'system', 'tacitNotes',
];

/** 業務フローの業務定義（①一覧/③個別定義で共有する1フロー分の定義） */
export class FlowDefinition extends BaseEntity {
  private readonly _flowId: string;
  private _fields: FlowDefinitionFields;

  private constructor(
    id: string,
    flowId: string,
    fields: FlowDefinitionFields,
    createdAt: Date,
    updatedAt: Date,
  ) {
    super(id, createdAt, updatedAt);
    this._flowId = flowId;
    this._fields = fields;
  }

  private static normalize(props: Partial<FlowDefinitionFields>): FlowDefinitionFields {
    const f: FlowDefinitionFields = {
      purpose: null, owner: null, stakeholders: null, input: null, inputDetail: null,
      trigger: null, doSteps: [], output: null, nextProcess: null,
      exceptionHandling: null, frequency: null, system: null, tacitNotes: null,
    };
    for (const k of STR_KEYS) {
      const v = (props as Record<string, unknown>)[k];
      (f as unknown as Record<string, unknown>)[k] = typeof v === 'string' ? v : v == null ? null : String(v);
    }
    if (Array.isArray(props.doSteps)) {
      f.doSteps = props.doSteps.map((s) => String(s));
    }
    return f;
  }

  static create(props: CreateFlowDefinitionProps, id: string): FlowDefinition {
    if (!props.flowId) throw new ValidationError('Flow ID is required');
    const now = new Date();
    return new FlowDefinition(id, props.flowId, FlowDefinition.normalize(props), now, now);
  }

  static reconstruct(props: ReconstructFlowDefinitionProps): FlowDefinition {
    return new FlowDefinition(
      props.id, props.flowId, FlowDefinition.normalize(props), props.createdAt, props.updatedAt,
    );
  }

  /** 部分更新（渡されたキーのみ上書き） */
  update(patch: Partial<FlowDefinitionFields>): void {
    for (const k of STR_KEYS) {
      if (k in patch) {
        const v = (patch as Record<string, unknown>)[k];
        (this._fields as unknown as Record<string, unknown>)[k] = typeof v === 'string' ? v : v == null ? null : String(v);
      }
    }
    if ('doSteps' in patch && Array.isArray(patch.doSteps)) {
      this._fields.doSteps = patch.doSteps.map((s) => String(s));
    }
    this.touch();
  }

  get flowId(): string { return this._flowId; }
  get fields(): FlowDefinitionFields { return { ...this._fields, doSteps: [...this._fields.doSteps] }; }
}
