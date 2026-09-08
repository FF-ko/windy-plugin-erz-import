import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseErz, readErzFile } from '../src/lib/erz';
import { bearingDeg, distanceNm } from '../src/lib/geo';
import { sampleRouteAt } from '../src/lib/route';

const samplePath = fileURLToPath(new URL('../sample/routing-sample.erz', import.meta.url));

const loadSample = () => {
    const bytes = readFileSync(samplePath);
    return readErzFile(new File([bytes], 'routing-sample.erz'));
};

const load = async () => parseErz(await loadSample());

const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('ERZ reader', () => {
    it('decompresses gzip and decodes Latin-1 sail names', async () => {
        const text = await loadSample();

        expect(text.split(/\r?\n/).filter(Boolean)).toHaveLength(21);
        expect(text).toContain('FR0 (Tête)');
    });

    it('parses positions from NMEA degrees and decimal minutes', async () => {
        const { points } = await load();

        expect(points).toHaveLength(21);
        expect(points[0].position.lat).toBeCloseTo(47.7792, 4);
        expect(points[0].position.lon).toBeCloseTo(-4.07935, 4);
    });

    it('reads timestamps as UTC', async () => {
        const { points } = await load();

        expect(points[0].time).toBe(Date.UTC(2026, 7, 31, 18, 36, 42));
        expect(points[20].time).toBe(Date.UTC(2026, 8, 1, 11, 52, 29));
    });

    it('shifts timestamps when the file is read as local time', async () => {
        const text = await loadSample();

        const utc = parseErz(text, 'utc').points[0].time;
        const local = parseErz(text, 'local').points[0].time;

        expect(utc - local).toBe(new Date(utc).getTimezoneOffset() * -60000);
    });

    it('captures the routing model and the marks that were passed', async () => {
        const route = await load();

        expect(route.modelId).toBe('arome_0_025.2026-08-31T18-21-58Z');
        expect(route.marks).toHaveLength(2);
        expect(route.marks[0].time).toBe(Date.UTC(2026, 7, 31, 20, 12, 50));
    });

    it('reads the sail in use for each leg', async () => {
        const { points } = await load();

        expect(points[1].sailName).toBe('J1');
        expect(points[3].sailName).toBe('FR0 (Tête)');
        expect(points[0].sailName).toBeNull();
    });

    it('treats the FLT_MAX padding as a missing value', async () => {
        const { points } = await load();

        // Field 48 is FLT_MAX in every row of the sample; nothing we expose may carry it.
        for (const point of points) {
            for (const value of [point.gustKn, point.pressureHpa, point.temperatureC]) {
                expect(value === null || Math.abs(value) < 1e30).toBe(true);
            }
        }
    });

    /**
     * The field mapping has no public spec, so it is pinned against geometry:
     * speed and course must reproduce the distance and bearing actually sailed.
     * Course is stored as whole degrees, so agreement is asserted below 1°.
     */
    it('agrees with the geometry of the track it describes', async () => {
        const { points, distanceNm: total } = await load();

        for (let i = 1; i < points.length; i++) {
            const from = points[i - 1];
            const to = points[i];

            const hours = (to.time - from.time) / 3600000;
            const measuredKn = distanceNm(from.position, to.position) / hours;
            const measuredDeg = bearingDeg(from.position, to.position);

            expect(measuredKn).toBeCloseTo(to.speedKn, 1);
            expect(angleBetween(measuredDeg, to.courseDeg)).toBeLessThan(1);
        }

        expect(total).toBeCloseTo(102.1, 0);
    });
});

describe('route sampling', () => {
    it('clamps to the departure point before the route starts', async () => {
        const route = await load();
        const sample = sampleRouteAt(route, route.points[0].time - 3600000);

        expect(sample.status).toBe('before');
        expect(sample.position).toEqual(route.points[0].position);
        expect(sample.coveredNm).toBe(0);
    });

    it('clamps to the arrival point after the route ends', async () => {
        const route = await load();
        const sample = sampleRouteAt(route, route.points[20].time + 3600000);

        expect(sample.status).toBe('after');
        expect(sample.position).toEqual(route.points[20].position);
        expect(sample.coveredNm).toBeCloseTo(route.distanceNm, 6);
    });

    it('returns each point exactly when asked for its own time', async () => {
        const route = await load();

        for (const point of route.points.slice(1, -1)) {
            const sample = sampleRouteAt(route, point.time);

            expect(sample.position.lat).toBeCloseTo(point.position.lat, 9);
            expect(sample.position.lon).toBeCloseTo(point.position.lon, 9);
        }
    });

    it('interpolates position and wind between two points', async () => {
        const route = await load();
        const [first, second] = route.points;

        const sample = sampleRouteAt(route, (first.time + second.time) / 2);

        expect(sample.status).toBe('on');
        expect(sample.position.lat).toBeCloseTo((first.position.lat + second.position.lat) / 2, 9);
        expect(sample.windSpeedKn).toBeCloseTo(
            (first.windSpeedKn + second.windSpeedKn) / 2,
            9,
        );

        // Speed and course belong to the leg being sailed, not to its endpoints.
        expect(sample.speedKn).toBe(second.speedKn);
        expect(sample.courseDeg).toBe(second.courseDeg);
    });

    it('advances monotonically along the route', async () => {
        const route = await load();
        const start = route.points[0].time;
        const end = route.points[20].time;

        let previous = -1;
        for (let step = 0; step <= 100; step++) {
            const { coveredNm } = sampleRouteAt(route, start + ((end - start) * step) / 100);

            expect(coveredNm).toBeGreaterThanOrEqual(previous);
            previous = coveredNm;
        }

        expect(previous).toBeCloseTo(route.distanceNm, 6);
    });
});

/** Guards `sample/erz-shift.mjs`: a shifted file must differ only in its dates. */
describe('date-shifted sample', () => {
    const shiftedPath = fileURLToPath(new URL('../sample/Routing_9.9.2026.erz', import.meta.url));

    const loadShifted = async () =>
        parseErz(await readErzFile(new File([readFileSync(shiftedPath)], 'Routing_9.9.2026.erz')));

    it('parses, and keeps the geometry and leg timings of the original', async () => {
        const original = await load();
        const shifted = await loadShifted();

        expect(shifted.points).toHaveLength(original.points.length);
        expect(shifted.distanceNm).toBeCloseTo(original.distanceNm, 9);
        expect(shifted.marks).toHaveLength(original.marks.length);

        const offset = shifted.points[0].time - original.points[0].time;
        expect(offset % 86400000).toBe(0);

        for (let i = 0; i < original.points.length; i++) {
            expect(shifted.points[i].time - original.points[i].time).toBe(offset);
            expect(shifted.points[i].position).toEqual(original.points[i].position);
            expect(shifted.points[i].windSpeedKn).toBe(original.points[i].windSpeedKn);
            expect(shifted.points[i].sailName).toBe(original.points[i].sailName);
        }

        for (let i = 0; i < original.marks.length; i++) {
            expect(shifted.marks[i].time - original.marks[i].time).toBe(offset);
        }
    });

    it('moves the embedded model run along with the route', async () => {
        const shifted = await loadShifted();

        expect(shifted.modelId).toBe('arome_0_025.2026-09-09T18-21-58Z');
    });
});

describe('malformed input', () => {
    it('rejects a file with no usable route', async () => {
        expect(() => parseErz('not an erz file at all')).toThrow(/route/i);
    });

    it('rejects an empty file', async () => {
        expect(() => parseErz('   ')).toThrow(/empty/i);
    });

    it('counts unusable lines instead of dropping them silently', async () => {
        const text = await loadSample();
        const route = parseErz(`${text}\ngarbage;line\n`);

        expect(route.points).toHaveLength(21);
        expect(route.skippedLines).toBe(1);
    });
});
