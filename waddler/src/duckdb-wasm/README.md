# DuckDB WASM Driver

This driver provides support for DuckDB WASM in browser environments.

## Installation

```bash
npm install @duckdb/duckdb-wasm
```

## Usage

### Basic Setup

```typescript
import { waddler } from 'waddler/duckdb-wasm';

// Initialize with default configuration
const sql = waddler({
  max: 10, // Maximum number of connections in pool
  min: 1,  // Minimum number of connections in pool
});

// Use the sql template
const result = await sql`SELECT 1 as test_value`;
console.log(result); // [{ test_value: 1 }]
```

### Custom WASM Bundle Configuration

```typescript
import { waddler } from 'waddler/duckdb-wasm';

const sql = waddler({
  wasmUrl: '/path/to/duckdb.wasm',
  workerUrl: '/path/to/duckdb-worker.js',
  max: 10,
});
```

### Query Examples

```typescript
// Create table
await sql`CREATE TABLE users (id INTEGER, name VARCHAR, email VARCHAR)`;

// Insert data
await sql`INSERT INTO users VALUES (1, 'John', 'john@example.com')`;

// Select data
const users = await sql`SELECT * FROM users WHERE id = ${1}`;

// Using identifiers
const tableName = 'users';
const result = await sql`SELECT * FROM ${sql.identifier(tableName)}`;

// Using values
await sql`INSERT INTO users VALUES ${sql.values([[2, 'Jane', 'jane@example.com']])}`;

// Raw queries with parameters
const rawResult = await sql.unsafe('SELECT * FROM users WHERE id = ?', [1]);

// Array mode
const arrayResult = await sql.unsafe('SELECT id, name FROM users', [], { rowMode: 'array' });
```

### Streaming

```typescript
// Stream results
for await (const row of sql`SELECT * FROM large_table`.stream()) {
  console.log(row);
}
```

### Error Handling

```typescript
try {
  await sql`SELECT * FROM non_existent_table`;
} catch (error) {
  console.error('Query failed:', error.message);
}
```

## Browser Environment Setup

DuckDB WASM requires proper setup in browser environments:

1. **Serve WASM files**: Ensure the DuckDB WASM files are served from your web server
2. **CORS headers**: Configure proper CORS headers for WASM files
3. **SharedArrayBuffer**: Some features require SharedArrayBuffer support

### Example HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>DuckDB WASM Example</title>
</head>
<body>
  <script type="module">
    import { waddler } from './path/to/waddler/duckdb-wasm/index.js';
    
    async function main() {
      const sql = waddler({ max: 5 });
      const result = await sql\`SELECT 'Hello, DuckDB WASM!' as message\`;
      console.log(result);
    }
    
    main().catch(console.error);
  </script>
</body>
</html>
```

## Configuration Options

- `wasmUrl`: Custom URL for the DuckDB WASM module
- `workerUrl`: Custom URL for the DuckDB worker script
- `config`: DuckDB configuration options
- `min`: Minimum number of connections in the pool (default: 1)
- `max`: Maximum number of connections in the pool (default: 1)
- `logger`: Logger configuration (boolean or custom logger object)

## Limitations

- **Streaming**: True streaming is not supported; results are loaded entirely into memory
- **File System**: Limited file system access compared to Node.js version
- **Performance**: May be slower than native implementations for large datasets
- **Browser Compatibility**: Requires modern browsers with WASM support

## Browser Compatibility

- Chrome/Edge 57+
- Firefox 52+
- Safari 11+
- Modern mobile browsers

For SharedArrayBuffer features:
- Chrome/Edge 68+
- Firefox 79+
- Safari 15.2+
