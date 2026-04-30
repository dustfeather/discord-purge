import type { LogLine } from '../../shared/types.js';

export type LogListener = (line: LogLine, all: readonly LogLine[]) => void;

export class Logger {
  private readonly capacity: number;
  private readonly buffer: LogLine[] = [];
  private readonly listeners = new Set<LogListener>();

  constructor(capacity = 200) {
    this.capacity = capacity;
  }

  append(msg: string): LogLine {
    const line: LogLine = { ts: Date.now(), msg };
    this.buffer.push(line);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    for (const l of this.listeners) {
      try {
        l(line, this.buffer);
      } catch {
        // noop
      }
    }
    return line;
  }

  lines(): readonly LogLine[] {
    return this.buffer;
  }

  subscribe(l: LogListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
