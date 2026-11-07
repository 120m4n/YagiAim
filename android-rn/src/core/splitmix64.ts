// SimulatedPinger.swift L195–216 — generador reproducible. BigInt para la aritmética envolvente de 64 bits (SC-007).
const MASK = (1n << 64n) - 1n;

export class SplitMix64 {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed & MASK;
  }

  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return z ^ (z >> 31n);
  }

  /** Uniforme en [0, 1). */
  uniform(): number {
    return Number(this.next() >> 11n) / 2 ** 53;
  }

  /** Normal estándar (Box-Muller). */
  gaussian(): number {
    const u1 = Math.max(this.uniform(), 1e-12);
    const u2 = this.uniform();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
