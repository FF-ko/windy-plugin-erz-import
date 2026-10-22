# windy-plugin-erz-import

A Windy.com plugin that imports an **ERZ** sailing weather-routing file, draws the route on the
map, and slides the boat along it in sync with Windy's forecast timeline — on any overlay and any
model.

Drop a `.erz` file into the plugin panel and scrub or animate the timeline: the boat sits at the
position the routing predicted for that moment, and the panel reads out the routing's own speed,
course, wind, gust, sail and progress for that instant.

## Development

```bash
npm install
npm start                       # rollup watch + HTTPS dev server on :9999
```

Then open <https://localhost:9999/plugin.js> once and accept the self-signed certificate (it ships
inside `@windycom/plugin-devtools`), go to <https://www.windy.com/developer-mode> and load that same
URL.

```bash
npm test                        # parser + interpolation tests against the real sample file
npm run check                   # svelte-check
npm run build                   # dist/plugin.js, dist/plugin.min.js, dist/plugin.json
```

`npm run check` reports ~197 errors inside `node_modules` — those come from Windy's own shipped
`.d.ts` files (`@leafletGl`, `@plugins/*` and `WPluginModules` are referenced but never declared)
and from the template's `lib: ["DOM", "webworker"]` combination. The project's own sources are
clean; filter with `grep '"src/'`.

## Publishing

Windy only installs plugins served from `windy-plugins.com`, which is why a `localhost` URL is
rejected by the "load plugin from URL" dialog. Uploading mints that URL:

1. Create a Windy Plugins API key at <https://api.windy.com/keys>.
2. Put it in `.secret-api-key.sh` (already gitignored) as `WINDY_API_KEY=your-key`, or export it.
3. `./publish.sh` — builds, packs `dist/` and uploads. `./publish.sh --dry-run` shows exactly what
   would be sent without uploading anything.

The response carries the install URL, in the form
`https://windy-plugins.com/<userId>/windy-plugin-erz-import/<version>/plugin.min.js`. Paste it into
**Menu → Install Windy plugin → Load plugin directly from URL**.

Every upload needs a **higher version than the last** — bump `version` in both
`src/pluginConfig.ts` and `package.json`. Republishing the same version is rejected.

`private: false` in `src/pluginConfig.ts` lets Windy offer the plugin in the public gallery once
they have reviewed it — request that by posting the install URL in the
[List of Finished Windy Plugins](https://community.windy.com/topic/31066/list-of-finished-windy-plugins-v42)
forum thread. Until approval the URL still installs it for anyone. The gallery picture is
`src/screenshot.png`: the build copies the first `screenshot.{jpg,png,webp,jpeg}` found next to
`plugin.svelte` into `dist/`.

If the project lives on GitHub, the template's `.github/workflows/publish-plugin.yml` does the same
thing from a `workflow_dispatch` run with `WINDY_API_KEY` as a repository secret.

## Sample files

`sample/routing-sample.erz` is a real export, sailing out of Brittany on 31 Aug 2026. A routing is
only testable while the forecast still covers it, so `sample/erz-shift.mjs` moves one to a new date:

```bash
./sample/erz-shift.mjs sample/routing-sample.erz              # -> today
./sample/erz-shift.mjs sample/routing-sample.erz 2026-09-09   # or 9.9.2026
./sample/erz-shift.mjs in.erz 2026-09-09 -o out.erz
```

It shifts by a whole number of days, so times of day, leg durations and the diurnal wind pattern
survive untouched; the gzip container, Latin-1 encoding, CRLF endings and field layout are all
preserved. The weather model run embedded in field 27 moves with the route. Dependency-free Node —
gzip round-trips, Latin-1 and date arithmetic are all fragile in pure shell on macOS.

Shifted copies written next to the sample are gitignored. The test suite runs the script into a
temporary directory and asserts the result differs from the original in nothing but its dates.

## The ERZ format

There is no public specification. What follows was derived from a real export
(`sample/routing-sample.erz`) and cross-checked against geometry and against the source weather
model, so treat the "confident" rows as verified and the rest as best-effort.

- **Container** — gzip. The magic bytes are checked, so an already-decompressed file also loads.
- **Encoding** — ISO-8859-1, CRLF line endings. Not UTF-8: sail names like `FR0 (Tête)` depend on it.
- **Records** — one route point per line, 49 semicolon-separated fields.

| Field | Meaning | Confidence |
| ----- | ------- | ---------- |
| 0 | Position `DDMM.mmm,N,DDDMM.mmm,W` (note the embedded commas) | verified |
| 1 | Timestamp `YYYY/MM/DD HH:MM:SS`, UTC | verified |
| 2 | Seconds since the previous point | verified — the column sums exactly to the elapsed time |
| 3 | Boat speed over the leg **ending** at this point, knots | verified — reproduces the distance flown to ±0.01 kn |
| 4 | Course over that leg, whole degrees | verified — matches the bearing to <1° |
| 5 / 6 | True wind speed (kn) / direction (°) | verified |
| 7 / 8 | Current speed / direction — zero throughout the sample | unconfirmed |
| 9 | Pressure, hPa | confident |
| 10 / 11 | Position and time of a mark the routing passed | confident |
| 13 | Polar percentage (96 or 100) | likely |
| 22 | Gust, kn — always above field 5, ratio 1.2–1.5 | likely |
| 23 | `N`/`O` = French *Non*/*Oui*; tracks field 13 being 100 | likely |
| 24 | Air temperature, °C | confident |
| 27 | Weather model id, e.g. `arome_0_025.2026-08-31T18-21-58Z` | verified |
| 44 / 45 / 46 | Sail id / name / colour as a Windows `COLORREF` (`0x00BBGGRR`) | confident |
| 48 | `FLT_MAX` padding — the parser treats it as missing | verified |

Fields 12, 14–21, 25–26, 28–43 and 47 are carried in the file but not surfaced; their meaning is
unknown.

The producer is French Windows software (French `Oui`/`Non` flags, French sail names, Météo-France
AROME, `COLORREF` colours, `FLT_MAX` padding). The extension is also seen as `.erz10`.

### Why timestamps are read as UTC

The format carries no timezone, and reading it wrong would shift the whole feature by two hours, so
it was settled empirically:

- The routing's temperature minimum falls at 07:45 in the file's own clock. At that exact position
  AROME's minimum is at **07:00 UTC** — a 0.75 h offset, not the 2 h that a CEST reading needs.
- Gusts match the model far better under a UTC reading (RMSE 1.45 kn vs 2.27 kn).
- The embedded model run id is `…T18-21-58Z` and the route starts at 18:36:42. Read as UTC that is
  15 minutes after the grib was produced; read as local it would be 1h45m *before* it existed.

A checkbox in the panel re-reads the file as local time for exports that turn out to disagree.

## Architecture

| File | Role |
| ---- | ---- |
| `src/lib/erz.ts` | gunzip, Latin-1 decode, field parsing, validation |
| `src/lib/geo.ts` | NMEA coordinates, distance, bearing, interpolation |
| `src/lib/route.ts` | binary search by time, position and readings at any instant |
| `src/lib/mapLayer.ts` | polyline, step dots, marks, heading-rotated boat |
| `src/lib/format.ts` | display formatting; wind uses the user's Windy units |
| `src/lib/activeRoute.ts` | the loaded route, its map layer and timeline subscriptions |
| `src/plugin.svelte` | panel and file loading |

Timeline sync is `store.on('timestamp', …)`, coalesced to one redraw per animation frame so
animating the timeline stays smooth. The forecast range comes from the `calendar` store key, which
is re-read on change so switching model or overlay updates the "outside forecast range" warning.

The route outlives the panel. Windy destroys the panel component on every close but evaluates the
plugin module once, so `activeRoute.ts` keeps the layer and both subscriptions alive: the boat keeps
following the timeline on the map, a reopened panel shows the same route without another import,
and only **Remove** releases it. A page reload still starts empty.

Speed, course and sail describe the leg *ending* at a point, so they are held constant across a
segment; position, wind, gust, pressure and temperature are interpolated between the two endpoints.

Two Leaflet GL differences from vanilla Leaflet are worth knowing, both found the hard way:

- **Tooltips only work on `Marker`, `LayerGroup` and `Popup`.** Every path layer — `CircleMarker`,
  `Polyline`, `Circle` — inherits a base `_addTooltipFocusListeners` that throws
  `This layer type does not support tooltips`. Step details therefore open in a standalone
  `L.Popup` on click, the pattern the official boat-tracker example uses.
- **Leaflet rewrites a marker icon's `transform` on every pan and zoom**, so the boat's heading is
  applied to an inner element inside the `divIcon` instead. This is the same bug the plugin
  template documents as unresolved for its own boat example.
Times outside the route clamp to the departure or arrival point and say so rather than
extrapolating a position the routing never predicted.

## Prior art

`windy-plugin-routing` by Paul Fleury reads the same format on the older, pre-Svelte plugin API. It
truncates and redraws the whole track on every timeline tick and places the boat on the last point
reached, so the boat moves in hourly jumps; it also assumes `DD/MM/YYYY` dates and reads the clock
as local time. This plugin interpolates instead, keeps the layers alive across updates, detects the
date order, and defaults to UTC.
