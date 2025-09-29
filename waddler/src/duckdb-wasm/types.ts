import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface DuckDBWasmConnectionObj {
	db: AsyncDuckDB;
	connection: AsyncDuckDBConnection;
}
