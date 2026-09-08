export interface LatLon {
    lat: number;
    lon: number;
}

const EARTH_RADIUS_M = 6371000;
const M_PER_NM = 1852;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Parses one NMEA-style coordinate pair as stored in an ERZ position field,
 * e.g. `4746.752,N,00404.761,W` (degrees + decimal minutes, hemisphere letter).
 *
 * The French producer writes `O` (Ouest) instead of `W` in some locales, so both
 * are treated as western hemisphere.
 */
export const parseNmeaPosition = (field: string): LatLon | null => {
    const parts = field.split(',');
    if (parts.length < 4) {
        return null;
    }

    const lat = degreesMinutesToDecimal(parts[0], parts[1]);
    const lon = degreesMinutesToDecimal(parts[2], parts[3]);

    return lat === null || lon === null ? null : { lat, lon };
};

const degreesMinutesToDecimal = (value: string, hemisphere: string): number | null => {
    const raw = parseFloat(value);
    if (!Number.isFinite(raw)) {
        return null;
    }

    const degrees = Math.trunc(raw / 100);
    const minutes = raw - degrees * 100;
    const decimal = degrees + minutes / 60;

    const hemi = hemisphere.trim().toUpperCase();
    return hemi === 'S' || hemi === 'W' || hemi === 'O' ? -decimal : decimal;
};

export const distanceNm = (a: LatLon, b: LatLon): number => {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLat = lat2 - lat1;
    const dLon = toRad(b.lon - a.lon);

    const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return (2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))) / M_PER_NM;
};

export const bearingDeg = (a: LatLon, b: LatLon): number => {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLon = toRad(b.lon - a.lon);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

/**
 * Position between two route points. ERZ legs are ~6 nm, where the great-circle
 * and linear solutions differ by well under a metre, so linear interpolation is
 * used — with longitude unwrapped so a leg crossing the antimeridian does not
 * sweep the long way round the globe.
 */
export const interpolatePosition = (a: LatLon, b: LatLon, fraction: number): LatLon => {
    let dLon = b.lon - a.lon;
    if (dLon > 180) {
        dLon -= 360;
    } else if (dLon < -180) {
        dLon += 360;
    }

    const lon = a.lon + dLon * fraction;

    return {
        lat: a.lat + (b.lat - a.lat) * fraction,
        lon: ((lon + 540) % 360) - 180,
    };
};

/** Shortest-arc interpolation between two compass bearings. */
export const interpolateAngle = (a: number, b: number, fraction: number): number => {
    const delta = ((b - a + 540) % 360) - 180;
    return (a + delta * fraction + 360) % 360;
};

export const interpolateNumber = (a: number, b: number, fraction: number): number =>
    a + (b - a) * fraction;
