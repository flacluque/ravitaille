import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker as MapMarker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression, LeafletMouseEvent } from 'leaflet';
import type { Marker, RacePlan, TrackSummary } from '../api/types';
import { ACCENT_COLOR, TRACK_COLOR } from '../lib/colors';
import { statusShapeSvg } from '../lib/markerShape';
import { formatClock } from '../lib/format';
import { nearestPoint, pointAtKm } from '../lib/track';

interface Props {
  track: TrackSummary;
  markers: Marker[];
  plan: RacePlan;
  hoverKm: number | null;
  onHover: (trackKm: number | null) => void;
}

const STATUS_LABELS = { OK: "plus d'1 h de marge", TIGHT: "moins d'1 h de marge", MISSED: 'barrière dépassée' } as const;

export function CourseMap({ track, markers, plan, hoverKm, onHover }: Props) {
  const line = useMemo<LatLngExpression[]>(() => track.profile.map((p) => [p.lat, p.lon]), [track]);
  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const lats = track.profile.map((p) => p.lat);
    const lons = track.profile.map((p) => p.lon);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [track]);
  const hover = hoverKm === null ? null : pointAtKm(track.profile, hoverKm);

  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [16, 16] }} scrollWheelZoom={false} className="map">
      <FitBounds bounds={bounds} />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={17}
      />
      {/* Trait large et transparent dessous : la souris "accroche" la trace sans viser au pixel près. */}
      <Polyline
        positions={line}
        pathOptions={{ color: 'transparent', weight: 18 }}
        eventHandlers={{
          mousemove: (e: LeafletMouseEvent) => onHover(nearestPoint(track.profile, e.latlng.lat, e.latlng.lng).km),
          mouseout: () => onHover(null),
        }}
      />
      <Polyline positions={line} pathOptions={{ color: TRACK_COLOR, weight: 4, opacity: 0.9 }} interactive={false} />
      {markers.map((m, i) => {
        const eta = plan.checkpoints[i];
        const status = eta?.status ?? 'NONE';
        const r = m.aid === 'FULL' ? 8 : 6;
        const size = Math.ceil(r * 3.2);
        return (
          <MapMarker
            key={m.code}
            position={[m.lat, m.lon]}
            keyboard={false}
            icon={divIcon({ html: statusShapeSvg(status, r), className: 'map-cp', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })}
          >
            <Tooltip direction="top" offset={[0, -size / 2]}>
              <strong>{m.code} · {m.name}</strong>
              <br />
              km {m.km}{eta && <> · {formatClock(eta.arrival)}</>}
              {status !== 'NONE' && <><br />{STATUS_LABELS[status]}</>}
            </Tooltip>
          </MapMarker>
        );
      })}
      {hover && (
        <CircleMarker
          center={[hover.lat, hover.lon]}
          radius={7}
          interactive={false}
          pathOptions={{ color: ACCENT_COLOR, weight: 3, fillColor: '#fff', fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  );
}

/** MapContainer ne lit `bounds` qu'au montage : on recadre si la trace change. */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [16, 16] });
  }, [map, bounds]);
  return null;
}
