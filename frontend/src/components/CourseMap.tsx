import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker as MapMarker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { DivIcon, LatLngBoundsExpression, LatLngExpression, LeafletEvent, LeafletMouseEvent, Marker as LeafletMarker } from 'leaflet';
import type { Marker, RacePlan, TrackSummary } from '../api/types';
import { ACCENT_COLOR, TRACK_COLOR } from '../lib/colors';
import { statusShapeSvg } from '../lib/markerShape';
import { formatClock } from '../lib/format';
import { nearestPoint, pointAtKm } from '../lib/track';
import { bounds, pointAt, snapToTrack, type EditedPosition } from '../lib/placement';

/** Édition des positions : les ravitos se déplacent le long de la trace (voir PlacementEditor). */
export interface MapEdit {
  positions: EditedPosition[];
  selected: number;
  /** Ravitos à vérifier (même ordre que positions). */
  warn: boolean[];
  onSelect: (index: number) => void;
  onMove: (index: number, trackKm: number) => void;
}

interface Props {
  track: TrackSummary;
  markers: Marker[];
  plan: RacePlan;
  hoverKm: number | null;
  onHover: (trackKm: number | null) => void;
  edit?: MapEdit;
}

// Icônes gardées d'un rendu à l'autre : en changer pendant un glisser interromprait le glisser.
const ICONS = new Map<string, DivIcon>();
function cachedIcon(html: string, size: number, className = 'map-cp'): DivIcon {
  const key = `${className}|${size}|${html}`;
  let icon = ICONS.get(key);
  if (!icon) {
    icon = divIcon({ html, className, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    ICONS.set(key, icon);
  }
  return icon;
}

const STATUS_LABELS = { OK: "plus d'1 h de marge", TIGHT: "moins d'1 h de marge", MISSED: 'barrière dépassée' } as const;

export function CourseMap({ track, markers, plan, hoverKm, onHover, edit }: Props) {
  const line = useMemo<LatLngExpression[]>(() => track.profile.map((p) => [p.lat, p.lon]), [track]);
  const fit = useMemo<LatLngBoundsExpression>(() => {
    const lats = track.profile.map((p) => p.lat);
    const lons = track.profile.map((p) => p.lon);
    return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
  }, [track]);
  const hover = hoverKm === null ? null : pointAtKm(track.profile, hoverKm);

  if (edit) return <EditMap track={track} markers={markers} line={line} fit={fit} edit={edit} onHover={onHover} hover={hover} />;

  return (
    <MapContainer bounds={fit} boundsOptions={{ padding: [16, 16] }} scrollWheelZoom={false} className="map">
      <FitBounds bounds={fit} />
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

interface EditMapProps {
  track: TrackSummary;
  markers: Marker[];
  line: LatLngExpression[];
  fit: LatLngBoundsExpression;
  edit: MapEdit;
  hover: { lat: number; lon: number } | null;
  onHover: (trackKm: number | null) => void;
}

/**
 * Carte d'édition : chaque ravito est un rond numéroté qu'on fait glisser ; il reste collé à la trace, entre le
 * ravito d'avant et celui d'après. Un clic sur la trace y amène le ravito sélectionné. Le rond pointillé marque
 * le km du roadbook, le losange vert le waypoint du GPX.
 */
function EditMap({ track, markers, line, fit, edit, hover, onHover }: EditMapProps) {
  const { positions, selected, warn, onSelect, onMove } = edit;
  const last = positions.length - 1;
  const snap = (i: number, lat: number, lon: number) => {
    const b = bounds(positions, i);
    return snapToTrack(track.profile, lat, lon, b.lo, b.hi);
  };
  const sel = markers[selected];
  const ghostKm = sel?.roadbookTrackKm;
  const ghost = typeof ghostKm === 'number' && Math.abs(ghostKm - positions[selected].km) > 0.3 ? pointAt(track.profile, ghostKm) : null;
  const ends = [0, last].map((i) => pointAt(track.profile, positions[i].km));

  return (
    <MapContainer bounds={fit} boundsOptions={{ padding: [24, 24] }} scrollWheelZoom={false} className="map map-edit">
      <FitBounds bounds={fit} />
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={17}
      />
      <Polyline
        positions={line}
        pathOptions={{ color: 'transparent', weight: 22 }}
        eventHandlers={{
          click: (e: LeafletMouseEvent) => {
            const km = snap(selected, e.latlng.lat, e.latlng.lng);
            if (km !== null) onMove(selected, km);
          },
          mousemove: (e: LeafletMouseEvent) => onHover(nearestPoint(track.profile, e.latlng.lat, e.latlng.lng).km),
          mouseout: () => onHover(null),
        }}
      />
      <Polyline positions={line} pathOptions={{ color: TRACK_COLOR, weight: 4, opacity: 0.9 }} interactive={false} />
      {markers.map((m, i) => typeof m.waypointKm === 'number' && i > 0 && i < last && (
        <MapMarker key={`wp-${m.code}`} position={[pointAt(track.profile, m.waypointKm).lat, pointAt(track.profile, m.waypointKm).lon]}
          interactive={false} keyboard={false} icon={cachedIcon('<span class="map-wp"></span>', 14, 'map-wp-icon')} />
      ))}
      {ghost && (
        <CircleMarker center={[ghost.lat, ghost.lon]} radius={12} interactive={false}
          pathOptions={{ color: '#5c605a', weight: 2, dashArray: '4 4', fill: false }} />
      )}
      {ends.map((p, k) => (
        <MapMarker key={k === 0 ? 'start' : 'finish'} position={[p.lat, p.lon]} interactive={false} keyboard={false}
          icon={cachedIcon('<span class="map-end"></span>', 16, 'map-wp-icon')} />
      ))}
      {positions.map((pos, i) => {
        if (i === 0 || i === last) return null;
        const p = pointAt(track.profile, pos.km);
        const cls = `map-num${i === selected ? ' is-selected' : warn[i] ? ' is-warn' : ''}`;
        return (
          <MapMarker
            key={markers[i].code}
            position={[p.lat, p.lon]}
            draggable
            keyboard={false}
            zIndexOffset={i === selected ? 1000 : 0}
            icon={cachedIcon(`<span class="${cls}">${i}</span>`, 30, 'map-num-icon')}
            eventHandlers={{
              click: () => onSelect(i),
              dragstart: () => onSelect(i),
              drag: (e: LeafletEvent) => {
                const target = e.target as LeafletMarker;
                const ll = target.getLatLng();
                const km = snap(i, ll.lat, ll.lng);
                if (km === null) return;
                const q = pointAt(track.profile, km);
                target.setLatLng([q.lat, q.lon]);
                onMove(i, km);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -16]}>{markers[i].name}</Tooltip>
          </MapMarker>
        );
      })}
      {hover && (
        <CircleMarker center={[hover.lat, hover.lon]} radius={6} interactive={false}
          pathOptions={{ color: ACCENT_COLOR, weight: 3, fillColor: '#fff', fillOpacity: 1 }} />
      )}
    </MapContainer>
  );
}
