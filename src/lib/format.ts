import metrics from '@windy/metrics';

const KNOTS_TO_MS = 0.514444;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Wall clock in the user's own timezone, matching Windy's timeline labels. */
export const formatClock = (time: number): string =>
    new Date(time).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });

export const formatDuration = (ms: number): string => {
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
};

export const formatDistance = (nm: number): string => `${nm.toFixed(1)} nm`;

/**
 * Wind speed in whatever unit the user picked in Windy's settings. ERZ stores
 * knots, while Windy's metrics convert from m/s.
 */
export const formatWind = (knots: number): string =>
    metrics.wind.convertValue(knots * KNOTS_TO_MS);

export const formatDirection = (deg: number): string => {
    const index = Math.round(deg / 45) % COMPASS.length;
    return `${Math.round(deg)}° ${COMPASS[index]}`;
};

export const formatSpeed = (knots: number): string => `${knots.toFixed(1)} kn`;
