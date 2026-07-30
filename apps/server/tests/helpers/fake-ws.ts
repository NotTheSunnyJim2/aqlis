/**
 * Structural fake for the `ws` library's WebSocket (Node's EventEmitter-
 * style `.on()` API — distinct from the browser's `.onopen`/`.onmessage`
 * properties used by apps/web's FakeWebSocket, hence a separate fake).
 * Drives FinnhubPriceClient's reconnect/heartbeat logic deterministically
 * under vi.useFakeTimers(), with no real socket I/O involved.
 */
type Handler = (...args: unknown[]) => void;

export class FakeWs {
  static instances: FakeWs[] = [];

  url: string;
  terminated = false;
  closed = false;
  sent: string[] = [];
  pingCount = 0;
  private readonly handlers = new Map<string, Handler[]>();

  constructor(url: string) {
    this.url = url;
    FakeWs.instances.push(this);
  }

  on(event: string, handler: Handler): this {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  ping(): void {
    this.pingCount += 1;
  }

  /** Real `ws.terminate()` forcibly closes AND fires 'close'. */
  terminate(): void {
    this.terminated = true;
    this.emit("close");
  }

  close(): void {
    this.closed = true;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

export function resetFakeWs(): void {
  FakeWs.instances = [];
}
