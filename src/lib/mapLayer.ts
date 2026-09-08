import { map } from '@windy/map';

import { formatClock, formatDirection, formatSpeed, formatWind } from './format';

import type { ErzRoute, RoutePoint } from './erz';
import type { RouteSample } from './route';

const ROUTE_COLOR = '#33ccff';
const SAILED_COLOR = '#ff8c00';
const MARK_COLOR = '#ffffff';

const BOAT_SVG = `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.784,13.635c0,0 -0.106,-2.924 0.006,-4.379c0.115,-1.502 0.318,-3.151 0.686,-4.632c0.163,-0.654 0.45,-1.623 0.755,-2.44c0.202,-0.54 0.407,-1.021 0.554,-1.352c0.038,-0.085 0.122,-0.139 0.215,-0.139c0.092,0 0.176,0.054 0.214,0.139c0.151,0.342 0.361,0.835 0.555,1.352c0.305,0.817 0.592,1.786 0.755,2.44c0.368,1.481 0.571,3.13 0.686,4.632c0.112,1.455 0.006,4.379 0.006,4.379l-4.432,0Z" fill="#111"/>
    <path d="M5.481,12.731c0,0 -0.073,-3.048 0.003,-4.22c0.06,-0.909 0.886,-3.522 1.293,-4.764c0.03,-0.098 0.121,-0.165 0.223,-0.165c0.103,0 0.193,0.067 0.224,0.164c0.406,1.243 1.232,3.856 1.292,4.765c0.076,1.172 0.003,4.22 0.003,4.22l-3.038,0Z" fill="#fff"/>
</svg>`;

/**
 * Everything this plugin draws on the Windy map.
 *
 * Leaflet applies its own `transform` to a marker's `_icon` on every pan and
 * zoom, so the boat's heading is rotated on an inner element instead. That keeps
 * the rotation from being overwritten — the failure the plugin template
 * documents for its own boat example.
 */
export class RouteLayer {
    private route: ErzRoute;
    private group: L.LayerGroup;
    private sailedLine: L.Polyline;
    private boat: L.Marker;
    private boatBody: HTMLElement | null = null;
    private popup: L.Popup | null = null;

    constructor(route: ErzRoute) {
        this.route = route;

        const latLngs = route.points.map(p => [p.position.lat, p.position.lon] as [number, number]);

        const fullLine = new L.Polyline(latLngs, {
            color: ROUTE_COLOR,
            weight: 2,
            opacity: 0.65,
        });

        this.sailedLine = new L.Polyline([], {
            color: SAILED_COLOR,
            weight: 4,
            opacity: 0.9,
        });

        this.boat = new L.Marker(latLngs[0], {
            icon: L.divIcon({
                html: `<div class="erz-boat__body">${BOAT_SVG}</div>`,
                className: 'erz-boat',
                iconSize: [26, 26],
                iconAnchor: [13, 13],
            }),
            interactive: false,
            zIndexOffset: 1000,
        });

        this.group = new L.LayerGroup([fullLine, this.sailedLine, ...this.buildTicks(), this.boat]);
        this.group.addTo(map);
    }

    /**
     * Small dot per routing step, plus a ring for every mark the routing passed.
     *
     * Details open in a standalone popup on click. Leaflet GL only implements
     * tooltips for Marker, LayerGroup and Popup — binding one to a path layer
     * throws "This layer type does not support tooltips".
     */
    private buildTicks(): L.Layer[] {
        const ticks: L.Layer[] = this.route.points.map(point => {
            const dot = new L.CircleMarker([point.position.lat, point.position.lon], {
                radius: 3,
                color: ROUTE_COLOR,
                weight: 1,
                fillColor: '#001b2e',
                fillOpacity: 1,
            });

            dot.on('click', () => this.openPopup(point.position, describePoint(point)));

            return dot;
        });

        for (const mark of this.route.marks) {
            const ring = new L.CircleMarker([mark.position.lat, mark.position.lon], {
                radius: 5,
                color: MARK_COLOR,
                weight: 2,
                fillOpacity: 0,
            });

            ring.on('click', () =>
                this.openPopup(mark.position, `<b>Mark</b><br>${formatClock(mark.time)}`),
            );

            ticks.push(ring);
        }

        return ticks;
    }

    private openPopup(at: { lat: number; lon: number }, html: string): void {
        this.popup?.remove();
        this.popup = new L.Popup().setLatLng([at.lat, at.lon]).setContent(html).openOn(map);
    }

    update(sample: RouteSample): void {
        this.boat.setLatLng([sample.position.lat, sample.position.lon]);
        this.sailedLine.setLatLngs(this.sailedPath(sample));
        this.setHeading(sample.courseDeg);
    }

    /** Route points already reached, closed off with the boat's exact position. */
    private sailedPath(sample: RouteSample): [number, number][] {
        const path: [number, number][] = [];

        for (const point of this.route.points) {
            if (point.cumulativeNm > sample.coveredNm) {
                break;
            }
            path.push([point.position.lat, point.position.lon]);
        }

        path.push([sample.position.lat, sample.position.lon]);

        return path;
    }

    private setHeading(courseDeg: number): void {
        // Resolved lazily: the icon has no DOM until Leaflet has rendered the marker.
        this.boatBody ??= this.iconElement()?.querySelector('.erz-boat__body') ?? null;

        if (this.boatBody) {
            this.boatBody.style.transform = `rotate(${courseDeg}deg)`;
        }
    }

    private iconElement(): HTMLElement | null {
        const marker = this.boat as L.Marker & { _icon?: HTMLElement };
        return marker.getElement?.() ?? marker._icon ?? null;
    }

    fitBounds(): void {
        const bounds = new L.LatLngBounds(
            this.route.points.map(p => [p.position.lat, p.position.lon] as [number, number]),
        );

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }

    destroy(): void {
        this.popup?.remove();
        this.popup = null;
        map.removeLayer(this.group);
        this.boatBody = null;
    }
}

const describePoint = (point: RoutePoint): string =>
    [
        `<b>${formatClock(point.time)}</b>`,
        `Boat ${formatSpeed(point.speedKn)} · ${formatDirection(point.courseDeg)}`,
        `Wind ${formatWind(point.windSpeedKn)} · ${formatDirection(point.windDirDeg)}`,
        point.sailName ? `Sail ${point.sailName}` : '',
    ]
        .filter(Boolean)
        .join('<br>');
