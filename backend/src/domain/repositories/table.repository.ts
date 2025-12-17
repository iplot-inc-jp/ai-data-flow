import { Table } from '../entities/table.entity';

export const TABLE_REPOSITORY = Symbol('TABLE_REPOSITORY');

export interface ITableRepository {
  findById(id: string): Promise<Table | null>;
  findByProjectId(projectId: string): Promise<Table[]>;
  findByProjectIdAndName(projectId: string, name: string): Promise<Table | null>;
  save(table: Table): Promise<Table>;
  delete(id: string): Promise<void>;
}

