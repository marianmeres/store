import fs from "node:fs";
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))

export default [
	{
		input: 'src/index.ts',
		plugins: [
			typescript(),
			resolve(),
			terser()
		],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		]
	}
];
