import { expect, test } from 'vitest';
import { sql as sqlQuery } from 'waddler/duckdb-wasm';

// Simple tests that don't require actual WASM connection
// These test the SQL template functionality which is the core of waddler

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

test('Complex SQL template test', () => {
	const tableName = 'users';
	const conditions = [
		{ field: 'age', operator: '>', value: 18 },
		{ field: 'status', operator: '=', value: 'active' }
	];
	
	const whereClause = sqlQuery``;
	for (const [index, condition] of conditions.entries()) {
		if (index > 0) {
			whereClause.append(sqlQuery` AND `);
		}
		whereClause.append(sqlQuery`${sqlQuery.identifier(condition.field)} ${sqlQuery.raw(condition.operator)} ${condition.value}`);
	}
	
	const query = sqlQuery`SELECT * FROM ${sqlQuery.identifier(tableName)} WHERE ${whereClause};`;
	
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM "users" WHERE "age" > $1 AND "status" = $2;',
		params: [18, 'active'],
	});
});

test('Nested SQL template test', () => {
	const subquery = sqlQuery`SELECT id FROM users WHERE active = ${true}`;
	const mainQuery = sqlQuery`SELECT * FROM orders WHERE user_id IN (${subquery});`;
	
	expect(mainQuery.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE active = $1);',
		params: [true],
	});
});

test('SQL template append functionality', () => {
	const query = sqlQuery`SELECT * FROM users`;
	query.append(sqlQuery` WHERE id = ${1}`);
	query.append(sqlQuery` AND name = ${'test'}`);
	
	expect(query.toSQL()).toStrictEqual({
		sql: 'SELECT * FROM users WHERE id = $1 AND name = $2',
		params: [1, 'test'],
	});
});

test('Empty SQL template test', () => {
	const query = sqlQuery``;
	expect(query.toSQL()).toStrictEqual({
		sql: '',
		params: [],
	});
});

test('SQL template with various data types', () => {
	const date = new Date('2024-01-01T12:00:00Z');
	// Use Uint8Array instead of Buffer for browser compatibility
	const uint8Array = new Uint8Array([104, 101, 108, 108, 111]); // 'hello' in bytes
	const query = sqlQuery`INSERT INTO test VALUES (${1}, ${'string'}, ${true}, ${null}, ${date}, ${uint8Array});`;
	
	expect(query.toSQL()).toStrictEqual({
		sql: 'INSERT INTO test VALUES ($1, $2, $3, $4, $5, $6);',
		params: [1, 'string', true, null, date, uint8Array],
	});
});
