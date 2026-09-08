{#if sample.status !== 'on'}
    <div class="erz-note">
        {sample.status === 'before'
            ? 'Timeline is before the route starts — boat shown at the departure point.'
            : 'Timeline is past the route end — boat shown at the arrival point.'}
    </div>
{/if}

<dl class="erz-readout">
    <dt>Position</dt>
    <dd>{formatLatLon(sample.position)}</dd>

    <dt>Boat</dt>
    <dd>{formatSpeed(sample.speedKn)} · {formatDirection(sample.courseDeg)}</dd>

    <dt>Wind</dt>
    <dd>
        {formatWind(sample.windSpeedKn)} · {formatDirection(sample.windDirDeg)}
        {#if sample.gustKn !== null}
            <span class="erz-readout__muted">gust {formatWind(sample.gustKn)}</span>
        {/if}
    </dd>

    {#if sample.sailName}
        <dt>Sail</dt>
        <dd>{sample.sailName}</dd>
    {/if}

    {#if sample.temperatureC !== null || sample.pressureHpa !== null}
        <dt>Air</dt>
        <dd>
            {#if sample.temperatureC !== null}{sample.temperatureC.toFixed(1)} °C{/if}
            {#if sample.pressureHpa !== null}
                <span class="erz-readout__muted">{Math.round(sample.pressureHpa)} hPa</span>
            {/if}
        </dd>
    {/if}

    <dt>Sailed</dt>
    <dd>{formatDistance(sample.coveredNm)} of {formatDistance(totalNm)}</dd>
</dl>

<script lang="ts">
    import {
        formatDirection,
        formatDistance,
        formatSpeed,
        formatWind,
    } from '../lib/format';

    import type { LatLon } from '../lib/geo';
    import type { RouteSample } from '../lib/route';

    export let sample: RouteSample;
    export let totalNm: number;

    const formatLatLon = ({ lat, lon }: LatLon) =>
        `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(3)}°${
            lon >= 0 ? 'E' : 'W'
        }`;
</script>

<style lang="less">
    .erz-readout {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 4px 12px;
        margin: 0;

        dt {
            opacity: 0.6;
        }

        dd {
            margin: 0;
        }

        &__muted {
            opacity: 0.6;
            margin-left: 6px;
        }
    }

    .erz-note {
        margin-bottom: 10px;
        padding: 6px 10px;
        border-left: 3px solid #ff8c00;
        background: rgba(255, 140, 0, 0.12);
        border-radius: 3px;
    }
</style>
