// Miroir des records Java renvoyés par l'API (fr.trailplanner.*).
// Dates : LocalDateTime ISO sans fuseau ("2026-10-23T14:30:00"), durées : ISO-8601 ("PT8H48M").

export type AidLevel = 'NONE' | 'LIGHT' | 'FULL';
export type ElevationSource = 'AUTO' | 'ROADBOOK' | 'TRACK';
export type CutoffStatus = 'NONE' | 'OK' | 'TIGHT' | 'MISSED';

export interface Checkpoint {
  code: string;
  name: string;
  km: number;
  gainM: number | null;
  lossM: number | null;
  cutoffIn: string | null;
  cutoffOut: string | null;
  aid: AidLevel;
}

export interface RaceDefinition {
  name: string;
  start: string;
  maxDuration: string | null;
  checkpoints: Checkpoint[];
}

export interface ProfilePoint {
  km: number;
  elevationM: number;
  cumulativeGainM: number;
  cumulativeLossM: number;
  lat: number;
  lon: number;
}

export interface TrackSummary {
  name: string;
  pointCount: number;
  distanceKm: number;
  gainM: number;
  lossM: number;
  minElevationM: number;
  maxElevationM: number;
  profile: ProfilePoint[];
}

export interface Marker {
  code: string;
  name: string;
  km: number;
  trackKm: number;
  lat: number;
  lon: number;
  elevationM: number;
  aid: AidLevel;
}

export interface CourseView {
  race: RaceDefinition;
  track: TrackSummary | null;
  markers: Marker[];
}

export interface Scenario {
  name: string;
  paceFactor: number;
  fatigueExponent: number;
  nightFactor: number;
  lightStopMinutes: number;
  fullStopMinutes: number;
}

export interface CheckpointEta {
  code: string;
  name: string;
  km: number;
  cumulativeGainM: number;
  legDistanceKm: number;
  legGainM: number;
  legLossM: number;
  legDuration: string;
  legPaceMinPerKm: number;
  arrival: string;
  elapsed: string;
  stop: string;
  departure: string;
  cutoffIn: string | null;
  cutoffOut: string | null;
  marginIn: string | null;
  marginOut: string | null;
  status: CutoffStatus;
}

export interface RacePlan {
  raceName: string;
  scenario: Scenario;
  elevationSource: ElevationSource;
  totalDistanceKm: number;
  totalGainM: number;
  totalEffortKm: number;
  start: string;
  finish: string;
  totalDuration: string;
  totalStops: string;
  nightDuration: string;
  checkpoints: CheckpointEta[];
  warnings: string[];
}

/** Course de référence saisie par le coureur. */
export interface Reference {
  km: number;
  gainM: number;
  /** Durée ISO-8601, ex. "PT8H48M". */
  time: string;
}
