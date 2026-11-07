// LineCodec.swift L160–200 — reensambla líneas completas a partir de notificaciones BLE en trozos arbitrarios.
// Separa por `\n` (tolera `\r\n`), ignora líneas vacías y decodifica UTF-8 solo al cerrar la línea, así un carácter
// multibyte partido entre dos notificaciones no se corrompe. Tope de 160 B con el terminador: una línea más larga se
// descarta entera y se cuenta en `overflowCount`; el siguiente `\n` resincroniza.
import { utf8Decode, utf8Encode } from './utf8';

export class LineAssembler {
  static readonly maxLine = 160;
  private buffer: number[] = [];
  private discarding = false;
  private _overflowCount = 0;

  get overflowCount(): number {
    return this._overflowCount;
  }

  feed(data: Uint8Array | string): string[] {
    const bytes = typeof data === 'string' ? utf8Encode(data) : data;
    const lines: string[] = [];
    for (const byte of bytes) {
      if (byte === 0x0a) {
        if (this.discarding) {
          this.discarding = false;
          this._overflowCount += 1;
        } else {
          const line = this.take();
          if (line !== undefined) lines.push(line);
        }
        continue;
      }
      if (this.discarding) continue;
      this.buffer.push(byte);
      if (this.buffer.length > LineAssembler.maxLine - 1) {
        // 159 B de contenido + '\n' = 160 B
        this.buffer = [];
        this.discarding = true;
      }
    }
    return lines;
  }

  private take(): string | undefined {
    const b = this.buffer;
    this.buffer = [];
    if (b[b.length - 1] === 0x0d) b.pop();
    return b.length === 0 ? undefined : utf8Decode(b);
  }
}
