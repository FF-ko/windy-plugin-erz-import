import store from '@windy/store';

import { readonly, writable } from 'svelte/store';

import { parseErz, type ErzRoute, type TimeBase } from './erz';
import { RouteLayer } from './mapLayer';
import { routeEnd, routeStart, sampleRouteAt, type RouteSample } from './route';

export interface ActiveRoute {
    route: ErzRoute;
    fileName: string;
    sample: RouteSample;
    rangeWarning: string;
}

// Windy destroys the panel component on every close but evaluates the plugin
// module only once, so the route is owned here rather than by the panel: it
// stays on the map and keeps following the timeline until removed, and a
// reopened panel picks it up without another import.
let current: ActiveRoute | null = null;
let layer: RouteLayer | null = null;

/** Kept so the time base can be switched without asking for the file again. */
let rawText = '';

let subscriptions: number[] = [];
let pendingFrame = 0;

const state = writable<ActiveRoute | null>(null);

export const activeRoute = readonly(state);

const publish = (next: ActiveRoute | null) => {
    current = next;
    state.set(next);
};

const sampleNow = (route: ErzRoute) => sampleRouteAt(route, store.get('timestamp'));

const show = (route: ErzRoute, fileName: string) => {
    layer?.destroy();
    layer = new RouteLayer(route);

    const sample = sampleNow(route);
    layer.update(sample);

    publish({ route, fileName, sample, rangeWarning: rangeWarningFor(route) });
    followTimeline();
};

export const loadRoute = (route: ErzRoute, text: string, fileName: string): void => {
    rawText = text;
    show(route, fileName);
    layer?.fitBounds();
};

export const toggleTimeBase = (): void => {
    if (!current) {
        return;
    }

    const next: TimeBase = current.route.timeBase === 'utc' ? 'local' : 'utc';

    show(parseErz(rawText, next), current.fileName);
};

export const clearRoute = (): void => {
    stopFollowingTimeline();
    layer?.destroy();
    layer = null;
    rawText = '';
    publish(null);
};

export const jumpToStart = (): void => {
    if (!current) {
        return;
    }

    const from = routeStart(current.route);
    const calendar = store.get('calendar');

    store.set('timestamp', calendar ? calendar.boundTs(from) : from);
};

const followTimeline = () => {
    if (subscriptions.length) {
        return;
    }

    subscriptions = [
        store.on('timestamp', scheduleSync),
        store.on('calendar', updateRangeWarning),
    ];
};

const stopFollowingTimeline = () => {
    subscriptions.forEach(id => store.off(id));
    subscriptions = [];

    if (pendingFrame) {
        cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
    }
};

/** Moves the boat to whatever moment the timeline is showing. */
const syncToTimeline = () => {
    if (!current || !layer) {
        return;
    }

    const sample = sampleNow(current.route);
    layer.update(sample);

    publish({ ...current, sample });
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

const updateRangeWarning = () => {
    if (current) {
        publish({ ...current, rangeWarning: rangeWarningFor(current.route) });
    }
};

/**
 * The selected model decides how far the timeline reaches, so the warning is
 * recomputed whenever the user switches model or overlay.
 */
const rangeWarningFor = (route: ErzRoute): string => {
    const calendar = store.get('calendar');
    if (!calendar) {
        return '';
    }

    const from = routeStart(route);
    const to = routeEnd(route);

    if (from > calendar.end) {
        return 'The route starts after the selected model’s forecast ends.';
    }

    if (to < calendar.start) {
        return 'The route ended before the selected model’s forecast begins.';
    }

    if (to > calendar.end || from < calendar.start) {
        return 'Only part of the route is covered by the selected model.';
    }

    return '';
};
