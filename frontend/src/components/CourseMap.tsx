import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression, LeafletMouseEvent } from 'leaflet';
import type { Marker, RacePlan, TrackSummary } from '../api/types';
import { ACCENT_COLOR, STATUS_COLORS, TRACK_COLOR } from '../lib/colors';
import { formatClock } from '../lib/format';
import { nearestPoint, pointAtKm } from '../lib/track';

interface Props {
  track: TrackSummary;
  markers: Marker[];
  plan: RacePlan;
  hoverKm: number | null;
  onHover: (trackKm: number | null) => void;
}

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
        return (
          <CircleMarker
            key={m.code}
            center={[m.lat, m.lon]}
            radius={m.aid === 'FULL' ? 8 : 6}
            pathOptions={{
              color: '#fff',
              weight: 2,
              fillOpacity: 1,
              fillColor: STATUS_COLORS[eta?.status ?? 'NONE'],
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              <strong>{m.code} · {m.name}</strong>
              <br />
              km {m.km}{eta && <> · {formatClock(eta.arrival)}</>}
            </Tooltip>
          </CircleMarker>
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
