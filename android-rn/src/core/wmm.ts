// World Magnetic Model 2025 (grado 12). Da la declinación, la inclinación y la intensidad del campo terrestre esperadas en un
// punto y fecha; sirve para (1) pasar de norte magnético a verdadero, (2) validar lo que mide el magnetómetro y (3) fijar el radio
// de la esfera en la calibración. Verificado contra pygeomag en __tests__/core/wmm.test.ts.
import { WMM_COEFFICIENTS, WMM_EPOCH } from './wmmData';

const A = 6378.137; // km, WGS84
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const RE = 6371.2; // km, radio de referencia geomagnético
const RAD = Math.PI / 180;
const N = 12;

export interface MagneticField {
  /** Declinación (°, este positivo). */
  declination: number;
  /** Inclinación (°, hacia abajo positivo). */
  inclination: number;
  /** Intensidad total y componente horizontal (µT). */
  total: number;
  horizontal: number;
  /** Componentes norte, este, abajo (µT). */
  north: number;
  east: number;
  down: number;
}

/** Año decimal de una fecha (aprox. por días del año). */
export function decimalYear(d: Date): number {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}

const idx = (n: number, m: number) => (n * (n + 1)) / 2 + m;

export function magneticField(latDeg: number, lonDeg: number, altKm: number, year: number): MagneticField {
  // Geodésicas → geocéntricas
  const phi = latDeg * RAD;
  const lam = lonDeg * RAD;
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const rc = A / Math.sqrt(1 - E2 * sp * sp);
  const p = (rc + altKm) * cp;
  const z = (rc * (1 - E2) + altKm) * sp;
  const r = Math.hypot(p, z);
  const phiG = Math.asin(z / r);
  const x = Math.sin(phiG);
  const c = Math.cos(phiG);

  // Coeficientes a la fecha
  const g = new Float64Array(idx(N, N) + 1);
  const h = new Float64Array(idx(N, N) + 1);
  const dt = year - WMM_EPOCH;
  for (const [n, m, gg, hh, gd, hd] of WMM_COEFFICIENTS as readonly (readonly [number, number, number, number, number, number])[]) {
    g[idx(n, m)] = gg + gd * dt;
    h[idx(n, m)] = hh + hd * dt;
  }

  // Legendre de Schmidt y derivadas respecto de la latitud geocéntrica
  const P = new Float64Array(idx(N, N) + 1);
  const dP = new Float64Array(idx(N, N) + 1);
  P[idx(0, 0)] = 1;
  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      const k = idx(n, m);
      if (n === m) {
        const f = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        const kk = idx(n - 1, n - 1);
        P[k] = f * c * P[kk]!;
        dP[k] = f * (c * dP[kk]! - x * P[kk]!);
      } else {
        const k1 = idx(n - 1, m);
        const k2 = n >= 2 && m <= n - 2 ? idx(n - 2, m) : -1;
        const root = Math.sqrt(n * n - m * m);
        const sub = k2 >= 0 ? Math.sqrt((n - 1) * (n - 1) - m * m) : 0;
        P[k] = ((2 * n - 1) * x * P[k1]! - (k2 >= 0 ? sub * P[k2]! : 0)) / root;
        dP[k] = ((2 * n - 1) * (x * dP[k1]! + c * P[k1]!) - (k2 >= 0 ? sub * dP[k2]! : 0)) / root;
      }
    }
  }

  let xg = 0; // norte geocéntrico
  let yg = 0; // este
  let zg = 0; // abajo
  for (let n = 1; n <= N; n++) {
    const fr = Math.pow(RE / r, n + 2);
    for (let m = 0; m <= n; m++) {
      const k = idx(n, m);
      const cm = Math.cos(m * lam);
      const sm = Math.sin(m * lam);
      const t = g[k]! * cm + h[k]! * sm;
      xg -= fr * t * dP[k]!;
      yg += (fr * m * (g[k]! * sm - h[k]! * cm) * P[k]!) / c;
      zg -= fr * (n + 1) * t * P[k]!;
    }
  }
  // Geocéntricas → geodésicas
  const psi = phiG - phi;
  const X = xg * Math.cos(psi) - zg * Math.sin(psi);
  const Z = xg * Math.sin(psi) + zg * Math.cos(psi);
  const H = Math.hypot(X, yg);
  return {
    declination: Math.atan2(yg, X) / RAD,
    inclination: Math.atan2(Z, H) / RAD,
    total: Math.hypot(H, Z) / 1000,
    horizontal: H / 1000,
    north: X / 1000,
    east: yg / 1000,
    down: Z / 1000,
  };
}
