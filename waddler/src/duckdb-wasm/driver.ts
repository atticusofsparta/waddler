import * as duckdb from '@duckdb/duckdb-wasm';
import { DuckdbDialect, SQLFunctions } from '../duckdb-core/dialect.ts';
import type { Logger } from '../logger.ts';
import { DefaultLogger } from '../logger.ts';
import type { Factory } from '../pool-ts/types.ts';
import { RecyclingPool } from '../recycling-pool.ts';
import { SQLDefault, SQLIdentifier, SQLQuery, SQLRaw, SQLValues } from '../sql-template-params.ts';
import type { SQL } from '../sql.ts';
import { SQLWrapper } from '../sql.ts';
import type {
	Identifier,
	IdentifierObject,
	Raw,
	SQLParamType,
	UnsafeParamType,
	Values,
	WaddlerConfig,
} from '../types.ts';
import { DuckdbWasmSQLTemplate } from './session.ts';
import type { DuckDBWasmConnectionObj } from './types.ts';

export interface DuckdbWasmSQLQuery extends Pick<SQL, 'identifier' | 'raw' | 'default' | 'values'> {
	(strings: TemplateStringsArray, ...params: SQLParamType[]): SQLQuery;
}

const sql = ((strings: TemplateStringsArray, ...params: SQLParamType[]): SQLQuery => {
	const sqlWrapper = new SQLWrapper();
	sqlWrapper.with({ templateParams: { strings, params } });
	const dialect = new DuckdbDialect();

	return new SQLQuery(sqlWrapper, dialect);
}) as DuckdbWasmSQLQuery;

Object.assign(sql, SQLFunctions);

export { sql };

const createSqlTemplate = (
	pool: RecyclingPool<DuckDBWasmConnectionObj>,
	configOptions: WaddlerConfig,
): SQL => {
	const dialect = new DuckdbDialect();
	let logger: Logger | undefined;
	if (configOptions.logger === true) {
		logger = new DefaultLogger();
	} else if (configOptions.logger !== false) {
		logger = configOptions.logger;
	}
	const fn = <T>(strings: TemplateStringsArray, ...params: SQLParamType[]): DuckdbWasmSQLTemplate<T> => {
		const sql = new SQLWrapper();
		sql.with({ templateParams: { strings, params } }).prepareQuery(dialect);

		return new DuckdbWasmSQLTemplate<T>(sql, pool, dialect, { logger });
	};

	Object.assign(fn, {
		identifier: (value: Identifier<IdentifierObject>) => {
			return new SQLIdentifier(value);
		},
		values: (value: Values) => {
			return new SQLValues(value);
		},
		raw: (value: Raw) => {
			return new SQLRaw(value);
		},
		unsafe: async (query: string, params?: UnsafeParamType[], options?: { rowMode: 'array' | 'default' }) => {
			params = params ?? [];
			options = options ?? { rowMode: 'default' };

			const sqlWrapper = new SQLWrapper();
			sqlWrapper.with({ rawParams: { sql: query, params } });

			const unsafeDriver = new DuckdbWasmSQLTemplate(sqlWrapper, pool, dialect, { logger }, options);
			return await unsafeDriver.execute();
		},
		default: new SQLDefault(),
	});

	return fn as any;
};

const createFactory = (
	{
		wasmUrl,
		workerUrl,
	}: {
		wasmUrl?: string;
		workerUrl?: string;
	},
) => {
	const factory: Factory<DuckDBWasmConnectionObj> = {
		create: async function() {
			// wrapping duckdb driver error in new js error to add stack trace to it
			try {
				// Initialize DuckDB WASM
				const defaultBundles = duckdb.getJsDelivrBundles();
				const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
					mvp: {
						mainModule: wasmUrl || defaultBundles.mvp.mainModule!,
						mainWorker: workerUrl || defaultBundles.mvp.mainWorker!,
					},
					eh: {
						mainModule: wasmUrl || (defaultBundles.eh && defaultBundles.eh.mainModule) || '',
						mainWorker: workerUrl || (defaultBundles.eh && defaultBundles.eh.mainWorker) || '',
					},
				};

				// Select a bundle based on browser capabilities
				const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

				// Instantiate the asynchronous version of DuckDB-Wasm
				if (!bundle.mainWorker || !bundle.mainModule) {
					throw new Error('DuckDB WASM bundle is missing required files');
				}
				const worker = new Worker(bundle.mainWorker);
				const logger = new duckdb.ConsoleLogger();
				const db = new duckdb.AsyncDuckDB(logger, worker);
				await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

				// Create a connection
				const connection = await db.connect();

				const connObj: DuckDBWasmConnectionObj = { db, connection };

				return connObj;
			} catch (error) {
				const newError = new Error((error as Error).message);
				throw newError;
			}
		},
		destroy: async function(connObj: DuckDBWasmConnectionObj) {
			try {
				await connObj.connection.close();
				await connObj.db.terminate();
			} catch (error) {
				const newError = new Error((error as Error).message);
				throw newError;
			}
		},
	};

	return factory;
};

export function waddler(
	{
		wasmUrl,
		workerUrl,
		min = 1,
		max = 1,
		logger,
	}: {
		wasmUrl?: string;
		workerUrl?: string;
		min?: number;
		max?: number;
	} & WaddlerConfig,
) {
	const factory = createFactory({
		wasmUrl,
		workerUrl,
	});
	const options = {
		max, // maximum size of the pool
		min, // minimum size of the pool
	};

	const pool = new RecyclingPool<DuckDBWasmConnectionObj>(factory, options);

	return createSqlTemplate(pool, { logger });
}
