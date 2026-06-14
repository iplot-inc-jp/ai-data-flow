import { DataObject } from '../entities/data-object.entity';
import { DataObjectRelation } from '../entities/data-object-relation.entity';

export const DATA_OBJECT_REPOSITORY = Symbol('DATA_OBJECT_REPOSITORY');

/** オブジェクトに紐づく実態テーブルの参照 */
export interface ObjectTableRef {
  id: string;
  name: string;
  displayName: string | null;
}

/** オブジェクトに紐づくDFDデータストアノードの参照 */
export interface ObjectDfdNodeRef {
  id: string;
  label: string;
}

export interface ObjectGraphEntry {
  object: DataObject;
  tables: ObjectTableRef[];
  dfdNodes: ObjectDfdNodeRef[];
}

/** オブジェクト関係性マップのグラフ（objects + relations） */
export interface ObjectGraph {
  entries: ObjectGraphEntry[];
  relations: DataObjectRelation[];
}

/** ER図素材：カラム行（order順） */
export interface ErColumnRow {
  id: string;
  name: string;
  displayName: string | null;
  dataType: string;
  description: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
  isUnique: boolean;
  foreignKeyTable: string | null;
  foreignKeyColumn: string | null;
  order: number;
}

/** ER図素材：テーブル行（columns 全件含む） */
export interface ErTableRow {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
  dataObjectId: string | null;
  erPositionX: number;
  erPositionY: number;
  columns: ErColumnRow[];
}

/** import-from-dfd 素材：第1レベルDFDの DATA_STORE ノード */
export interface L1DataStoreNode {
  id: string;
  label: string;
  dataObjectId: string | null;
}

/** テーブルの所属プロジェクト解決用の最小参照 */
export interface TableProjectRef {
  id: string;
  projectId: string;
}

export interface IDataObjectRepository {
  /** プロジェクトのオブジェクト一覧（紐づくtables/dfdNodes含む）＋relations */
  findObjectGraph(projectId: string): Promise<ObjectGraph>;
  findById(id: string): Promise<DataObject | null>;
  findByName(projectId: string, name: string): Promise<DataObject | null>;
  /** 1オブジェクトに紐づく tables / dfdNodes の参照（単体レスポンス用） */
  findObjectRefs(objectId: string): Promise<{ tables: ObjectTableRef[]; dfdNodes: ObjectDfdNodeRef[] }>;
  /** 既存最大 order + 1（オブジェクトが無ければ 0） */
  nextOrder(projectId: string): Promise<number>;
  save(o: DataObject): Promise<void>;
  /**
   * 同名オブジェクトの get-or-create（import-from-dfd 用・冪等）。
   * 並行作成で一意制約（projectId, name）に競合した場合は勝者を読み直して返す。
   */
  getOrCreateByName(
    projectId: string,
    name: string,
    order: number,
  ): Promise<{ object: DataObject; created: boolean }>;
  delete(id: string): Promise<void>;

  findRelationById(id: string): Promise<DataObjectRelation | null>;
  /** 同一端点ペア（source→target）の既存関係線（重複作成ガード用） */
  findRelationByEndpoints(
    projectId: string,
    sourceObjectId: string,
    targetObjectId: string,
  ): Promise<DataObjectRelation | null>;
  saveRelation(r: DataObjectRelation): Promise<void>;
  deleteRelation(id: string): Promise<void>;

  /** オブジェクト関係性マップ上の位置一括保存 */
  bulkSavePositions(
    projectId: string,
    positions: { id: string; positionX: number; positionY: number }[],
  ): Promise<void>;

  /** ER図素材：プロジェクト全テーブル（columns 全件 order順） */
  findErTables(projectId: string): Promise<ErTableRow[]>;
  /** ER図キャンバス上のテーブル位置一括保存 */
  bulkSaveErPositions(
    projectId: string,
    positions: { id: string; positionX: number; positionY: number }[],
  ): Promise<void>;

  /** import-from-dfd 素材：第1レベルDFD（flowId=null）の DATA_STORE ノード */
  findL1DataStoreNodes(projectId: string): Promise<L1DataStoreNode[]>;
  /** DFDノードをオブジェクトに紐づける */
  setDfdNodeObject(nodeId: string, dataObjectId: string): Promise<void>;

  /** テーブルの所属プロジェクト解決（認可用） */
  findTableProjectRef(tableId: string): Promise<TableProjectRef | null>;

  /** 領域（SubProject）の所属プロジェクトID（存在しなければ null） */
  findSubProjectProjectId(subProjectId: string): Promise<string | null>;
  /** テーブルをオブジェクトに紐づけ/解除 */
  linkTableToObject(tableId: string, dataObjectId: string | null): Promise<void>;

  generateId(): string;
}
