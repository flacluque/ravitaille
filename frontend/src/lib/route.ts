/** Point sur la carte. */
export interface LatLon {
  lat: number;
  lon: number;
}

export interface DriveTime {
  km: number;
  minutes: number;
  /** "osrm" : itinéraire calculé sur les routes ; "estimate" : approximation hors ligne. */
  source: 'osrm' | 'estimate';
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** Approximation sans réseau : distance à vol d'oiseau ×1,45 (routes de campagne), 45 km/h, +5 min pour se garer. */
export function estimateDrive(a: LatLon, b: LatLon): DriveTime {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h)) * 1.45;
  return { km: Math.max(1, Math.round(km)), minutes: Math.round((km / 45) * 60) + 5, source: 'estimate' };
}

/**
 * Temps de route par OSRM (itinéraires sur les routes OpenStreetMap, sans le trafic), +5 min pour
 * se garer ; l'approximation si le service ne répond pas (pas de réseau en montagne).
 */
export async function driveTime(a: LatLon, b: LatLon, fetcher: typeof fetch = fetch): Promise<DriveTime> {
  try {
    const url = `${OSRM}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetcher(url, { signal: AbortSignal.timeout(8000) });
    const json = await res.json() as { code?: string; routes?: { distance: number; duration: number }[] };
    const route = json.routes?.[0];
    if (!res.ok || json.code !== 'Ok' || !route) throw new Error('itinéraire introuvable');
    return { km: Math.max(1, Math.round(route.distance / 1000)), minutes: Math.round(route.duration / 60) + 5, source: 'osrm' };
  } catch {
    return estimateDrive(a, b);
  }
}

/** Lien d'itinéraire Google Maps (s'ouvre dans l'appli Maps du téléphone). */
export function mapsLink(a: LatLon, b: LatLon): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lon}&destination=${b.lat},${b.lon}&travelmode=driving`;
}
