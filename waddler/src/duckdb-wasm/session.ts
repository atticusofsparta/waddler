import { WaddlerQueryError } from '../errors/index.ts';
import type { RecyclingPool } from '../recycling-pool.ts';
import type { Dialect } from '../sql-template-params.ts';
import type { SQLTemplateConfigOptions } from '../sql-template.ts';
import { SQLTemplate } from '../sql-template.ts';
import type { SQLWrapper } from '../sql.ts';
import type { DuckDBWasmConnectionObj } from './types.ts';

export class DuckdbWasmSQLTemplate<T> extends SQLTemplate<T> {
	constructor(
		sql: SQLWrapper,
		protected readonly pool: RecyclingPool<DuckDBWasmConnectionObj>,
		dialect: Dialect,
		configOptions: SQLTemplateConfigOptions,
		private options: { rowMode: 'array' | 'default' } = { rowMode: 'default' },
	) {
		super(sql, dialect, configOptions);
	}

	async execute() {
		const { sql: query, params } = this.sqlWrapper.getQuery(this.dialect);
		let finalRes;
		let finalMetadata: any | undefined;

		const connObj = await this.pool.acquire();

		// wrapping duckdb driver error in new js error to add stack trace to it
		try {
			// DuckDB WASM uses a different API for parameter binding
			// For now, we'll use direct query execution with parameter substitution
			// In a production implementation, you'd want proper parameter binding
			let finalQuery = query;
			if (params && params.length > 0) {
				// Simple parameter substitution - in production, use proper binding
				for (const [index, param] of params.entries()) {
					const placeholder = `$${index + 1}`;
					let value: string;
					if (param === null) {
						value = 'NULL';
					} else if (typeof param === 'string') {
						value = `'${param.replace(/'/g, "''")}'`;
					} else if (typeof param === 'number' || typeof param === 'bigint') {
						value = param.toString();
					} else if (typeof param === 'boolean') {
						value = param ? 'TRUE' : 'FALSE';
					} else if (param instanceof Date) {
						value = `'${param.toISOString()}'`;
					} else {
						value = `'${JSON.stringify(param)}'`;
					}
					finalQuery = finalQuery.replace(placeholder, value);
				}
			}

			const result = await connObj.connection.query(finalQuery);

			finalMetadata = {
				columnCount: result.numCols,
				rowsChanged: result.numRows,
			};

			// Transform result based on row mode
			if (this.options.rowMode === 'default') {
				// DuckDB WASM's toArray() returns StructRow objects, convert to plain objects
				const rows = result.toArray();
				finalRes = rows.map((row: any) => {
					const plainObj: any = {};
					// Copy all enumerable properties from StructRow to plain object
					for (const key in row) {
						if (Object.prototype.hasOwnProperty.call(row, key)) {
							let value = row[key];
							// Convert Arrow Vector objects to plain JavaScript arrays
							if (value && typeof value === 'object' && value.toArray) {
								const arrayValue = value.toArray();
								// Convert typed arrays to regular arrays
								value = Array.isArray(arrayValue) ? arrayValue : [...arrayValue];
							}
							plainObj[key] = value;
						}
					}
					return plainObj;
				});
			} else {
				// For array mode, we need to convert objects back to arrays
				const rows = result.toArray();
				const columnNames = result.schema.fields.map((field: any) => field.name);

				finalRes = rows.map((row: any) => {
					return columnNames.map((name: string) => {
						let value = row[name];
						// Convert Arrow Vector objects to plain JavaScript arrays
						if (value && typeof value === 'object' && value.toArray) {
							value = value.toArray();
						}
						return value;
					});
				});
			}
		} catch (error) {
			await this.pool.release(connObj);
			throw new WaddlerQueryError(query, params, error as Error);
		}

		await this.pool.release(connObj);

		this.logger.logQuery(query, params, finalMetadata);

		return finalRes as T[];
	}

	async *stream() {
		const { sql: query, params } = this.sqlWrapper.getQuery(this.dialect);

		const connObj = await this.pool.acquire();

		// wrapping duckdb driver error in new js error to add stack trace to it
		try {
			// DuckDB WASM streaming - execute query and yield results
			// Use the same parameter substitution as in execute()
			let finalQuery = query;
			if (params && params.length > 0) {
				for (const [index, param] of params.entries()) {
					const placeholder = `$${index + 1}`;
					let value: string;
					if (param === null) {
						value = 'NULL';
					} else if (typeof param === 'string') {
						value = `'${param.replace(/'/g, "''")}'`;
					} else if (typeof param === 'number' || typeof param === 'bigint') {
						value = param.toString();
					} else if (typeof param === 'boolean') {
						value = param ? 'TRUE' : 'FALSE';
					} else if (param instanceof Date) {
						value = `'${param.toISOString()}'`;
					} else {
						value = `'${JSON.stringify(param)}'`;
					}
					finalQuery = finalQuery.replace(placeholder, value);
				}
			}

			const result = await connObj.connection.query(finalQuery);

			// For WASM, we'll yield all rows at once since the API doesn't support true streaming
			// In a real implementation, you might want to batch the results
			if (this.options.rowMode === 'default') {
				// DuckDB WASM's toArray() returns StructRow objects, convert to plain objects
				const rows = result.toArray();
				for (const row of rows) {
					const plainObj: any = {};
					// Copy all enumerable properties from StructRow to plain object
					for (const key in row) {
						if (Object.prototype.hasOwnProperty.call(row, key)) {
							let value = row[key];
							// Convert Arrow Vector objects to plain JavaScript arrays
							if (value && typeof value === 'object' && value.toArray) {
								const arrayValue = value.toArray();
								// Convert typed arrays to regular arrays
								value = Array.isArray(arrayValue) ? arrayValue : [...arrayValue];
							}
							plainObj[key] = value;
						}
					}
					yield plainObj as T;
				}
			} else {
				// For array mode, we need to convert objects back to arrays
				const rows = result.toArray();
				const columnNames = result.schema.fields.map((field: any) => field.name);

				for (const row of rows) {
					const arrayRow = columnNames.map((name: string) => {
						let value = row[name];
						// Convert Arrow Vector objects to plain JavaScript arrays
						if (value && typeof value === 'object' && value.toArray) {
							value = value.toArray();
						}
						return value;
					});
					yield arrayRow as T;
				}
			}
		} catch (error) {
			await this.pool.release(connObj);
			throw new WaddlerQueryError(query, params, error as Error);
		}

		await this.pool.release(connObj);
	}
}
