declare module 'better-sqlite3' {
  import { EventEmitter } from 'events';

  export class Statement {
    database: Database;
    source: string;
    reader: boolean;
    readonly: boolean;
    busy: boolean;

    run(...params: any[]): Database.RunResult;
    get(...params: any[]): any;
    all(...params: any[]): any[];
    iterate(...params: any[]): IterableIterator<any>;
    pluck(toggle?: boolean): this;
    expand(toggle?: boolean): this;
    raw(toggle?: boolean): this;
    bind(...params: any[]): this;
    columns(): ColumnDefinition[];
    safeIntegers(toggle?: boolean): this;
  }

  export class Database extends EventEmitter {
    constructor(filename: string, options?: Database.Options);

    memory: boolean;
    readonly: boolean;
    open: boolean;
    inTransaction: boolean;
    name: string;
    pragma(source: string, options?: Database.PragmaOptions): any;
    exec(source: string): this;
    prepare(source: string): Statement;
    transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
    function(name: string, cb: (...args: any[]) => any): this;
    function(name: string, options: Database.RegistrationOptions, cb: (...args: any[]) => any): this;
    aggregate(name: string, options: Database.AggregateOptions): this;
    loadExtension(path: string): this;
    close(): this;
    defaultSafeIntegers(toggle?: boolean): this;
    backup(destinationFile: string, options?: Database.BackupOptions): Promise<Database.BackupMetadata>;
  }

  namespace Database {
    interface Options {
      memory?: boolean;
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (...args: any[]) => void;
    }

    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface ColumnDefinition {
      name: string;
      column: string | null;
      table: string | null;
      database: string | null;
      type: string | null;
    }

    interface PragmaOptions {
      simple?: boolean;
    }

    interface RegistrationOptions {
      varargs?: boolean;
      deterministic?: boolean;
      safeIntegers?: boolean;
    }

    interface AggregateOptions extends RegistrationOptions {
      start?: any;
      step: (total: any, next: any) => any;
      inverse?: (total: any, dropped: any) => any;
      result?: (total: any) => any;
    }

    interface BackupOptions {
      progress?: (info: BackupMetadata) => number;
    }

    interface BackupMetadata {
      totalPages: number;
      remainingPages: number;
    }
  }

  export = Database;
}
