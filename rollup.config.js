import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

import rollupCleanup from 'rollup-plugin-cleanup';
import serve from 'rollup-plugin-serve';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';

import { certificatePEM, keyPEM, transformCodeToESMPlugin } from '@windycom/plugin-devtools';

import { preprocess } from './svelte.config.js';

const useSourceMaps = true;

export default {
    input: 'src/plugin.svelte',
    output: [
        {
            file: 'dist/plugin.js',
            format: 'module',
            sourcemap: true,
        },
        {
            file: 'dist/plugin.min.js',
            format: 'module',
            plugins: [rollupCleanup({ comments: 'none', extensions: ['ts'] }), terser()],
        },
    ],

    onwarn: () => {
        /* Windy's template disables all warnings */
    },
    external: id => id.startsWith('@windy/'),
    watch: {
        include: ['src/**'],
        exclude: 'node_modules/**',
        clearScreen: false,
    },
    plugins: [
        rollupSvelte({
            emitCss: false,
            preprocess,
        }),
        rollupSwc({
            include: ['**/*.ts', '**/*.svelte'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            mainFields: ['module', 'jsnext:main', 'main'],
            preferBuiltins: false,
            dedupe: ['svelte'],
        }),
        commonjs(),
        transformCodeToESMPlugin(),
        process.env.SERVE !== 'false' &&
            serve({
                contentBase: 'dist',
                host: '0.0.0.0',
                port: 9999,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                https: {
                    key: keyPEM,
                    cert: certificatePEM,
                },
            }),
    ],
};
