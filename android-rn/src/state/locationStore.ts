// LocationManager.swift — posición y rumbo verdadero del dispositivo. El rumbo se refiere al borde superior del teléfono
// (PM-06): alinea el boom de la Yagi con el eje largo del teléfono.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Location } from '../core/aimInfo';
import { deg, normalize, rad, signedDelta } from '../core/geo';
import { Keys, type Kv } from '../platform/kv';
import type { Authorization } from '../platform/permissions';

/** Evento de rumbo del módulo nativo. `accuracy` en grados (< 0 = inválido, como `CLHeading.headingAccuracy`). */
export interface HeadingEvent {
  /** Rumbo en grados 0–360: verdadero, o magnético si `usingMagnetic`. */
  azimuth: number;
  usingMagnetic: boolean;
  accuracy: number;
}

/** Lo que el conductor de rumbo necesita saber de la ubicación (declinación y campo esperado). */
export interface HeadingContext {
  /** Última ubicación conocida (puede ser la de la sesión anterior) y si es un fix vivo (PM-05). */
  getLocation(): { location: Location | undefined; live: boolean };
}

/** Puerto con el sistema (expo-location + módulos Kotlin); se sustituye en los tests. */
export interface LocationDriver {
  getAuthorization(): Promise<Authorization>;
  requestAuthorization(): Promise<Authorization>;
  /** Fixes ya filtrados (2 m) y con la altitud en MSL (PM-04, PM-08). Devuelve la baja. */
  startLocation(onLocation: (l: Location) => void): Promise<() => void>;
  readonly headingAvailable: boolean;
  startHeading(onHeading: (h: HeadingEvent) => void, ctx: HeadingContext): () => void;
}

export interface LocationState {
  location: Location | undefined;
  /** Rumbo suavizado, sin offset (0–360). undefined si no hay brújula o sin calibrar. */
  rawHeading: number | undefined;
  /** Corrección (°) por desalineación entre el eje del teléfono y el boom. */
  headingOffset: number;
  /** Precisión en grados (menor = mejor; < 0 = inválido). */
  headingAccuracy: number;
  authorization: Authorization;
  usingMagneticFallback: boolean;
  /** true mientras `location` viene de la sesión anterior (aún sin fix nuevo). */
  isCachedLocation: boolean;
}

/** Rumbo del boom: rumbo del teléfono + offset de calibración. */
export const headingOf = (s: Pick<LocationState, 'rawHeading' | 'headingOffset'>): number | undefined =>
  s.rawHeading === undefined ? undefined : normalize(s.rawHeading + s.headingOffset);

const SMOOTHING = 0.25; // EMA: 0 = congelado, 1 = sin filtro
const PERSIST_EVERY_MS = 5000;

export class LocationStore {
  readonly store: StoreApi<LocationState>;

  private lastSave = Number.NEGATIVE_INFINITY;
  private smoothedSin = 0;
  private smoothedCos = 1;
  private hasSample = false;
  private stopLocation?: () => void;
  private stopHeading?: () => void;
  private starting = false;

  constructor(private readonly driver: LocationDriver, private readonly kv: Kv, private readonly now: () => number = Date.now) {
    const d = kv.getNumberDict(Keys.locationLast);
    // Si falta alguna clave se ignora entera.
    const cached =
      d && d['lat'] !== undefined && d['lon'] !== undefined && d['alt'] !== undefined && d['h'] !== undefined && d['v'] !== undefined && d['t'] !== undefined
        ? ({
            latitude: d['lat'], longitude: d['lon'], altitude: d['alt'], horizontalAccuracy: d['h'], verticalAccuracy: d['v'],
            timestamp: new Date(d['t'] * 1000),
          } satisfies Location)
        : undefined;
    this.store = createStore<LocationState>(() => ({
      location: cached,
      rawHeading: undefined,
      headingOffset: kv.getNumber(Keys.boomOffset, 0),
      headingAccuracy: -1,
      authorization: 'notDetermined',
      usingMagneticFallback: false,
      isCachedLocation: cached !== undefined,
    }));
    void driver.getAuthorization().then((a) => this.store.setState({ authorization: a }));
  }

  get state(): LocationState {
    return this.store.getState();
  }
  get location(): Location | undefined {
    return this.state.location;
  }
  get rawHeading(): number | undefined {
    return this.state.rawHeading;
  }
  get heading(): number | undefined {
    return headingOf(this.state);
  }
  get headingAccuracy(): number {
    return this.state.headingAccuracy;
  }
  get headingOffset(): number {
    return this.state.headingOffset;
  }
  set headingOffset(v: number) {
    this.store.setState({ headingOffset: v });
    this.kv.setNumber(Keys.boomOffset, v);
  }

  /** Pide permiso si hace falta y arranca ubicación y rumbo. Idempotente (como startUpdating*). */
  async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      let auth = await this.driver.getAuthorization();
      if (auth === 'notDetermined') auth = await this.driver.requestAuthorization();
      this.store.setState({ authorization: auth });
      if (auth !== 'authorizedWhenInUse' && auth !== 'authorizedAlways') return;
      if (!this.stopLocation) this.stopLocation = await this.driver.startLocation((l) => this.onLocation(l));
      if (!this.stopHeading && this.driver.headingAvailable) this.stopHeading = this.driver.startHeading((h) => this.onHeading(h), {
        getLocation: () => ({ location: this.state.location, live: !this.state.isCachedLocation }),
      });
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.stopLocation?.();
    this.stopHeading?.();
    this.stopLocation = undefined;
    this.stopHeading = undefined;
  }

  /** Fija el offset para que el rumbo actual coincida con `bearing` (la Yagi ya apunta al objetivo). */
  calibrate(toBearing: number): void {
    const raw = this.rawHeading;
    if (raw === undefined) return;
    this.headingOffset = signedDelta(toBearing, raw);
  }

  /** Solo acepta fixes con precisión horizontal ≥ 0 (PM-04: sin precisión → el driver ya los descartó). */
  onLocation(l: Location): void {
    if (!(l.horizontalAccuracy >= 0)) return;
    this.store.setState({ location: l, isCachedLocation: false });
    this.persist(l);
  }

  onHeading(h: HeadingEvent): void {
    this.store.setState({ headingAccuracy: h.accuracy });
    if (!(h.accuracy >= 0)) return;
    this.store.setState({ usingMagneticFallback: h.usingMagnetic });

    // Suavizado circular: promediar sin/cos evita el salto 359°→0°.
    const s = Math.sin(rad(h.azimuth));
    const c = Math.cos(rad(h.azimuth));
    if (this.hasSample) {
      this.smoothedSin += SMOOTHING * (s - this.smoothedSin);
      this.smoothedCos += SMOOTHING * (c - this.smoothedCos);
    } else {
      this.smoothedSin = s;
      this.smoothedCos = c;
      this.hasSample = true;
    }
    this.store.setState({ rawHeading: normalize(deg(Math.atan2(this.smoothedSin, this.smoothedCos))) });
  }

  /** Guarda la última ubicación (máx. 1 escritura cada 5 s). */
  private persist(l: Location): void {
    const t = this.now();
    if (!(t - this.lastSave > PERSIST_EVERY_MS)) return;
    this.lastSave = t;
    this.kv.setNumberDict(Keys.locationLast, {
      lat: l.latitude, lon: l.longitude, alt: l.altitude, h: l.horizontalAccuracy, v: l.verticalAccuracy, t: l.timestamp.getTime() / 1000,
    });
  }
}
