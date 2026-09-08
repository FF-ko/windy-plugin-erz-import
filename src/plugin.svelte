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

    {#if !route}
        <DropZone onFile={loadFile} />
        <p class="erz__lead">
            ERZ is the gzipped export produced by sailing weather-routing software. The route is
            drawn on the map and the boat follows Windy's timeline, whichever overlay and model you
            have selected.
        </p>
    {:else}
        {#if sample}
            <Readout {sample} totalNm={route.distanceNm} />
        {/if}

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
            <input type="checkbox" checked={route.timeBase === 'utc'} on:change={toggleTimeBase} />
            File timestamps are UTC
        </label>
    {/if}

    {#if error}
        <div class="erz__error">{error}</div>
    {/if}
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';

    import { onDestroy, onMount } from 'svelte';

    import DropZone from './components/DropZone.svelte';
    import Readout from './components/Readout.svelte';

    import { ErzParseError, parseErz, readErzFile, type ErzRoute, type TimeBase } from './lib/erz';
    import { formatClock, formatDistance, formatDuration } from './lib/format';
    import { RouteLayer } from './lib/mapLayer';
    import { routeEnd, routeStart, sampleRouteAt, type RouteSample } from './lib/route';

    import config from './pluginConfig';

    const { title } = config;

    const backToMenu = () => bcast.emit('rqstOpen', 'menu');

    let route: ErzRoute | null = null;
    let sample: RouteSample | null = null;
    let layer: RouteLayer | null = null;
    let fileName = '';
    let error = '';
    let rangeWarning = '';

    /** Kept so the time base can be switched without asking for the file again. */
    let rawText = '';

    let subscriptions: number[] = [];
    let pendingFrame = 0;

    $: startTime = route ? routeStart(route) : 0;
    $: endTime = route ? routeEnd(route) : 0;

    const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

    // Reading and drawing are reported separately, so a map failure is not
    // misreported as a broken file.
    const loadFile = async (file: File) => {
        error = '';

        let parsed: ErzRoute;

        try {
            rawText = await readErzFile(file);
            parsed = parseErz(rawText, 'utc');
        } catch (e) {
            clearRoute();
            error = e instanceof ErzParseError ? e.message : `Could not read the file: ${reason(e)}`;
            return;
        }

        fileName = file.name;

        try {
            applyRoute(parsed);
            layer?.fitBounds();
        } catch (e) {
            clearRoute();
            error = `The route could not be drawn on the map: ${reason(e)}`;
        }
    };

    const applyRoute = (parsed: ErzRoute) => {
        layer?.destroy();

        route = parsed;
        layer = new RouteLayer(parsed);

        syncToTimeline();
        updateRangeWarning();
    };

    const toggleTimeBase = () => {
        if (!route) {
            return;
        }

        const next: TimeBase = route.timeBase === 'utc' ? 'local' : 'utc';

        try {
            applyRoute(parseErz(rawText, next));
        } catch (e) {
            error = reason(e);
        }
    };

    const clearRoute = () => {
        layer?.destroy();
        layer = null;
        route = null;
        sample = null;
        rangeWarning = '';
        rawText = '';
        fileName = '';
    };

    /** Moves the boat to whatever moment the timeline is showing. */
    const syncToTimeline = () => {
        if (!route) {
            return;
        }

        const next = sampleRouteAt(route, store.get('timestamp'));
        sample = next;
        layer?.update(next);
    };

    // The timeline emits a timestamp per frame while animating, so redraws are
    // coalesced to one per animation frame.
    const scheduleSync = () => {
        if (pendingFrame) {
            return;
        }

        pendingFrame = requestAnimationFrame(() => {
            pendingFrame = 0;
            syncToTimeline();
        });
    };

    /**
     * The selected model decides how far the timeline reaches, so the warning is
     * recomputed whenever the user switches model or overlay.
     */
    const updateRangeWarning = () => {
        rangeWarning = '';

        if (!route) {
            return;
        }

        const calendar = store.get('calendar');
        if (!calendar) {
            return;
        }

        // Read the span from the route directly — Svelte's reactive values have
        // not been recomputed yet when this runs straight after a load.
        const from = routeStart(route);
        const to = routeEnd(route);

        if (from > calendar.end) {
            rangeWarning = 'The route starts after the selected model’s forecast ends.';
        } else if (to < calendar.start) {
            rangeWarning = 'The route ended before the selected model’s forecast begins.';
        } else if (to > calendar.end || from < calendar.start) {
            rangeWarning = 'Only part of the route is covered by the selected model.';
        }
    };

    const jumpToStart = () => {
        if (!route) {
            return;
        }

        const from = routeStart(route);
        const calendar = store.get('calendar');

        store.set('timestamp', calendar ? calendar.boundTs(from) : from);
    };

    export const onopen = () => {
        layer?.fitBounds();
    };

    onMount(() => {
        subscriptions = [
            store.on('timestamp', scheduleSync),
            store.on('calendar', updateRangeWarning),
        ];
    });

    onDestroy(() => {
        subscriptions.forEach(id => store.off(id));
        subscriptions = [];

        if (pendingFrame) {
            cancelAnimationFrame(pendingFrame);
        }

        clearRoute();
    });
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
