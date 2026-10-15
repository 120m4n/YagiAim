import { AsyncStream } from '../../src/link/async';
import { connecting, failed, idle, linkErrors, ready, type LineTransport, type LinkState } from '../../src/link/lineTransport';

/** Transporte de guion: registra lo enviado y responde con lo que dicte `onSend`. */
export class ScriptedTransport implements LineTransport {
  readonly lines = new AsyncStream<string>();
  readonly states = new AsyncStream<LinkState>();
  readonly sent: string[] = [];
  opens = 0;
  failOpenWith: Parameters<typeof failed>[0] | undefined;
  private _state: LinkState = idle;

  constructor(public onSend: (line: string, t: ScriptedTransport) => void = () => undefined) {}

  get state(): LinkState { return this._state; }
  private set(s: LinkState) { this._state = s; this.states.push(s); }
  emit(line: string): void { this.lines.push(line); }

  async open(): Promise<void> {
    this.opens += 1;
    this.set(connecting);
    if (this.failOpenWith) {
      this.set(failed(this.failOpenWith));
      throw this.failOpenWith;
    }
    this.set(ready);
  }
  close(): void { this.set(idle); this.lines.finish(); this.states.finish(); }
  async send(line: string): Promise<void> {
    if (this._state.kind !== 'ready') throw linkErrors.connectionLost;
    this.sent.push(line);
    this.onSend(line, this);
  }
  drop(): void { this.set(failed(linkErrors.connectionLost)); }
}

/** Respuestas de un pinger correcto a la secuencia de arranque. */
export function goodPinger(proto = 1, extra?: (line: string, t: ScriptedTransport) => void) {
  return (line: string, t: ScriptedTransport) => {
    if (line === 'HELLO') t.emit(`#HELLO fw=sim proto=${proto} radio=SX1262 id=AA`);
    else if (line === 'STOP') t.emit('#OK stop');
    else if (line === 'MON off') t.emit('#OK mon=off');
    else if (line === 'CFG?') t.emit('#CFG freq=915.800 rate=1500 txp=22');
    else if (line.startsWith('SET hash=')) t.emit(`#OK ${line.slice(4)}`);
    else extra?.(line, t);
  };
}
