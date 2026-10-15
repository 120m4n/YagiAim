// Equivalentes mínimos de AsyncStream y Task de Swift (R-2: el hilo único de JS equivale a @MainActor).

/** `AsyncStream`: un productor, un consumidor; `push` tras `finish` se ignora. Conserva el orden. */
export class AsyncStream<T> implements AsyncIterable<T> {
  private readonly queue: T[] = [];
  private waiting: ((r: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(v: T): void {
    if (this.done) return;
    const w = this.waiting.shift();
    if (w) w({ value: v, done: false });
    else this.queue.push(v);
  }

  finish(): void {
    this.done = true;
    for (const w of this.waiting) w({ value: undefined, done: true });
    this.waiting = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.queue.length > 0) return Promise.resolve({ value: this.queue.shift() as T, done: false });
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise<IteratorResult<T>>((res) => this.waiting.push(res));
      },
    };
  }
}

/** `Task`: solo la parte que usa el código — bandera de cancelación y `sleep` que despierta al cancelar. */
export class TaskToken {
  cancelled = false;
  private wake: (() => void)[] = [];

  cancel(): void {
    this.cancelled = true;
    const w = this.wake;
    this.wake = [];
    for (const f of w) f();
  }

  /** `try? await Task.sleep`: vuelve al cumplirse el plazo o al cancelar, sin lanzar. */
  sleep(ms: number): Promise<void> {
    if (this.cancelled) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = this.wake.filter((f) => f !== done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(ms, 0));
      this.wake.push(done);
    });
  }
}

/** Espera sin cancelación (`try? await Task.sleep` fuera de un Task cancelable). */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(ms, 0)));
