import { expect, test } from 'vitest';
import { sql as sqlQuery } from 'waddler/duckdb-wasm';
import { filter1 } from './test-filters1';
import { filter2 } from './test-filters2';

// Note: DuckDB WASM tests are designed to run in a browser environment
// These Node.js tests only cover SQL template generation (no actual WASM execution)

// SQL template generation tests (these work in Node.js without WASM)
test('SQL template generation test', () => {
	const query = sqlQuery`SELECT * FROM users WHERE id = ${1} AND name = ${'test'};`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM users WHERE id = $1 AND name = $2;',
		params: [1, 'test'],
	});
});

test('SQL identifier generation test', () => {
	const query = sqlQuery`SELECT * FROM ${sqlQuery.identifier('users')};`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "users";',
		params: [],
	});
});

test('SQL values generation test', () => {
	const query = sqlQuery`INSERT INTO users VALUES ${sqlQuery.values([[1, 'test'], [2, 'test2']])};`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'INSERT INTO users VALUES (1, \'test\'), (2, \'test2\');',
		params: [],
	});
});

test('SQL raw generation test', () => {
	const query = sqlQuery`SELECT ${sqlQuery.raw('COUNT(*)')} FROM users;`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT COUNT(*) FROM users;',
		params: [],
	});
});

test('SQL default generation test', () => {
	const query = sqlQuery`INSERT INTO users (id, name) VALUES (${1}, ${sqlQuery.default});`;
	expect(query.toSQL()).toStrictEqual({
		sql: 'INSERT INTO users (id, name) VALUES ($1, default);',
		params: [1],
	});
});

test('embedding filters test', () => {
	const query1 = sqlQuery`SELECT * FROM ${sqlQuery.identifier('users')} WHERE ${filter1({ id: 1, name: 'a' })};`;
	expect(query1.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "users" WHERE id = $1 AND name = $2;',
		params: [1, 'a'],
	});

	const query2 = sqlQuery`SELECT * FROM ${sqlQuery.identifier('users')} WHERE ${filter2({ id: 1, name: 'a' })};`;
	expect(query2.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "users" WHERE id = $1 AND name = $2;',
		params: [1, 'a'],
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
