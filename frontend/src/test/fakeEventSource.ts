/**
 * A jsdom stand-in for `EventSource`, driven by the tests: a test calls `open()`, `emit()`
 * and `fail()` on `latestEventSource()` the way the server and the network would.
 */

type Listener = (event: Event) => void;

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

export class FakeEventSource {
  static readonly CONNECTING = CONNECTING;
  static readonly OPEN = OPEN;
  static readonly CLOSED = CLOSED;

  /** Every source created since the last `resetFakeEventSources()`, oldest first. */
  static instances: FakeEventSource[] = [];

  readonly CONNECTING = CONNECTING;
  readonly OPEN = OPEN;
  readonly CLOSED = CLOSED;
  readonly url: string;
  readonly withCredentials = false;
  readyState: number = CONNECTING;
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.readyState = CLOSED;
  }

  /** The connection was established. */
  open(): void {
    this.readyState = OPEN;
    this.dispatch(new Event("open"));
    this.onopen?.(new Event("open"));
  }

  /** The server sent a named frame; `data` is JSON-encoded like the real stream does. */
  emit(event: string, data: unknown, id = ""): void {
    this.dispatch(new MessageEvent(event, { data: JSON.stringify(data), lastEventId: id }));
  }

  /** The connection broke: CONNECTING = the browser will retry, CLOSED = it gave up. */
  fail(readyState: number = CONNECTING): void {
    this.readyState = readyState;
    const error = new Event("error");
    this.dispatch(error);
    this.onerror?.(error);
  }

  private dispatch(event: Event): void {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

/** The newest source; throws when the page has not opened one. */
export function latestEventSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (source === undefined) {
    throw new Error("No EventSource was opened.");
  }
  return source;
}

export function resetFakeEventSources(): void {
  FakeEventSource.instances = [];
}
