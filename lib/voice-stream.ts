// Keeps a live-transcription connection alive for as long as someone is
// recording, however many connections that takes.
//
// A connection can end under us: the relay is a server function that gets shut
// down after 150 seconds on the free plan, the network can blip, or Deepgram
// can drop us. This owns the connection so the recording screen doesn't have
// to: audio is held in a small buffer while we're between connections, the
// next connection picks up where the last one stopped, and if nothing can be
// reconnected it says so (onGaveUp) instead of failing silently.
//
// It has no React Native or Supabase dependencies, so the logic is testable on
// its own: `connect` is supplied by the caller.

export type VoicePath = 'direct' | 'relay';

// The subset of WebSocket this needs; React Native's WebSocket satisfies it.
export interface VoiceSocket {
  readonly readyState: number; // 1 = open
  send(data: any): void;
  close(): void;
  onmessage: ((e: { data: any }) => void) | null;
  onclose: ((e?: any) => void) | null;
  onerror: ((e?: any) => void) | null;
}

export type VoiceStreamOptions = {
  // Opens a connection on the given path and resolves once it is open.
  connect: (path: VoicePath) => Promise<VoiceSocket>;
  onMessage: (data: string) => void;
  // The connection changed: any half-finished phrase from the old one is gone.
  onSwitch?: () => void;
  onStatus?: (status: 'live' | 'reconnecting') => void;
  // Nothing could be reconnected; recording should stop and the user be told.
  onGaveUp: (reason: string) => void;
  // Preferred path first.
  paths?: VoicePath[];
  // Hand off to a fresh connection before the relay's time limit.
  rotateAfterMs?: Partial<Record<VoicePath, number>>;
  retryDelaysMs?: number[];
  // Audio held while between connections (16kHz, 16-bit mono).
  maxBufferedBytes?: number;
  // How long to wait for the last words after asking a connection to finish.
  closeWaitMs?: number;
};

const OPEN = 1;

export class VoiceStreamManager {
  private opts: Required<Omit<VoiceStreamOptions, 'onSwitch' | 'onStatus'>> &
    Pick<VoiceStreamOptions, 'onSwitch' | 'onStatus'>;
  private active: VoiceSocket | null = null;
  private activePath: VoicePath;
  private buffer: Uint8Array[] = [];
  private bufferedBytes = 0;
  private holding = false; // audio is being held for a hand-off
  private state: 'idle' | 'live' | 'recovering' | 'stopped' = 'idle';
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private retired = new WeakSet<VoiceSocket>(); // closed on purpose; ignore their close events
  private handingOff = false;

  constructor(options: VoiceStreamOptions) {
    this.opts = {
      paths: ['direct', 'relay'],
      rotateAfterMs: { relay: 120_000 },
      retryDelaysMs: [1000, 2000, 4000],
      maxBufferedBytes: 16000 * 2 * 30,
      closeWaitMs: 1500,
      ...options,
    };
    this.activePath = this.opts.paths[0];
  }

  // First connection. Tries each path in turn; throws if none opens.
  async start(): Promise<void> {
    let lastError: unknown = null;
    for (const path of this.opts.paths) {
      try {
        const socket = await this.opts.connect(path);
        this.state = 'live';
        this.adopt(socket, path);
        this.opts.onStatus?.('live');
        return;
      } catch (e) {
        lastError = e;
      }
    }
    this.state = 'stopped';
    throw lastError instanceof Error ? lastError : new Error('Could not connect for live transcription.');
  }

  send(chunk: Uint8Array): void {
    if (this.state === 'stopped' || this.state === 'idle') return;
    const socket = this.active;
    if (!this.holding && socket && socket.readyState === OPEN) {
      socket.send(chunk);
      return;
    }
    this.buffer.push(chunk);
    this.bufferedBytes += chunk.byteLength;
    while (this.bufferedBytes > this.opts.maxBufferedBytes && this.buffer.length > 1) {
      this.bufferedBytes -= this.buffer.shift()!.byteLength; // drop the oldest
    }
  }

  // The person ended the recording: let the last words come through, then close.
  async stop(): Promise<void> {
    if (this.state === 'stopped') return;
    this.state = 'stopped';
    this.clearRotation();
    const socket = this.active;
    this.active = null;
    if (socket && socket.readyState === OPEN) {
      this.retired.add(socket);
      await this.finish(socket);
    }
    this.buffer = [];
    this.bufferedBytes = 0;
  }

  // Drop everything without waiting for anything.
  abort(): void {
    this.state = 'stopped';
    this.clearRotation();
    const socket = this.active;
    this.active = null;
    if (socket) { this.retired.add(socket); try { socket.close(); } catch {} }
    this.buffer = [];
    this.bufferedBytes = 0;
  }

  // ---- internals ----------------------------------------------------------

  private adopt(socket: VoiceSocket, path: VoicePath) {
    this.active = socket;
    this.activePath = path;
    socket.onmessage = (e) => {
      if (typeof e.data === 'string') this.opts.onMessage(e.data);
    };
    socket.onerror = () => {};
    socket.onclose = () => {
      if (this.retired.has(socket) || socket !== this.active || this.state === 'stopped') return;
      void this.recover();
    };
    this.flushBuffer(socket);
    this.scheduleRotation();
  }

  private flushBuffer(socket: VoiceSocket) {
    const pending = this.buffer;
    this.buffer = [];
    this.bufferedBytes = 0;
    for (const chunk of pending) socket.send(chunk);
  }

  // Ask a connection to finish, and wait (briefly) for its final words.
  private finish(socket: VoiceSocket): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const end = () => { if (done) return; done = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => { try { socket.close(); } catch {} end(); }, this.opts.closeWaitMs);
      const previous = socket.onclose;
      socket.onclose = (e) => { previous?.(e); end(); };
      try { socket.send(JSON.stringify({ type: 'CloseStream' })); } catch { end(); }
    });
  }

  private clearRotation() {
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    this.rotateTimer = null;
  }

  private scheduleRotation(delayOverride?: number) {
    this.clearRotation();
    const after = delayOverride ?? this.opts.rotateAfterMs[this.activePath];
    if (!after || this.state !== 'live') return;
    this.rotateTimer = setTimeout(() => { void this.handOff(); }, after);
  }

  // Replace the connection before it is shut down: open the next one first, let
  // the old one finish its last words, then switch, so no audio is lost.
  private async handOff() {
    if (this.state !== 'live' || this.handingOff || !this.active) return;
    this.handingOff = true;
    const old = this.active;
    let next: VoiceSocket;
    try {
      next = await this.opts.connect(this.activePath);
    } catch {
      this.handingOff = false;
      this.scheduleRotation(10_000); // try again shortly; the old one still works
      return;
    }
    if (this.state !== 'live' || old !== this.active) {
      try { next.close(); } catch {}
      this.handingOff = false;
      return;
    }
    this.holding = true; // audio waits while the old connection finishes
    this.retired.add(old);
    await this.finish(old);
    if (this.state !== 'live') {
      try { next.close(); } catch {}
      this.holding = false;
      this.handingOff = false;
      return;
    }
    this.holding = false;
    this.adopt(next, this.activePath);
    this.opts.onSwitch?.();
    this.handingOff = false;
  }

  // The connection ended on its own: try again, then another path, then give up.
  private async recover() {
    if (this.state !== 'live') return;
    this.state = 'recovering';
    this.clearRotation();
    this.active = null;
    this.opts.onStatus?.('reconnecting');

    const other = this.opts.paths.find(p => p !== this.activePath);
    const attempts: VoicePath[] = this.opts.retryDelaysMs.map((_, i) =>
      i < this.opts.retryDelaysMs.length - 1 || !other ? this.activePath : other
    );

    for (let i = 0; i < attempts.length; i++) {
      await new Promise(r => setTimeout(r, this.opts.retryDelaysMs[i]));
      if (this.state !== 'recovering') return; // stopped meanwhile
      try {
        const socket = await this.opts.connect(attempts[i]);
        if (this.state !== 'recovering') { try { socket.close(); } catch {} return; }
        this.state = 'live';
        this.adopt(socket, attempts[i]);
        this.opts.onSwitch?.();
        this.opts.onStatus?.('live');
        return;
      } catch {
        // try the next attempt
      }
    }
    this.state = 'stopped';
    this.buffer = [];
    this.bufferedBytes = 0;
    this.opts.onGaveUp('connection lost');
  }
}
