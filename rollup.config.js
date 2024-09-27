import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const plugins = [resolve(), commonjs(), typescript(), terser()];

export default [
	{
		input: 'src/index.ts',
		output: { name: 'store', file: pkg.browser, format: 'umd' },
		plugins,
	},
	{
		input: 'src/index.ts',
		plugins,
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' },
		],
	},
];
