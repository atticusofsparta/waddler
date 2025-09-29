import { beforeAll, expect, test } from 'vitest';
import { sql as sqlQuery, waddler } from 'waddler/duckdb-wasm';
import { filter1 } from './test-filters1';
import { filter2 } from './test-filters2';

let sql: ReturnType<typeof waddler>;

// DuckDB WASM tests running in browser environment with Worker API available
beforeAll(async () => {
	// Initialize with default configuration for browser environment
	sql = waddler({ 
		max: 5,
		min: 1,
		// Use default CDN URLs for WASM files
	});
});


// Browser-specific WASM tests
test('basic query test', async () => {
	const result = await sql`SELECT 1 as test_value;`;
	expect(result).toEqual([{ test_value: 1 }]);
});

test('create table and insert test', async () => {
	await sql`CREATE TABLE test_table (id INTEGER, name VARCHAR);`;
	await sql`INSERT INTO test_table VALUES (1, 'test');`;
	
	const result = await sql`SELECT * FROM test_table;`;
	expect(result).toEqual([{ id: 1, name: 'test' }]);
	
	await sql`DROP TABLE test_table;`;
});

test('unsafe query test', async () => {
	const result = await sql.unsafe('SELECT 42 as param_value;', []);
	expect(result).toEqual([{ param_value: 42 }]);
});

test('parameterized unsafe query test', async () => {
	// Note: DuckDB WASM parameter binding works differently
	const result = await sql.unsafe('SELECT $1 as param_value;', [42]);
	expect(result).toEqual([{ param_value: 42 }]);
});

test('array row mode test', async () => {
	const result = await sql.unsafe('SELECT 1 as col1, 2 as col2;', [], { rowMode: 'array' });
	expect(result).toEqual([[1, 2]]);
});

test('streaming test', async () => {
	await sql`CREATE TABLE stream_test (id INTEGER);`;
	await sql`INSERT INTO stream_test VALUES (1), (2), (3);`;
	
	const results: any[] = [];
	for await (const row of sql`SELECT * FROM stream_test ORDER BY id;`.stream()) {
		results.push(row);
	}
	
	expect(results).toEqual([
		{ id: 1 },
		{ id: 2 },
		{ id: 3 }
	]);
	
	await sql`DROP TABLE stream_test;`;
});

test('logger test', async () => {
	let loggerCalled = false;
	
	const logger = {
		logQuery: (query: string, params: unknown[], metadata: any) => {
			expect(query).toContain('SELECT 42');
			expect(params).toBeDefined();
			expect(metadata).toHaveProperty('columnCount');
			expect(metadata).toHaveProperty('rowsChanged');
			loggerCalled = true;
		},
	};

	const loggerSql = waddler({ max: 5, logger });
	await loggerSql`SELECT 42;`;
	
	expect(loggerCalled).toBe(true);
});

test('sql template with identifiers test', async () => {
	await sql`CREATE TABLE ${sql.identifier('template_test')} (id INTEGER);`;
	await sql`INSERT INTO ${sql.identifier('template_test')} VALUES (1);`;
	
	const result = await sql`SELECT * FROM ${sql.identifier('template_test')};`;
	expect(result).toEqual([{ id: 1 }]);
	
	await sql`DROP TABLE ${sql.identifier('template_test')};`;
});

test('sql values test', async () => {
	await sql`CREATE TABLE values_test (id INTEGER, name VARCHAR);`;
	await sql`INSERT INTO values_test VALUES ${sql.values([[1, 'first'], [2, 'second']])};`;
	
	const result = await sql`SELECT * FROM values_test ORDER BY id;`;
	expect(result).toEqual([
		{ id: 1, name: 'first' },
		{ id: 2, name: 'second' }
	]);
	
	await sql`DROP TABLE values_test;`;
});

test('embeding SQLQuery and SQLTemplate test', async () => {
	await sql`CREATE TABLE embed_test (id INTEGER, name VARCHAR, email VARCHAR);`;
	await sql`INSERT INTO embed_test VALUES ${
		sql.values([[1, 'a', 'example1@gmail.com'], [2, 'b', 'example2@gmail.com']])
	};`;

	const query1 = sql`SELECT * FROM ${sql.identifier('embed_test')} WHERE ${filter1({ id: 1, name: 'a' })};`;
	expect(query1.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "embed_test" WHERE id = $1 AND name = $2;',
		params: [1, 'a'],
	});

	const res1 = await query1;
	expect(res1.length).toBeGreaterThan(0);

	const query2 = sql`SELECT * FROM ${sql.identifier('embed_test')} WHERE ${filter2({ id: 1, name: 'a' })};`;
	expect(query2.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "embed_test" WHERE id = $1 AND name = $2;',
		params: [1, 'a'],
	});

	const res2 = await query2;
	expect(res2.length).toBeGreaterThan(0);

	await sql`DROP TABLE embed_test;`;
});

// SQL template generation tests (these work in both environments)
test('SQL template generation test', () => {
	const query = sql`SELECT * FROM users WHERE id = ${1} AND name = ${'test'};`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM users WHERE id = $1 AND name = $2;',
		params: [1, 'test'],
	});
});

test('SQL identifier generation test', () => {
	const query = sql`SELECT * FROM ${sql.identifier('users')};`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "users";',
		params: [],
	});
});

test('SQL values generation test', () => {
	const query = sql`INSERT INTO users VALUES ${sql.values([[1, 'test'], [2, 'test2']])};`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'INSERT INTO users VALUES (1, \'test\'), (2, \'test2\');',
		params: [],
	});
});

test('standalone sql test', () => {
	const timestampSelector = sqlQuery`toStartOfHour(${sqlQuery.identifier('test')})`;
	const timestampFilter =
		sqlQuery`${sqlQuery``}${timestampSelector} >= from AND ${timestampSelector} < to${sqlQuery``}${sqlQuery`;`}`;

	expect(timestampFilter.toSQL()).toStrictEqual({
		sql: 'toStartOfHour("test") >= from AND toStartOfHour("test") < to;',
		params: [],
	});
});

// DuckDB-specific functionality tests
test('DuckDB data types test', async () => {
	await sql`
		CREATE TABLE types_test (
				int_col INTEGER,
				text_col VARCHAR,
				bool_col BOOLEAN,
				date_col DATE,
				timestamp_col TIMESTAMP
			);
	`;
	
	const testDate = new Date('2024-01-01T12:00:00Z');
	await sql`
		INSERT INTO types_test VALUES (
				${42},
				${'hello world'},
				${true},
				${testDate},
				${testDate}
			);
	`;
	
	const result = await sql`SELECT * FROM types_test;`;
	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({
		int_col: 42,
		text_col: 'hello world',
		bool_col: true,
	});
	
	await sql`DROP TABLE types_test;`;
});

test('DuckDB JSON support test', async () => {
	await sql`CREATE TABLE json_test (id INTEGER, data JSON);`;
	
	const jsonData = { name: 'test', values: [1, 2, 3] };
	await sql`INSERT INTO json_test VALUES (1, ${jsonData});`;
	
	const result = await sql`SELECT * FROM json_test;`;
	// DuckDB returns JSON as strings, which is the expected behavior
	expect(result).toEqual([{
		id: 1,
		data: JSON.stringify(jsonData)
	}]);
	
	// Test that we can parse the JSON back
	const parsedResult = result.map(row => ({
		...row,
		data: JSON.parse(row['data'] as string)
	}));
	expect(parsedResult).toEqual([{
		id: 1,
		data: jsonData
	}]);
	
	await sql`DROP TABLE json_test;`;
});
