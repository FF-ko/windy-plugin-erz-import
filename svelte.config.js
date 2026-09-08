import sveltePreprocess from 'svelte-preprocess';
import { less } from 'svelte-preprocess-less';

/**
 * Shared by rollup and svelte-check, so type checking sees the components
 * through the same preprocessors the build uses.
 */
export const preprocess = {
    style: less({
        sourceMap: false,
        math: 'always',
    }),
    script: data => sveltePreprocess({ sourceMap: true }).script(data),
};

export default { preprocess };
