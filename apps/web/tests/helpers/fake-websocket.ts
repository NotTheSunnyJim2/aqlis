/**
 * Structural fake for the browser `WebSocket` constructor — same
 * "fake the surface actually used, cast at the test boundary" pattern
 * as the server's FakeRedis/FakePrisma fakes throughout this project.
 * Tests drive it via simulateOpen/simulateMessage/simulateClose rather
 * than a real socket.
 */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }

  simulateOpen(): void {
    this.onopen?.();
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(): void {
    this.onclose?.();
  }
}

/** Reset between tests so instances from a previous test don't leak in. */
export function resetFakeWebSocket(): void {
  FakeWebSocket.instances = [];
}
