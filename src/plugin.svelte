<div class="plugin__mobile-header">{title}</div>

<section class="plugin__content erz">
    <div
        class="plugin__title plugin__title--chevron-back"
        role="button"
        tabindex="0"
        on:click={backToMenu}
        on:keydown={event => event.key === 'Enter' && backToMenu()}
    >
        {title}
    </div>

    {#if !$activeRoute}
        <DropZone onFile={loadFile} />
        <p class="erz__lead">
            ERZ is the gzipped export produced by sailing weather-routing software. The route is
            drawn on the map and the boat follows Windy's timeline, whichever overlay and model you
            have selected. It stays on the map after you close this panel, until you remove it.
        </p>
    {:else}
        {@const { route, sample, fileName, rangeWarning } = $activeRoute}
        {@const startTime = routeStart(route)}
        {@const endTime = routeEnd(route)}

        <Readout {sample} totalNm={route.distanceNm} />

        {#if rangeWarning}
            <div class="erz__warning">{rangeWarning}</div>
        {/if}

        <div class="erz__actions">
            <button type="button" class="button button--variant-orange size-s" on:click={jumpToStart}>
                Go to route start
            </button>
            <button type="button" class="button size-s" on:click={clearRoute}>Remove</button>
        </div>

        <dl class="erz__summary">
            <dt>File</dt>
            <dd>{fileName}</dd>

            <dt>Departure</dt>
            <dd>{formatClock(startTime)}</dd>

            <dt>Arrival</dt>
            <dd>{formatClock(endTime)}</dd>

            <dt>Duration</dt>
            <dd>{formatDuration(endTime - startTime)} · {formatDistance(route.distanceNm)}</dd>

            {#if route.modelId}
                <dt>Routing model</dt>
                <dd class="erz__break">{route.modelId}</dd>
            {/if}

            <dt>Points</dt>
            <dd>
                {route.points.length}
                {#if route.marks.length}· {route.marks.length} marks{/if}
                {#if route.skippedLines}
                    <span class="erz__muted">· {route.skippedLines} lines skipped</span>
                {/if}
            </dd>
        </dl>

        <label class="erz__timebase">
            <input type="checkbox" checked={route.timeBase === 'utc'} on:change={switchTimeBase} />
            File timestamps are UTC
        </label>
    {/if}

    {#if error}
        <div class="erz__error">{error}</div>
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';

    import DropZone from './components/DropZone.svelte';
    import Readout from './components/Readout.svelte';

    import {
        activeRoute,
        clearRoute,
        jumpToStart,
        loadRoute,
        toggleTimeBase,
    } from './lib/activeRoute';
    import { ErzParseError, parseErz, readErzFile, type ErzRoute } from './lib/erz';
    import { formatClock, formatDistance, formatDuration } from './lib/format';
    import { routeEnd, routeStart } from './lib/route';

    import config from './pluginConfig';

    const { title } = config;

    const backToMenu = () => bcast.emit('rqstOpen', 'menu');

    let error = '';

    const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

    // Reading and drawing are reported separately, so a map failure is not
    // misreported as a broken file.
    const loadFile = async (file: File) => {
        error = '';

        let text: string;
        let parsed: ErzRoute;

        try {
            text = await readErzFile(file);
            parsed = parseErz(text, 'utc');
        } catch (e) {
            clearRoute();
            error = e instanceof ErzParseError ? e.message : `Could not read the file: ${reason(e)}`;
            return;
        }

        try {
            loadRoute(parsed, text, file.name);
        } catch (e) {
            clearRoute();
            error = `The route could not be drawn on the map: ${reason(e)}`;
        }
    };

    const switchTimeBase = () => {
        try {
            toggleTimeBase();
        } catch (e) {
            error = reason(e);
        }
    };
</script>

<style lang="less">
    .erz {
        &__lead {
            margin-top: 16px;
            opacity: 0.7;
        }

        &__actions {
            display: flex;
            gap: 8px;
            margin: 16px 0;
        }

        &__summary {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 4px 12px;
            margin: 0;
            opacity: 0.85;

            dt {
                opacity: 0.6;
            }

            dd {
                margin: 0;
            }
        }

        &__break {
            word-break: break-all;
        }

        &__muted {
            opacity: 0.6;
        }

        &__warning,
        &__error {
            margin: 12px 0;
            padding: 6px 10px;
            border-radius: 3px;
        }

        &__warning {
            border-left: 3px solid #ffd400;
            background: rgba(255, 212, 0, 0.12);
        }

        &__error {
            border-left: 3px solid #ff4d4d;
            background: rgba(255, 77, 77, 0.12);
        }

        &__timebase {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 16px;
            opacity: 0.7;
            cursor: pointer;
        }
    }
</style>
