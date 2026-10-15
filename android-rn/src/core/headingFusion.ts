// Puntos 3 y 4 — rumbo = azimut del magnetómetro calibrado por nosotros (suavizado adaptativo; el vector de rotación del sistema
// solo puentea las interferencias), y precisión estimada a partir de la coherencia con el WMM, con histéresis.
//
// Por qué: el vector de rotación de Sprd es suave pero hereda el sesgo que el controlador resta al magnetómetro (el crudo lee ~230 µT
// por el imán del teléfono y ese sesgo se mueve ±20 µT entre sesiones). Con un campo terrestre de 31 µT eso son decenas de grados.
import { applyCal, MagCalibrator, type MagCal, type Vec3 } from './magCalibration';
import { signedDelta, normalize } from './geo';
import { formatFixed } from './formatC';

export interface SensorSample {
  /** Marca de tiempo del sensor (ns). */
  tNs: number;
  /** Acelerómetro (m/s²): mide la reacción, apunta hacia arriba con el teléfono quieto. */
  g: Vec3;
  /** Magnetómetro sin calibrar (µT) y calibrado por el controlador (µT). */
  mUncal: Vec3;
  mDriver: Vec3;
  /** Azimut magnético (°) del vector de rotación del sistema, si existe. */
  rvAzimuth?: number;
}

export interface FusionEnv {
  /** Campo esperado en el lugar (WMM), aunque la ubicación sea la de la sesión anterior. */
  field?: { declination: number; inclination: number; total: number };
  /** Hay un fix de ubicación vivo (PM-05): solo entonces hay norte verdadero. */
  liveFix: boolean;
}

export interface FusionOutput {
  /** Rumbo en grados (verdadero si hay fix vivo; si no, magnético). */
  azimuth: number;
  usingMagnetic: boolean;
  /** Precisión en grados, con histéresis alrededor de 15°. */
  accuracy: number;
  /** Diagnóstico. */
  debug: { magneticAzimuth: number; correction: number; calibrated: boolean; dev: number; dipError: number; rms: number | undefined; coverage: number; samples: number; lastFit: string };
}

export interface FusionOptions {
  initialCal?: MagCal;
  /** Se llama cuando hay una calibración nueva aceptada (para guardarla). */
  onCalibration?: (cal: MagCal) => void;
  gravityTau: number; // s
  slowTau: number; // s, suavizado en reposo
  fastTau: number; // s, suavizado al girar
  fastThreshold: number; // ° de innovación a partir de los cuales se sigue rápido
  accuracyTau: number; // s
  fitEveryS: number;
  validEnter: number; // °
  validExit: number; // °
  exitDwellS: number;
  /** Desviaciones máximas para fiarse de una lectura. */
  maxDev: number;
  maxDipError: number;
}

const DEFAULTS: FusionOptions = {
  gravityTau: 0.25, slowTau: 0.5, fastTau: 0.15, fastThreshold: 3, accuracyTau: 1.0, fitEveryS: 2, validEnter: 12, validExit: 15, exitDwellS: 1, maxDev: 0.15, maxDipError: 10,
};

const DEG = 180 / Math.PI;
const cross = (a: Vec3, b: Vec3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const alpha = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

/** Azimut (°) del eje Y del teléfono respecto del norte del campo `m`, compensado por inclinación con la gravedad `g` (como `getOrientation`). */
export function tiltCompensatedAzimuth(g: Vec3, m: Vec3): number | undefined {
  const H = cross(m, g);
  const hn = norm(H);
  const gn = norm(g);
  if (hn < 1e-6 || gn < 1e-6) return undefined;
  const h: Vec3 = [H[0] / hn, H[1] / hn, H[2] / hn];
  const a: Vec3 = [g[0] / gn, g[1] / gn, g[2] / gn];
  const M = cross(a, h);
  return normalize(Math.atan2(h[1], M[1]) * DEG);
}

export class HeadingFusion {
  private readonly o: FusionOptions;
  private calibrator = new MagCalibrator();
  private cal: MagCal | undefined;
  private g: [number, number, number] | undefined;
  private lastT: number | undefined;
  private heading: number | undefined; // rumbo magnético suavizado
  private rvPrev: number | undefined;
  private accSmoothed: number | undefined;
  private valid = false;
  private exitTimer = 0;
  private lastFitT = 0;
  private lastFitCount = 0;
  private lastFit = 'sin ajuste';

  constructor(opts: Partial<FusionOptions> = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.cal = opts.initialCal;
  }

  get calibration(): MagCal | undefined {
    return this.cal;
  }

  /** Descarta la calibración (guardada y en curso) y empieza a recogerla de nuevo. */
  resetCalibration(): void {
    this.cal = undefined;
    this.calibrator = new MagCalibrator();
    this.lastFitCount = 0;
    this.lastFit = 'sin ajuste';
    this.accSmoothed = undefined;
    this.valid = false;
  }

  process(s: SensorSample, env: FusionEnv): FusionOutput | undefined {
    const dt = this.lastT === undefined ? 0.05 : Math.min(Math.max((s.tNs - this.lastT) / 1e9, 0.001), 1);
    this.lastT = s.tNs;

    // Gravedad suavizada
    if (!this.g) this.g = [s.g[0], s.g[1], s.g[2]];
    else {
      const a = alpha(dt, this.o.gravityTau);
      for (let k = 0; k < 3; k++) this.g[k] = this.g[k]! + a * (s.g[k]! - this.g[k]!);
    }
    const g: Vec3 = this.g;

    // Calibración propia: acumula y reajusta cada fitEveryS s de datos
    const F = env.field?.total;
    this.calibrator.add(s.mUncal);
    if (F && s.tNs / 1e9 - this.lastFitT >= this.o.fitEveryS && this.calibrator.count - this.lastFitCount >= 15) {
      this.lastFitT = s.tNs / 1e9;
      this.lastFitCount = this.calibrator.count;
      const fit = this.calibrator.fit(F, this.cal);
      this.lastFit = fit ? `${fit.acceptable ? 'ok' : 'rechazado'} cob ${fit.coverage} rms ${formatFixed(fit.rms, 1)}` : 'insuficiente';
      if (fit?.acceptable && (!this.cal || fit.rms <= this.cal.rms * 1.5 + 0.5 || fit.coverage > this.cal.coverage)) {
        const { acceptable: _ok, ...cal } = fit;
        void _ok;
        this.cal = cal;
        this.o.onCalibration?.(cal);
      }
    }

    // Campo corregido y medidas de coherencia con el modelo
    const m: Vec3 = this.cal ? applyCal(this.cal, s.mUncal) : s.mDriver;
    const mn = norm(m);
    let dev = 0;
    let dipError = 0;
    if (env.field && mn > 1e-6) {
      dev = mn / env.field.total - 1;
      const gn = norm(g);
      const dip = Math.asin(Math.max(-1, Math.min(1, -(m[0] * g[0] + m[1] * g[1] + m[2] * g[2]) / (mn * gn)))) * DEG;
      dipError = dip - env.field.inclination;
    }
    const trustworthy = !!env.field && !!this.cal && Math.abs(dev) <= this.o.maxDev && Math.abs(dipError) <= this.o.maxDipError;

    // Rumbo magnético. Con la calibración propia y una lectura coherente con el WMM, el azimut propio es el principal: se suaviza de
    // forma adaptativa (fuerte en reposo, rápido si el teléfono gira de verdad). El vector de rotación del sistema es suave pero su
    // error depende de la dirección, así que solo se usa (a) mientras no hay calibración y (b) para seguir los giros relativos
    // durante una interferencia, sin congelar el dial.
    const own = tiltCompensatedAzimuth(g, m);
    const rv = s.rvAzimuth;
    if (trustworthy || (rv === undefined && own !== undefined)) {
      if (own !== undefined) {
        if (this.heading === undefined) this.heading = own;
        else {
          const innovation = signedDelta(own, this.heading);
          const tau = Math.abs(innovation) > this.o.fastThreshold ? this.o.fastTau : this.o.slowTau;
          this.heading = normalize(this.heading + alpha(dt, tau) * innovation);
        }
      }
    } else if (rv !== undefined) {
      this.heading = this.heading === undefined || this.rvPrev === undefined ? rv : normalize(this.heading + signedDelta(rv, this.rvPrev));
    }
    this.rvPrev = rv;
    const magnetic = this.heading;
    if (magnetic === undefined) return undefined;

    const declination = env.field && env.liveFix ? env.field.declination : 0;
    const usingMagnetic = !(env.field && env.liveFix);

    // Precisión (°)
    const instant = !env.field ? 20 : (this.cal ? 2 + 1.5 * this.cal.rms : 6) + 40 * Math.abs(dev) + 0.6 * Math.abs(dipError);
    this.accSmoothed = this.accSmoothed === undefined ? instant : this.accSmoothed + alpha(dt, this.o.accuracyTau) * (instant - this.accSmoothed);
    if (!this.valid) {
      if (this.accSmoothed <= this.o.validEnter) { this.valid = true; this.exitTimer = 0; }
    } else if (this.accSmoothed > this.o.validExit) {
      this.exitTimer += dt;
      if (this.exitTimer >= this.o.exitDwellS) { this.valid = false; this.exitTimer = 0; }
    } else {
      this.exitTimer = 0;
    }
    const accuracy = this.valid ? Math.min(this.accSmoothed, this.o.validExit) : Math.max(this.accSmoothed, this.o.validExit + 1);

    return {
      azimuth: normalize(magnetic + declination),
      usingMagnetic,
      accuracy,
      debug: { magneticAzimuth: magnetic, correction: rv === undefined ? 0 : signedDelta(magnetic, rv), calibrated: !!this.cal, dev, dipError, rms: this.cal?.rms, coverage: this.cal?.coverage ?? this.calibrator.coverage(undefined, (env.field?.total ?? 0) * 0.5), samples: this.calibrator.count, lastFit: this.lastFit },
    };
  }
}
