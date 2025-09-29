import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: {
		global: 'globalThis',
	},
	optimizeDeps: {
		exclude: ['@duckdb/duckdb-wasm']
	},
	test: {
		browser: {
			enabled: true,
			provider: 'playwright',
			name: 'chromium',
			providerOptions: {
				launch: {
					args: [
						'--enable-features=SharedArrayBuffer',
						'--disable-web-security',
						'--disable-features=VizDisplayCompositor'
					]
				}
			}
		},
		include: [
			'./tests/duckdb-wasm/**/*.browser.test.ts',
		],
		testTimeout: 30000,
		hookTimeout: 10000,
	},
});
