import { distanceNm, parseNmeaPosition, type LatLon } from './geo';

/**
 * How the wall-clock timestamps stored in an ERZ file should be read.
 *
 * There is no public ERZ specification, but the sample files carry a strong
 * signal: the diurnal temperature minimum of the routing lines up with the
 * source model's own minimum when the timestamps are read as UTC, and the
 * embedded model run id (`arome_0_025.<ISO>Z`) then precedes the route start by
 * minutes rather than following it by hours. UTC is therefore the default, and
 * `local` stays available for files produced by a differently configured
 * exporter.
 */
export type TimeBase = 'utc' | 'local';

export interface RoutePoint {
    /** Milliseconds since epoch, already normalised to UTC. */
    time: number;
    position: LatLon;
    /** Speed over the leg *ending* at this point, in knots. */
    speedKn: number;
    courseDeg: number;
    windSpeedKn: number;
    windDirDeg: number;
    gustKn: number | null;
    pressureHpa: number | null;
    temperatureC: number | null;
    sailName: string | null;
    /** Distance from the previous point, in nautical miles. */
    legNm: number;
    /** Distance from the route start, in nautical miles. */
    cumulativeNm: number;
}

/** A course mark the routing recorded as passed, with the time of passage. */
export interface RouteMark {
    time: number;
    position: LatLon;
}

export interface ErzRoute {
    points: RoutePoint[];
    marks: RouteMark[];
    /** Weather model id embedded in the file, e.g. `arome_0_025.2026-08-31T18-21-58Z`. */
    modelId: string | null;
    distanceNm: number;
    timeBase: TimeBase;
    /** Lines that could not be parsed; surfaced so a bad file is not silently half-loaded. */
    skippedLines: number;
}

export class ErzParseError extends Error {}

const GZIP_MAGIC = [0x1f, 0x8b];

const FIELD = {
    position: 0,
    time: 1,
    speed: 3,
    course: 4,
    windSpeed: 5,
    windDir: 6,
    pressure: 9,
    markPosition: 10,
    markTime: 11,
    gust: 22,
    temperature: 24,
    modelId: 27,
    sailName: 45,
} as const;

/** Below this many fields a line cannot carry the values we rely on. */
const MIN_FIELDS = 28;

/**
 * Reads an ERZ file into text. The payload is gzip in every sample seen, but the
 * magic bytes are checked so an already-decompressed export still loads.
 * ERZ is Latin-1, not UTF-8 — sail names such as "FR0 (Tête)" depend on it.
 */
export const readErzFile = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();

    const payload = isGzip(new Uint8Array(buffer)) ? await gunzip(buffer) : buffer;

    return new TextDecoder('iso-8859-1').decode(payload);
};

const isGzip = (bytes: Uint8Array) =>
    bytes.length > 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];

const gunzip = async (buffer: ArrayBuffer): Promise<ArrayBuffer> => {
    if (typeof DecompressionStream === 'undefined') {
        throw new ErzParseError('This browser cannot decompress gzip (DecompressionStream).');
    }

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));

    try {
        return await new Response(stream).arrayBuffer();
    } catch {
        throw new ErzParseError('The file looks gzipped but could not be decompressed.');
    }
};

export const parseErz = (text: string, timeBase: TimeBase = 'utc'): ErzRoute => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (!lines.length) {
        throw new ErzParseError('The file is empty.');
    }

    const points: RoutePoint[] = [];
    const marks: RouteMark[] = [];
    let modelId: string | null = null;
    let skippedLines = 0;

    for (const line of lines) {
        const fields = line.split(';');

        if (fields.length < MIN_FIELDS) {
            skippedLines++;
            continue;
        }

        const position = parseNmeaPosition(fields[FIELD.position]);
        const time = parseErzTime(fields[FIELD.time], timeBase);

        if (!position || time === null) {
            skippedLines++;
            continue;
        }

        points.push({
            time,
            position,
            speedKn: num(fields[FIELD.speed]) ?? 0,
            courseDeg: num(fields[FIELD.course]) ?? 0,
            windSpeedKn: num(fields[FIELD.windSpeed]) ?? 0,
            windDirDeg: num(fields[FIELD.windDir]) ?? 0,
            gustKn: num(fields[FIELD.gust]),
            pressureHpa: num(fields[FIELD.pressure]),
            temperatureC: num(fields[FIELD.temperature]),
            sailName: fields[FIELD.sailName]?.trim() || null,
            legNm: 0,
            cumulativeNm: 0,
        });

        const markPosition = parseNmeaPosition(fields[FIELD.markPosition] ?? '');
        const markTime = parseErzTime(fields[FIELD.markTime] ?? '', timeBase);
        if (markPosition && markTime !== null) {
            marks.push({ time: markTime, position: markPosition });
        }

        modelId ??= fields[FIELD.modelId]?.trim() || null;
    }

    if (points.length < 2) {
        throw new ErzParseError(
            'No usable route found. Expected an ERZ routing export with at least two points.',
        );
    }

    points.sort((a, b) => a.time - b.time);

    let distance = 0;
    for (let i = 1; i < points.length; i++) {
        points[i].legNm = distanceNm(points[i - 1].position, points[i].position);
        distance += points[i].legNm;
        points[i].cumulativeNm = distance;
    }

    return { points, marks, modelId, distanceNm: distance, timeBase, skippedLines };
};

/**
 * ERZ writes `YYYY/MM/DD HH:MM:SS`, but exporters configured for a European
 * locale have been seen writing `DD/MM/YYYY`, so the order is detected from the
 * four-digit year rather than assumed.
 */
const parseErzTime = (field: string, timeBase: TimeBase): number | null => {
    const match = field
        ?.trim()
        .match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,4})[ T](\d{1,2}):(\d{2}):(\d{2})$/);

    if (!match) {
        return null;
    }

    const [, first, month, third, hours, minutes, seconds] = match;
    const yearFirst = first.length === 4;

    const year = Number(yearFirst ? first : third);
    const day = Number(yearFirst ? third : first);

    const parts = [year, Number(month) - 1, day, Number(hours), Number(minutes), Number(seconds)] as const;

    const time =
        timeBase === 'utc' ? Date.UTC(...parts) : new Date(...parts).getTime();

    return Number.isFinite(time) ? time : null;
};

const num = (value: string | undefined): number | null => {
    if (value === undefined) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);

    // The exporter pads unknown values with FLT_MAX; treat those as missing.
    return Number.isFinite(parsed) && Math.abs(parsed) < 1e30 ? parsed : null;
};
