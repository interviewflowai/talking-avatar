import type { ViewRequest, ViewResponse } from "./live";

/**
 * Realistic Avatars, server side: a photorealistic avatar that speaks your agent's voice, streamed to your users.
 * One LiveAvatar per conversation. It holds your API key, so it runs on your server, never in the browser.
 *
 *   const avatar = await LiveAvatar.start({ apiKey, avatar: "ava4" })
 *   tts.on("data", (pcm) => avatar.pushAudio(pcm))
 *
 * Direct output (the default) streams the avatar and its voice to your page over WebRTC: give the page one route
 * that calls `handleView` (see LiveAvatarView in "@interviewflowai/talking-avatar/live"). With `livekit`, the avatar
 * joins your LiveKit room instead.
 */

export const DEFAULT_API_URL = "wss://api.talking-avatar.dev";
const REQUEST_TIMEOUT_MS = 15000;
const PIECE_BYTES = 256 * 1024; // audio is sent in pieces; the API takes messages up to 1 MB
const OPEN = 1;

export type SampleRate = 8000 | 12000 | 16000 | 24000 | 48000;

export interface LiveAvatarOptions {
  /** Your tav_… API key, from the dashboard. Billed per minute from start until close. */
  apiKey: string;
  /** Which avatar, e.g. "ava4". See the dashboard for the list. */
  avatar: string;
  /** Your TTS audio's sample rate (PCM16 mono). Default 24000. */
  sampleRate?: SampleRate;
  /**
   * Publish into your LiveKit room instead of streaming directly: your LiveKit URL and a token you mint for the
   * avatar's participant (publish only). We never see your LiveKit secrets. The video track is named "avatar".
   */
  livekit?: {
    url: string;
    token: string;
    /** Also publish the voice, in sync with the lips (recommended). Default true. False: you play it yourself. */
    publishAudio?: boolean;
    /** The voice track's name. Default "avatar-audio". */
    audioTrackName?: string;
  };
  /** The API's URL. Default DEFAULT_API_URL. */
  url?: string;
  /** A WebSocket class, for Node < 22: `import WebSocket from "ws"`. Default: the global WebSocket. */
  WebSocket?: WebSocketClass;
}

export interface LiveAvatarEvents {
  /** The avatar started speaking (a response's first audio is playing). */
  speechStarted: () => void;
  /** Everything queued has played: `playedMs` of this response were heard. */
  speechEnded: (playedMs: number) => void;
  /** The stream recovered from a dropped connection. LiveAvatarView reconnects by itself. */
  republished: () => void;
  /** The session ended. 1000: you closed it. See LiveAvatarError for the others. */
  close: (code: number, reason: string) => void;
}

/** Why a session failed or ended: `code` is the WebSocket close code (4001 key, 4002 balance, 4003 3-hour limit). */
export class LiveAvatarError extends Error {
  constructor(readonly code: number, message: string) {
    super(`talking-avatar: ${message}`);
    this.name = "LiveAvatarError";
  }
}

const CLOSE_REASONS: Record<number, string> = {
  4001: "invalid or missing API key",
  4002: "balance below one minute: top up in the dashboard",
  4003: "session reached its 3-hour limit",
  1011: "avatar stream lost",
};

interface Socket {
  readonly readyState: number;
  binaryType: string;
  send(data: string | ArrayBufferView): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
}
export type WebSocketClass = new (url: string) => Socket;

type Pending = { resolve: (msg: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class LiveAvatar {
  /** Video size in pixels (all avatars are 832 wide, ~16:9). */
  width = 0;
  height = 0;
  /** "direct" (WebRTC to your page) or "livekit". */
  readonly output: "direct" | "livekit";
  /** False when you play the voice yourself (livekit with publishAudio false): then pass play times to pushAudio. */
  readonly playsVoice: boolean;
  /** True once the session ended. */
  closed = false;

  private readonly ws: Socket;
  private readonly sampleRate: number;
  private readonly pending = new Map<string, Pending>();
  private readonly clearing: ((playedMs: number | null) => void)[] = [];
  private readonly listeners = new Map<keyof LiveAvatarEvents, Set<(...args: never[]) => void>>();
  private carry: number | null = null; // a PCM16 byte split from its pair at the end of the last chunk
  private nextId = 0;

  /** Opens a session and resolves once the avatar is live (rejects with a LiveAvatarError if it can't start). */
  static start(options: LiveAvatarOptions): Promise<LiveAvatar> {
    const avatar = new LiveAvatar(options);
    return new Promise((resolve, reject) => {
      let error: string | null = null;
      avatar.ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        const msg = JSON.parse(event.data);
        if (msg.type === "ready" && !avatar.width) {
          avatar.width = msg.width;
          avatar.height = msg.height;
          resolve(avatar);
        } else if (msg.type === "error" && !avatar.width) {
          error = String(msg.message);
        }
      });
      avatar.ws.addEventListener("close", (event) => {
        if (!avatar.width) reject(new LiveAvatarError(event.code, error ?? (CLOSE_REASONS[event.code] || `connection closed (${event.code})`)));
      });
    });
  }

  private constructor(options: LiveAvatarOptions) {
    if (!options.apiKey) throw new LiveAvatarError(4001, "apiKey is required");
    const Ws = options.WebSocket ?? (globalThis as { WebSocket?: WebSocketClass }).WebSocket;
    if (!Ws) throw new Error("talking-avatar: no WebSocket in this runtime (Node < 22): pass `WebSocket` from the ws package");
    this.sampleRate = options.sampleRate ?? 24000;
    this.output = options.livekit ? "livekit" : "direct";
    this.playsVoice = !options.livekit || options.livekit.publishAudio !== false;

    const start: Record<string, unknown> = {
      type: "start",
      apiKey: options.apiKey,
      avatar: options.avatar,
      sampleRate: this.sampleRate,
    };
    if (options.livekit) {
      Object.assign(start, { livekitUrl: options.livekit.url, token: options.livekit.token });
      if (this.playsVoice) start.audio = { publish: true, trackName: options.livekit.audioTrackName ?? "avatar-audio" };
    } else {
      start.output = "direct";
    }

    this.ws = new Ws(options.url ?? DEFAULT_API_URL);
    this.ws.binaryType = "arraybuffer";
    this.ws.addEventListener("open", () => this.ws.send(JSON.stringify(start)));
    this.ws.addEventListener("message", (event) => typeof event.data === "string" && this.receive(JSON.parse(event.data)));
    this.ws.addEventListener("close", (event) => this.ended(event.code, String(event.reason ?? "")));
    this.ws.addEventListener("error", () => {}); // a close follows
  }

  /**
   * Your agent's voice, as it comes from your TTS: PCM16 mono as an Int16Array, raw bytes (Buffer / Uint8Array /
   * ArrayBuffer; chunks may split a sample) or base64 (e.g. OpenAI Realtime audio deltas). It's queued after what's
   * already queued and played in sync with the lips, so don't play it yourself.
   *
   * `playAtMs`: only when you play the voice yourself (playsVoice false), the wall-clock time (ms since epoch) this
   * audio will be heard, sent ~400 ms early.
   */
  pushAudio(pcm: Int16Array | Uint8Array | ArrayBuffer | string, options: { sampleRate?: SampleRate; playAtMs?: number } = {}): void {
    if (this.ws.readyState !== OPEN || !this.width) return; // ended (see the close event) or not started yet
    let bytes = typeof pcm === "string" ? Uint8Array.from(atob(pcm), (c) => c.charCodeAt(0))
      : pcm instanceof ArrayBuffer ? new Uint8Array(pcm)
        : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    if (this.carry !== null) {
      const joined = new Uint8Array(bytes.length + 1);
      joined[0] = this.carry;
      joined.set(bytes, 1);
      bytes = joined;
      this.carry = null;
    }
    if (bytes.length % 2) {
      this.carry = bytes[bytes.length - 1];
      bytes = bytes.subarray(0, -1);
    }
    const rate = options.sampleRate ?? this.sampleRate;
    for (let at = 0; at < bytes.length; at += PIECE_BYTES) {
      const piece = bytes.subarray(at, at + PIECE_BYTES);
      const message = new Uint8Array(12 + piece.length);
      const header = new DataView(message.buffer);
      header.setFloat64(0, options.playAtMs ? options.playAtMs + (at / 2 / rate) * 1000 : 0, true);
      header.setUint32(8, rate, true);
      message.set(piece, 12);
      this.ws.send(message);
    }
  }

  /**
   * Barge-in: drops the audio not yet played. Resolves with how many ms of the interrupted response were heard
   * (e.g. to truncate your transcript), or null when you play the voice yourself.
   */
  clear(): Promise<number | null> {
    this.carry = null;
    if (this.ws.readyState !== OPEN) return Promise.resolve(null);
    if (!this.playsVoice) {
      this.ws.send(JSON.stringify({ type: "clear" }));
      return Promise.resolve(null);
    }
    const cleared = new Promise<number | null>((resolve) => this.clearing.push(resolve));
    this.ws.send(JSON.stringify({ type: "clear" }));
    return cleared;
  }

  /**
   * Direct output: your page's route. Pass the request body from LiveAvatarView and return the result as JSON:
   *
   *   app.post("/avatar", async (req, res) => res.json(await avatar.handleView(req.body)))
   *
   * One call for the WebRTC offer, a second one with the browser's answer. Any number of viewers.
   */
  async handleView(body?: ViewRequest | null): Promise<ViewResponse> {
    if (this.output !== "direct") throw new LiveAvatarError(0, "handleView is for direct output (no livekit option)");
    if (body && typeof body.viewId === "string" && typeof body.sdp === "string") {
      await this.request({ type: "view_answer", viewId: body.viewId, sdp: body.sdp });
      return { viewId: body.viewId };
    }
    const offer = await this.request({ type: "view" });
    return { viewId: String(offer.viewId), sdp: String(offer.sdp) };
  }

  on<K extends keyof LiveAvatarEvents>(type: K, listener: LiveAvatarEvents[K]): () => void {
    const set = this.listeners.get(type) ?? new Set();
    this.listeners.set(type, set.add(listener));
    return () => void set.delete(listener);
  }

  /** Ends the session: the avatar stops and billing stops. */
  close(): void {
    if (this.ws.readyState <= OPEN) this.ws.close(1000);
  }

  private emit<K extends keyof LiveAvatarEvents>(type: K, ...args: Parameters<LiveAvatarEvents[K]>): void {
    for (const listener of this.listeners.get(type) ?? []) (listener as (...a: unknown[]) => void)(...args);
  }

  private request(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.ws.readyState !== OPEN || !this.width) return Promise.reject(new LiveAvatarError(0, "session not live"));
    const id = `r${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.pending.delete(id) && reject(new LiveAvatarError(0, `${msg.type}: no reply`)), REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }

  private receive(msg: Record<string, unknown>): void {
    const pending = typeof msg.id === "string" ? this.pending.get(msg.id) : undefined;
    if (pending) {
      this.pending.delete(msg.id as string);
      clearTimeout(pending.timer);
      if (msg.type === "error") pending.reject(new LiveAvatarError(0, String(msg.message)));
      else pending.resolve(msg);
      return;
    }
    if (msg.type === "speech_started") this.emit("speechStarted");
    else if (msg.type === "speech_ended") this.emit("speechEnded", Number(msg.playedMs));
    else if (msg.type === "cleared") this.clearing.shift()?.(Number(msg.playedMs));
    else if (msg.type === "republished") this.emit("republished");
  }

  private ended(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new LiveAvatarError(code, "session ended"));
    }
    this.pending.clear();
    for (const resolve of this.clearing.splice(0)) resolve(null);
    if (this.width) this.emit("close", code, reason || CLOSE_REASONS[code] || "");
  }
}
