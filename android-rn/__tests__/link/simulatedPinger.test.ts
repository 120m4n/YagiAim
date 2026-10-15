// SC-007 — el pinger simulado produce la misma secuencia que SimulatedPinger.swift (dorados de Swift).
import { SimulatedPinger } from '../../src/link/simulatedPinger';
import { G } from '../helpers/goldens';

const CMDS = ['HELLO', 'hello', 'CFG?', 'STOP', 'MON ON', 'mon off', 'MON', 'PING', 'SET hash=zz', 'SET hash=4f', 'SET hash', 'SET  hash=4F', '  set   rate=999 ', 'SET rate=1000',
  'SET rate=+2000', 'SET rate=x', 'SET freq=900.1', 'set TXP=22', 'SET foo=1', 'SET =1', 'SET a=b=c', 'BOGUS', '', '   ', 'CFG?'];

async function run(seed: bigint, heading: number | undefined, target: number | undefined, pings: number) {
  const sim = new SimulatedPinger({ seed, delayScale: 0.01 }, () => heading, () => target);
  const got: string[] = [];
  void (async () => { for await (const l of sim.lines) got.push(l); })();
  await sim.open();
  const take = () => got.splice(0, got.length);
  const replies: { cmd: string; lines: string[] }[] = [];
  for (const cmd of CMDS) {
    await sim.send(cmd);
    await new Promise((r) => setTimeout(r, 40));
    replies.push({ cmd, lines: take() });
  }
  take();
  const p: string[] = [];
  let warns = 0;
  for (let i = 0; i < pings; i++) {
    await sim.send('PING');
    while (!got.some((l) => l.startsWith('P,'))) await new Promise((r) => setTimeout(r, 3));
    for (const l of take()) { if (l.startsWith('P,')) p.push(l); else if (l.startsWith('#WARN')) warns++; }
  }
  sim.close();
  return { replies, pings: p, warns };
}

describe.each([
  ['seed1_aligned', 1n, 40, 72, 25],
  ['seed1_noInputs', 1n, undefined, undefined, 10],
  ['seed1_far', 1n, 10, 200, 10],
  ['seed12345_aligned', 12345n, 72, 72, 10],
] as const)('%s', (name, seed, h, t, n) => {
  test('respuestas a cada comando y primeros pings idénticos a Swift', async () => {
    const r = await run(seed, h, t, n);
    expect(r).toEqual(G.simulator[name]);
  }, 30_000);
});
