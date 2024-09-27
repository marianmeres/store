import fs from 'node:fs';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

export default [
	// browser-friendly UMD build
	{
		input: 'src/index.ts',
		output: { name: 'store', file: pkg.browser, format: 'umd' },
		plugins: [resolve(), commonjs(), typescript(), terser()],
	},
	{
		input: 'src/index.ts',
		plugins: [resolve(), commonjs(), typescript(), terser()],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' },
		],
	},
];
