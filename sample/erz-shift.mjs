#!/usr/bin/env node
/**
 * Shifts every timestamp in an ERZ routing file to a new date.
 *
 * Routings are only useful while the forecast still covers them, so a sample
 * file goes stale within days. Shifting by a whole number of days keeps the
 * time of day, the leg durations and the diurnal wind pattern intact.
 *
 *   ./sample/erz-shift.mjs sample/routing-sample.erz              # -> today
 *   ./sample/erz-shift.mjs sample/routing-sample.erz 2026-09-09
 *   ./sample/erz-shift.mjs in.erz 2026-09-09 -o out.erz
 */

import { basename, dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const GZIP_MAGIC = [0x1f, 0x8b];
const MS_PER_DAY = 86400000;

/** `YYYY/MM/DD HH:MM:SS` or `DD/MM/YYYY HH:MM:SS` — the route and mark times. */
const SLASH_TIME = /\b(\d{1,4})\/(\d{1,2})\/(\d{1,4}) (\d{2}):(\d{2}):(\d{2})\b/g;

/** `2026-08-31T18-21-58Z` — the weather model run embedded in every row. */
const MODEL_TIME = /\b(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z\b/g;

const usage = () => {
    console.error(
        'Usage: erz-shift.mjs <input.erz> [date] [-o <output.erz>]\n' +
            '\n' +
            '  date   day the route should start on, as YYYY-MM-DD or D.M.YYYY\n' +
            '         (default: today)\n' +
            '  -o     output path (default: <input>_<D.M.YYYY>.erz next to the input)',
    );
    process.exit(1);
};

const fail = message => {
    console.error(message);
    process.exit(1);
};

const parseArgs = argv => {
    const positional = [];
    let output = null;

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '-o' || argv[i] === '--output') {
            output = argv[++i];
            if (!output) usage();
        } else if (argv[i] === '-h' || argv[i] === '--help') {
            usage();
        } else {
            positional.push(argv[i]);
        }
    }

    const [input, date] = positional;
    if (!input || positional.length > 2) usage();

    return { input, date, output };
};

const targetMidnightUtc = date => {
    if (!date) {
        const now = new Date();
        return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const iso = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
        return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    const dotted = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dotted) {
        return Date.UTC(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]));
    }

    return fail(`Not a date I understand: ${date} (use YYYY-MM-DD or D.M.YYYY)`);
};

const readErz = path => {
    let raw;

    try {
        raw = readFileSync(path);
    } catch (e) {
        return fail(`Cannot read ${path}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`);
    }

    const gzipped = raw.length > 2 && raw[0] === GZIP_MAGIC[0] && raw[1] === GZIP_MAGIC[1];

    try {
        return { text: (gzipped ? gunzipSync(raw) : raw).toString('latin1'), gzipped };
    } catch (e) {
        return fail(`${path} looks gzipped but could not be decompressed: ${e.message}`);
    }
};

/**
 * ERZ is usually written `YYYY/MM/DD`, but exporters in a European locale have
 * been seen writing `DD/MM/YYYY`; the four-digit group says which.
 */
const readSlashDate = match => {
    const [, first, month, third, hours, minutes, seconds] = match;
    const yearFirst = first.length === 4;

    return {
        yearFirst,
        year: Number(yearFirst ? first : third),
        month: Number(month),
        day: Number(yearFirst ? third : first),
        hours: Number(hours),
        minutes: Number(minutes),
        seconds: Number(seconds),
    };
};

const pad = (value, width = 2) => String(value).padStart(width, '0');

const shiftParts = (parts, days) => {
    const shifted = new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hours, parts.minutes, parts.seconds) +
            days * MS_PER_DAY,
    );

    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hours: shifted.getUTCHours(),
        minutes: shifted.getUTCMinutes(),
        seconds: shifted.getUTCSeconds(),
    };
};

const { input, date, output } = parseArgs(process.argv.slice(2));

const { text, gzipped } = readErz(input);

const firstTime = SLASH_TIME.exec(text);
SLASH_TIME.lastIndex = 0;

if (!firstTime) {
    fail(`No ERZ timestamps found in ${input}`);
}

const start = readSlashDate(firstTime);
const startMidnight = Date.UTC(start.year, start.month - 1, start.day);
const days = Math.round((targetMidnightUtc(date) - startMidnight) / MS_PER_DAY);

let rewritten = 0;

const shifted = text
    .replace(SLASH_TIME, (...match) => {
        rewritten++;
        const parts = readSlashDate(match);
        const s = shiftParts(parts, days);
        const datePart = parts.yearFirst
            ? `${s.year}/${pad(s.month)}/${pad(s.day)}`
            : `${pad(s.day)}/${pad(s.month)}/${s.year}`;

        return `${datePart} ${pad(s.hours)}:${pad(s.minutes)}:${pad(s.seconds)}`;
    })
    .replace(MODEL_TIME, (_full, year, month, day, hours, minutes, seconds) => {
        rewritten++;
        const s = shiftParts(
            {
                year: Number(year),
                month: Number(month),
                day: Number(day),
                hours: Number(hours),
                minutes: Number(minutes),
                seconds: Number(seconds),
            },
            days,
        );

        return `${s.year}-${pad(s.month)}-${pad(s.day)}T${pad(s.hours)}-${pad(s.minutes)}-${pad(
            s.seconds,
        )}Z`;
    });

const newStart = shiftParts(start, days);
const defaultName = `${basename(input).replace(/\.erz\d*$/i, '')}_${newStart.day}.${
    newStart.month
}.${newStart.year}.erz`;
const target = output ?? join(dirname(input), defaultName);

const payload = Buffer.from(shifted, 'latin1');
writeFileSync(target, gzipped ? gzipSync(payload) : payload);

console.log(
    `${input} -> ${target}\n` +
        `  shifted by ${days >= 0 ? '+' : ''}${days} day(s), ${rewritten} timestamps rewritten\n` +
        `  route now starts ${newStart.year}-${pad(newStart.month)}-${pad(newStart.day)} ` +
        `${pad(newStart.hours)}:${pad(newStart.minutes)}:${pad(newStart.seconds)} UTC`,
);
