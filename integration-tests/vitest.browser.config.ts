import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: {
		global: 'globalThis',
	},
	optimizeDeps: {
		exclude: ['@duckdb/duckdb-wasm']
	},
	server: {
		fs: {
			allow: ['..', './public']
		}
	},
	test: {
		browser: {
			enabled: true,
			provider: 'playwright',
			instances: [
				{
					browser: 'chromium',
					launchOptions: {
						args: [
							'--enable-features=SharedArrayBuffer',
							'--disable-web-security',
							'--disable-features=VizDisplayCompositor',
							'--allow-running-insecure-content',
							'--disable-site-isolation-trials'
						]
					}
				}
			],
			fileServe: {
				'/duckdb-wasm': './public/duckdb-wasm'
			}
		},
		include: [
			'./tests/duckdb-wasm/**/*.browser.test.ts',
		],
		testTimeout: 30000,
		hookTimeout: 10000,
	},
});
