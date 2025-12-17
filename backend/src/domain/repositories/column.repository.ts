import { Column } from '../entities/column.entity';

export const COLUMN_REPOSITORY = Symbol('COLUMN_REPOSITORY');

export interface IColumnRepository {
  findById(id: string): Promise<Column | null>;
  findByTableId(tableId: string): Promise<Column[]>;
  findByTableIdAndName(tableId: string, name: string): Promise<Column | null>;
  save(column: Column): Promise<Column>;
  delete(id: string): Promise<void>;
}

