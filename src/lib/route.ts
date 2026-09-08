import type { ErzRoute, RoutePoint } from './erz';
import {
    interpolateAngle,
    interpolateNumber,
    interpolatePosition,
    type LatLon,
} from './geo';

export type SampleStatus = 'before' | 'on' | 'after';

export interface RouteSample {
    /** Whether the requested time falls inside the route's own time span. */
    status: SampleStatus;
    position: LatLon;
    speedKn: number;
    courseDeg: number;
    windSpeedKn: number;
    windDirDeg: number;
    gustKn: number | null;
    pressureHpa: number | null;
    temperatureC: number | null;
    sailName: string | null;
    /** Distance sailed from the route start, in nautical miles. */
    coveredNm: number;
}

export const routeStart = (route: ErzRoute): number => route.points[0].time;
export const routeEnd = (route: ErzRoute): number => route.points[route.points.length - 1].time;

/**
 * Position and conditions along the route at an arbitrary time.
 *
 * Times before the start or after the end clamp to the respective endpoint and
 * report it via `status`, so the caller can show the boat parked at the dock
 * rather than hiding it or extrapolating a position the routing never predicted.
 */
export const sampleRouteAt = (route: ErzRoute, time: number): RouteSample => {
    const { points } = route;

    if (time <= points[0].time) {
        return atPoint(route, 0, 'before');
    }

    const lastIndex = points.length - 1;
    if (time >= points[lastIndex].time) {
        return atPoint(route, lastIndex, 'after');
    }

    const index = findSegmentIndex(points, time);
    const from = points[index - 1];
    const to = points[index];

    const span = to.time - from.time;
    const fraction = span > 0 ? (time - from.time) / span : 0;

    return {
        status: 'on',
        position: interpolatePosition(from.position, to.position, fraction),

        // Speed, course and sail describe the leg that ends at `to`, so they are
        // constant across the segment rather than interpolated between points.
        speedKn: to.speedKn,
        courseDeg: to.courseDeg,
        sailName: to.sailName,

        windSpeedKn: interpolateNumber(from.windSpeedKn, to.windSpeedKn, fraction),
        windDirDeg: interpolateAngle(from.windDirDeg, to.windDirDeg, fraction),
        gustKn: interpolateOptional(from.gustKn, to.gustKn, fraction),
        pressureHpa: interpolateOptional(from.pressureHpa, to.pressureHpa, fraction),
        temperatureC: interpolateOptional(from.temperatureC, to.temperatureC, fraction),

        coveredNm: from.cumulativeNm + to.legNm * fraction,
    };
};

/** Index of the first point at or after `time`; the segment is [index - 1, index]. */
const findSegmentIndex = (points: RoutePoint[], time: number): number => {
    let low = 1;
    let high = points.length - 1;

    while (low < high) {
        const mid = (low + high) >> 1;
        if (points[mid].time < time) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return low;
};

const atPoint = (route: ErzRoute, index: number, status: SampleStatus): RouteSample => {
    const point = route.points[index];

    return {
        status,
        position: point.position,
        speedKn: point.speedKn,
        courseDeg: point.courseDeg,
        windSpeedKn: point.windSpeedKn,
        windDirDeg: point.windDirDeg,
        gustKn: point.gustKn,
        pressureHpa: point.pressureHpa,
        temperatureC: point.temperatureC,
        sailName: point.sailName,
        coveredNm: point.cumulativeNm,
    };
};

/** Interpolates a reading that either endpoint may be missing. */
const interpolateOptional = (
    from: number | null,
    to: number | null,
    fraction: number,
): number | null =>
    from === null || to === null ? from ?? to : interpolateNumber(from, to, fraction);
