// Miroir des records Java renvoyés par l'API (fr.trailplanner.*).
// Dates : LocalDateTime ISO sans fuseau ("2026-10-23T14:30:00"), durées : ISO-8601 ("PT8H48M").

export type AidLevel = 'NONE' | 'LIGHT' | 'FULL';
/** Ce qu'on trouve à un point (fr.trailplanner.model.Service). */
export type Service = 'WATER' | 'DRINKS' | 'COLD_FOOD' | 'HOT_FOOD' | 'DROP_BAG' | 'ASSISTANCE';
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
  services: Service[];
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
  /** Part du tronçon courue de nuit (absente des plans gardés par une ancienne version). */
  legNightDuration?: string;
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
  references: ReferenceInsight[];
  /** Préparation du coureur (historique Strava), null sans historique. */
  training?: TrainingSummary | null;
}

/** Bloc de préparation : les 12 semaines avant la semaine de course (fr.trailplanner.engine.TrainingHistory.PrepBlock). */
export interface PrepBlock {
  start: string;
  /** Fin exclue. */
  end: string;
  complete: boolean;
  weeklyEffortKm: number;
  weeklyKm: number;
  weeklyGainM: number;
  longestEffortKm: number;
  sessions: number;
  /** Semaines avec au moins 2 sorties. */
  activeWeeks: number;
}

export interface TrainingWeek {
  /** Lundi… ou le jour de début de la semaine, "2026-07-20". */
  start: string;
  effortKm: number;
  km: number;
  gainM: number;
  sessions: number;
}

/** Ce que le plan retient de la préparation (fr.trailplanner.engine.TrainingSummary). */
export interface TrainingSummary {
  /** La forme est prise en compte dans le plan. */
  active: boolean;
  target: PrepBlock;
  weeks: TrainingWeek[];
  /** Sensibilité du temps au volume : 0,10 = +10 % de volume, −1 % de temps. */
  elasticity: number;
  /** Courses ayant servi à ajuster la sensibilité (0 = valeur par défaut). */
  personalRaces: number;
  lowSpecificity: boolean;
  notes: string[];
}

/** Tenir compte de l'entraînement Strava dans le calcul. */
export interface TrainingOptions {
  strava: boolean;
  includeHikes: boolean;
}

export type ReferenceKind = 'RACE' | 'TRAINING';

/** Performance de référence saisie par le coureur : une course, ou une sortie d'entraînement chronométrée. */
export interface Reference {
  label: string;
  /** "2026-04-12", null si inconnue : les références récentes comptent plus. */
  date: string | null;
  kind: ReferenceKind;
  km: number;
  gainM: number;
  /** Durée ISO-8601, ex. "PT8H48M". */
  time: string;
}

/** Ce que prédit une référence seule, et son poids dans le plan (fr.trailplanner.engine.ReferenceInsight). */
export interface ReferenceInsight {
  label: string;
  date: string | null;
  kind: ReferenceKind;
  distanceKm: number;
  elevationGainM: number;
  duration: string;
  /** Poids normalisé, 0 à 1. */
  weight: number;
  recencyFactor: number;
  distanceFactor: number;
  predictedFinish: string;
  predictedDuration: string;
  /** Correction de forme appliquée à son temps (1 = aucune). */
  formFactor?: number;
  /** Volume de sa préparation (km-effort par semaine), null s'il n'est pas connu. */
  weeklyEffortKm?: number | null;
}

/** Roadbook lu par l'IA (fr.trailplanner.extract.ExtractedRoadbook) : à relire avant tout calcul. */
export interface ExtractedRoadbook {
  name: string | null;
  /** "2026-10-23", null si la date complète n'est pas lisible. */
  startDate: string | null;
  /** "09:00". */
  startTime: string | null;
  checkpoints: {
    code: string | null;
    name: string | null;
    km: number | null;
    gainM: number | null;
    lossM: number | null;
    /** "12h30" */
    cutoffIn: string | null;
    cutoffOut: string | null;
    aid: AidLevel;
    services: Service[];
  }[];
  warnings: string[];
}

export interface ExtractorStatus {
  enabled: boolean;
  provider: string;
  model: string | null;
  ready: boolean;
  message: string | null;
}

/** Matériel lu dans un règlement (fr.trailplanner.extract.ExtractedGear) : à relire. */
export interface ExtractedGear {
  /** Course retenue, utile quand le document en couvre plusieurs. */
  race: string | null;
  items: { name: string; status: 'MANDATORY' | 'RECOMMENDED' }[];
  warnings: string[];
}

/** État de la connexion à Strava (fr.trailplanner.strava.StravaStatus). */
export interface StravaStatus {
  /** Application Strava renseignée dans l'API. */
  configured: boolean;
  connected: boolean;
  athlete: string | null;
  /** Ce qui cloche dans la configuration (identifiant invalide…), null si rien. */
  problem: string | null;
}

/** Sortie de course à pied ou de trail (fr.trailplanner.strava.StravaActivity). */
export interface StravaActivity {
  id: number;
  name: string;
  /** "2026-04-12" */
  date: string;
  sportType: 'Run' | 'TrailRun' | string;
  distanceKm: number;
  elevationGainM: number;
  /** Durée ISO-8601, arrêts compris. */
  elapsedTime: string;
  movingTime: string;
  /** Marquée « Course » dans le type de sortie de Strava. */
  race: boolean;
}
