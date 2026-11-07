import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const G: any = JSON.parse(readFileSync(join(__dirname, '../goldens/swift-goldens.json'), 'utf8'));

const F64 = new DataView(new ArrayBuffer(8));

/** Patrón de bits de un double, como "0x3ff0000000000000" (igual que el generador de Swift). */
export function bits(x: number): string {
  F64.setFloat64(0, x);
  return `0x${F64.getBigUint64(0).toString(16)}`;
}

export function fromBits(s: string): number {
  F64.setBigUint64(0, BigInt(s));
  return F64.getFloat64(0);
}

export const bitsOpt = (x: number | undefined): string | null => (x === undefined ? null : bits(x));
