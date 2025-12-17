import { BaseEntity } from './base.entity';
import { ValidationError } from '../errors/domain.error';

export type ColumnDataType =
  | 'STRING'
  | 'INTEGER'
  | 'FLOAT'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'JSON'
  | 'TEXT'
  | 'UUID';

export class Column extends BaseEntity {
  private _tableId: string;
  private _name: string;
  private _displayName: string | null;
  private _dataType: ColumnDataType;
  private _description: string | null;
  private _isPrimaryKey: boolean;
  private _isForeignKey: boolean;
  private _isNullable: boolean;
  private _isUnique: boolean;
  private _defaultValue: string | null;
  private _foreignKeyTable: string | null;
  private _foreignKeyColumn: string | null;
  private _order: number;

  constructor(props: {
    id: string;
    tableId: string;
    name: string;
    displayName?: string | null;
    dataType?: ColumnDataType;
    description?: string | null;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    isNullable?: boolean;
    isUnique?: boolean;
    defaultValue?: string | null;
    foreignKeyTable?: string | null;
    foreignKeyColumn?: string | null;
    order?: number;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    const now = new Date();
    super(props.id, props.createdAt ?? now, props.updatedAt ?? now);
    this._tableId = props.tableId;
    this._name = props.name;
    this._displayName = props.displayName ?? null;
    this._dataType = props.dataType ?? 'STRING';
    this._description = props.description ?? null;
    this._isPrimaryKey = props.isPrimaryKey ?? false;
    this._isForeignKey = props.isForeignKey ?? false;
    this._isNullable = props.isNullable ?? true;
    this._isUnique = props.isUnique ?? false;
    this._defaultValue = props.defaultValue ?? null;
    this._foreignKeyTable = props.foreignKeyTable ?? null;
    this._foreignKeyColumn = props.foreignKeyColumn ?? null;
    this._order = props.order ?? 0;
  }

  get tableId(): string {
    return this._tableId;
  }

  get name(): string {
    return this._name;
  }

  get displayName(): string | null {
    return this._displayName;
  }

  get dataType(): ColumnDataType {
    return this._dataType;
  }

  get description(): string | null {
    return this._description;
  }

  get isPrimaryKey(): boolean {
    return this._isPrimaryKey;
  }

  get isForeignKey(): boolean {
    return this._isForeignKey;
  }

  get isNullable(): boolean {
    return this._isNullable;
  }

  get isUnique(): boolean {
    return this._isUnique;
  }

  get defaultValue(): string | null {
    return this._defaultValue;
  }

  get foreignKeyTable(): string | null {
    return this._foreignKeyTable;
  }

  get foreignKeyColumn(): string | null {
    return this._foreignKeyColumn;
  }

  get order(): number {
    return this._order;
  }

  updateName(name: string): void {
    if (!name || name.length === 0) {
      throw new ValidationError('Column name is required');
    }
    this._name = name;
  }

  updateDisplayName(displayName: string | null): void {
    this._displayName = displayName;
  }

  updateDataType(dataType: ColumnDataType): void {
    this._dataType = dataType;
  }

  updateDescription(description: string | null): void {
    this._description = description;
  }

  setAsPrimaryKey(isPrimaryKey: boolean): void {
    this._isPrimaryKey = isPrimaryKey;
    if (isPrimaryKey) {
      this._isNullable = false;
    }
  }

  setForeignKey(table: string | null, column: string | null): void {
    if ((table && !column) || (!table && column)) {
      throw new ValidationError('Both foreign key table and column must be provided or neither');
    }
    this._isForeignKey = !!table;
    this._foreignKeyTable = table;
    this._foreignKeyColumn = column;
  }

  updateOrder(order: number): void {
    this._order = order;
  }

  static create(props: {
    id: string;
    tableId: string;
    name: string;
    displayName?: string | null;
    dataType?: ColumnDataType;
    description?: string | null;
    isPrimaryKey?: boolean;
    isForeignKey?: boolean;
    isNullable?: boolean;
    isUnique?: boolean;
    defaultValue?: string | null;
    foreignKeyTable?: string | null;
    foreignKeyColumn?: string | null;
    order?: number;
  }): Column {
    if (!props.name || props.name.length === 0) {
      throw new ValidationError('Column name is required');
    }
    return new Column(props);
  }
}

