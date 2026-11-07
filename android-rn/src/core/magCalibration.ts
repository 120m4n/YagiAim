// Punto 2 — calibración propia del magnetómetro. Modelo: v = s ⊙ (m − b), con |v| = F (la intensidad que da el WMM para el lugar).
// El sensor del Redmi A5 lee ~230 µT crudos (imán del propio teléfono) frente a 31 µT de campo terrestre, y el sesgo que estima el
// controlador de Sprd se mueve ±20 µT entre sesiones; aquí se estima el desfase (hierro duro, `b`) y una escala por eje (hierro
// blando diagonal, `s`) con un ajuste de esfera por Levenberg–Marquardt sobre muestras de orientaciones variadas (el «movimiento
// en ocho»). No hace falta el giroscopio.
export type Vec3 = readonly [number, number, number];

export interface MagCal {
  offset: Vec3;
  scale: Vec3;
  /** Residuo cuadrático medio del ajuste (µT). */
  rms: number;
  /** Casillas de orientación cubiertas (de 26). */
  coverage: number;
  /** Intensidad de referencia con la que se ajustó (µT). */
  reference: number;
}

export interface CalOptions {
  maxSamples: number;
  /** Separación mínima entre muestras guardadas (µT). */
  minSeparation: number;
  minCoverage: number;
  maxRms: number;
}

const DEFAULTS: CalOptions = { maxSamples: 600, minSeparation: 1.0, minCoverage: 12, maxRms: 2.5 };

/** Casilla (0–25) de la dirección de `v` en octantes/caras/aristas; -1 si es casi nulo. */
export function directionBin(v: Vec3): number {
  const n = Math.hypot(v[0], v[1], v[2]);
  if (n < 1e-9) return -1;
  const c = (x: number) => {
    const u = x / n;
    return u > 0.38 ? 1 : u < -0.38 ? -1 : 0;
  };
  const k = (c(v[0]) + 1) * 9 + (c(v[1]) + 1) * 3 + (c(v[2]) + 1);
  return k > 13 ? k - 1 : k; // quita la casilla central (0,0,0)
}

export const applyCal = (cal: Pick<MagCal, 'offset' | 'scale'>, m: Vec3): [number, number, number] => [
  cal.scale[0] * (m[0] - cal.offset[0]),
  cal.scale[1] * (m[1] - cal.offset[1]),
  cal.scale[2] * (m[2] - cal.offset[2]),
];

/** Resuelve A·x = b (A cuadrada, n pequeño) por eliminación gaussiana con pivote; `undefined` si es singular. */
function solve(A: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i] as number]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r]![i]!) > Math.abs(M[p]![i]!)) p = r;
    if (Math.abs(M[p]![i]!) < 1e-12) return undefined;
    [M[i], M[p]] = [M[p]!, M[i]!];
    for (let r = i + 1; r < n; r++) {
      const f = M[r]![i]! / M[i]![i]!;
      for (let c = i; c <= n; c++) M[r]![c]! -= f * M[i]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i]![n]!;
    for (let c = i + 1; c < n; c++) s -= M[i]![c]! * x[c]!;
    x[i] = s / M[i]![i]!;
  }
  return x;
}

export class MagCalibrator {
  private samples: Vec3[] = [];
  private readonly o: CalOptions;

  constructor(opts: Partial<CalOptions> = {}) {
    this.o = { ...DEFAULTS, ...opts };
  }

  get count(): number {
    return this.samples.length;
  }

  reset(): void {
    this.samples = [];
  }

  /** Guarda la muestra si está a más de `minSeparation` de la última guardada. */
  add(m: Vec3): boolean {
    const last = this.samples[this.samples.length - 1];
    if (last && Math.hypot(m[0] - last[0], m[1] - last[1], m[2] - last[2]) < this.o.minSeparation) return false;
    this.samples.push(m);
    if (this.samples.length > this.o.maxSamples) this.samples.shift();
    return true;
  }

  /** Menor extensión (µT) de las muestras en un eje: una esfera completa mide 2·F en todos; si el teléfono no se mueve es ~0. */
  span(): number {
    if (this.samples.length === 0) return 0;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const m of this.samples) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m[k]!); hi[k] = Math.max(hi[k]!, m[k]!); }
    return Math.min(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
  }

  /** Cobertura de orientaciones respecto del centro estimado `c`; ignora las muestras a menos de `minRadius` del centro (solo ruido). */
  coverage(c: Vec3 = this.center(), minRadius = 0): number {
    const bins = new Set<number>();
    for (const m of this.samples) {
      if (Math.hypot(m[0] - c[0], m[1] - c[1], m[2] - c[2]) < minRadius) continue;
      const b = directionBin([m[0] - c[0], m[1] - c[1], m[2] - c[2]]);
      if (b >= 0) bins.add(b);
    }
    return bins.size;
  }

  private center(): Vec3 {
    if (this.samples.length === 0) return [0, 0, 0];
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const m of this.samples) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, m[k]!); hi[k] = Math.max(hi[k]!, m[k]!); }
    return [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  }

  /**
   * Ajusta (b, s) para que |s ⊙ (m − b)| = `reference`. Devuelve `undefined` si hay pocas muestras o poca cobertura;
   * si hay ajuste pero no es aceptable, devuelve igualmente el resultado para que quien llama vea el residuo.
   */
  fit(reference: number, initial?: Pick<MagCal, 'offset' | 'scale'>): (MagCal & { acceptable: boolean }) | undefined {
    const pts = this.samples;
    if (pts.length < 30) return undefined;
    const b = [...(initial?.offset ?? this.center())];
    // Punto de partida: esfera libre por mínimos cuadrados lineales (centro + radio). Con escalas independientes por eje y un
    // teléfono que gira casi plano (el eje vertical apenas varía) el ajuste libre se escapa a soluciones degeneradas (centro a
    // cientos de µT, escalas ~0,1) con residuo bajo; por eso las escalas quedan acotadas a ±25 % de la isotrópica.
    let s0 = 1;
    if (!initial) {
      const A = pts.map((m) => [2 * m[0], 2 * m[1], 2 * m[2], 1]);
      const y = pts.map((m) => m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
      const AtA = Array.from({ length: 4 }, (_, a) => Array.from({ length: 4 }, (_, c) => A.reduce((t, r) => t + r[a]! * r[c]!, 0)));
      const Aty = Array.from({ length: 4 }, (_, a) => A.reduce((t, r, i) => t + r[a]! * y[i]!, 0));
      const x = solve(AtA, Aty);
      const R = x ? Math.sqrt(x[3]! + x[0]! * x[0]! + x[1]! * x[1]! + x[2]! * x[2]!) : NaN;
      if (x && R > 1e-6) { b.splice(0, 3, x[0]!, x[1]!, x[2]!); s0 = reference / R; }
    }
    const s = initial ? [...initial.scale] : [s0, s0, s0];
    const [lo, hi] = initial ? [Math.min(...s) * 0.8, Math.max(...s) * 1.2] : [s0 * 0.75, s0 * 1.25];
    const resid = (bb: number[], ss: number[]) => pts.map((m) => Math.hypot(ss[0]! * (m[0] - bb[0]!), ss[1]! * (m[1] - bb[1]!), ss[2]! * (m[2] - bb[2]!)) - reference);
    const cost = (r: number[]) => r.reduce((a, x) => a + x * x, 0);
    let r = resid(b, s);
    let lambda = 1e-2;
    for (let it = 0; it < 40; it++) {
      const JTJ = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
      const JTr = new Array<number>(6).fill(0);
      pts.forEach((m, i) => {
        const d = [m[0] - b[0]!, m[1] - b[1]!, m[2] - b[2]!];
        const v = [s[0]! * d[0]!, s[1]! * d[1]!, s[2]! * d[2]!];
        const n = Math.hypot(v[0]!, v[1]!, v[2]!) || 1e-9;
        const J = [-s[0]! * v[0]! / n, -s[1]! * v[1]! / n, -s[2]! * v[2]! / n, v[0]! * d[0]! / n, v[1]! * d[1]! / n, v[2]! * d[2]! / n];
        for (let a = 0; a < 6; a++) {
          JTr[a]! += J[a]! * r[i]!;
          for (let c = 0; c < 6; c++) JTJ[a]![c]! += J[a]! * J[c]!;
        }
      });
      const damped = JTJ.map((row, a) => row.map((x, c) => (a === c ? x * (1 + lambda) + 1e-9 : x)));
      const step = solve(damped, JTr.map((x) => -x));
      if (!step) break;
      const nb = [b[0]! + step[0]!, b[1]! + step[1]!, b[2]! + step[2]!];
      const ns = [s[0]! + step[3]!, s[1]! + step[4]!, s[2]! + step[5]!];
      if (ns.some((x) => !(x > lo && x < hi))) { lambda *= 10; continue; }
      const nr = resid(nb, ns);
      if (cost(nr) < cost(r)) {
        const delta = Math.hypot(...step);
        b.splice(0, 3, ...nb); s.splice(0, 3, ...ns); r = nr; lambda = Math.max(lambda / 3, 1e-9);
        if (delta < 1e-6) break;
      } else {
        lambda *= 10;
        if (lambda > 1e9) break;
      }
    }
    const rms = Math.sqrt(cost(r) / pts.length);
    const offset: Vec3 = [b[0]!, b[1]!, b[2]!];
    const scale: Vec3 = [s[0]!, s[1]!, s[2]!];
    const coverage = this.coverage(offset, reference * 0.5);
    const spanOk = this.span() >= reference; // al menos medio diámetro de la esfera en cada eje
    const sane = scale.every((x) => x > 0.3 && x < 3) && Math.hypot(...offset) < 600 && Number.isFinite(rms);
    return { offset, scale, rms, coverage, reference, acceptable: sane && spanOk && coverage >= this.o.minCoverage && rms <= this.o.maxRms };
  }
}
