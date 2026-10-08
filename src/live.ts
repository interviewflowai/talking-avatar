/**
 * Realistic Avatars, browser side: plays a LiveAvatar's video and voice (direct output) in your page over WebRTC.
 * Your page never holds the API key: it talks to one route on your server that calls `avatar.handleView(body)`.
 *
 *   const view = new LiveAvatarView({ container, endpoint: "/avatar" })
 *   button.onclick = () => view.connect()   // after a click, so the browser lets the voice play
 *
 * It reconnects by itself: when the connection fails, or video frames stop arriving (the stream moved after a drop).
 */

/** What LiveAvatarView posts to your route: {} for an offer, then the browser's answer. */
export interface ViewRequest {
  viewId?: string;
  sdp?: string;
}
/** What your route returns: avatar.handleView's result. */
export interface ViewResponse {
  viewId: string;
  sdp?: string;
}

/** connecting → live; reconnecting after a drop; muted: live, but the browser blocked sound (call unmute()). */
export type LiveAvatarViewStatus = "connecting" | "live" | "muted" | "reconnecting" | "closed";

export interface LiveAvatarViewOptions {
  /** Where to show the avatar: an element the video fills (fitted whole, never cropped), or your own <video>. */
  container: HTMLElement;
  /** Your route that returns `avatar.handleView(body)` as JSON (POST, same-origin cookies), or your own request. */
  endpoint: string | ((body: ViewRequest) => Promise<ViewResponse>);
  /** Default: a public STUN server. Add your TURN server for viewers behind strict firewalls. */
  iceServers?: RTCIceServer[];
  onStatus?: (status: LiveAvatarViewStatus) => void;
  /** Errors while connecting (it retries by itself). Default: console.warn. */
  onError?: (error: Error) => void;
}

const STALL_MS = 2000; // the avatar always sends 25 fps: no video frames this long means the stream moved
const CONNECT_MS = 10000; // a connection that brings no frames this long is tried again
const MAX_RETRY_MS = 8000;

export class LiveAvatarView {
  readonly video: HTMLVideoElement;
  status: LiveAvatarViewStatus = "closed";

  private readonly options: LiveAvatarViewOptions;
  private pc: RTCPeerConnection | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private frames = 0; // video frames received on this connection (WebRTC stats: counted in background tabs too)
  private progressAt = 0;

  constructor(options: LiveAvatarViewOptions) {
    this.options = options;
    if (options.container instanceof HTMLVideoElement) {
      this.video = options.container;
    } else {
      this.video = document.createElement("video");
      this.video.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;background:#000";
      options.container.appendChild(this.video);
    }
    this.video.playsInline = true;
    this.video.autoplay = true;
  }

  /** Starts watching (call it from a click, so the voice may play). Progress comes through onStatus. */
  connect(): void {
    if (this.status !== "closed") return;
    this.setStatus("connecting");
    this.watchdog = setInterval(() => void this.check(), 1000);
    void this.open();
  }

  /** After status "muted": call from a click to turn the voice on. */
  unmute(): void {
    this.video.muted = false;
    void this.video.play().then(() => this.status === "muted" && this.setStatus("live"), () => {});
  }

  disconnect(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.retryTimer = this.watchdog = null;
    this.pc?.close();
    this.pc = null;
    this.video.srcObject = null;
    this.setStatus("closed");
  }

  private async open(): Promise<void> {
    this.pc?.close();
    this.frames = 0;
    this.progressAt = Date.now();
    const pc = (this.pc = new RTCPeerConnection({ iceServers: this.options.iceServers ?? [{ urls: "stun:stun.cloudflare.com:3478" }] }));
    const stream = new MediaStream();
    pc.ontrack = (event) => {
      stream.addTrack(event.track);
      if (this.video.srcObject !== stream) { // set once: setting it again restarts the load and aborts play()
        this.video.srcObject = stream;
        this.play();
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === "connected") {
        this.retries = 0;
        this.setStatus(this.video.muted ? "muted" : "live");
      } else if (pc.connectionState === "failed") {
        this.retry();
      }
    };
    try {
      const offer = await this.request({});
      if (pc !== this.pc) return;
      await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await this.request({ viewId: offer.viewId, sdp: pc.localDescription!.sdp });
    } catch (error) {
      if (pc !== this.pc) return;
      (this.options.onError ?? console.warn)(error instanceof Error ? error : new Error(String(error)));
      this.retry();
    }
  }

  /** Every second: reconnect when video frames stop arriving (Chrome doesn't always mute the track). */
  private async check(): Promise<void> {
    const pc = this.pc;
    if (!pc || this.retryTimer) return;
    let frames = 0;
    (await pc.getStats()).forEach((report) => {
      if (report.type === "inbound-rtp" && report.kind === "video") frames = report.framesReceived ?? 0;
    });
    if (pc !== this.pc) return;
    if (frames > this.frames) {
      this.frames = frames;
      this.progressAt = Date.now();
    } else if (Date.now() - this.progressAt > (this.frames ? STALL_MS : CONNECT_MS)) {
      this.retry();
    }
  }

  private play(): void {
    this.video.play().catch((error) => {
      if (error?.name !== "NotAllowedError") return;
      // No click on the page yet: browsers only allow muted autoplay. Show the video; sound after unmute().
      this.video.muted = true;
      void this.video.play().catch(() => {});
      this.setStatus("muted");
    });
  }

  private retry(): void {
    if (this.status === "closed" || this.retryTimer) return;
    this.setStatus("reconnecting");
    const delay = Math.min(1000 * 2 ** this.retries++, MAX_RETRY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.open();
    }, delay);
  }

  private async request(body: ViewRequest): Promise<ViewResponse> {
    const { endpoint } = this.options;
    if (typeof endpoint === "function") return endpoint(body);
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`talking-avatar: ${endpoint}: ${data.error ?? `HTTP ${res.status}`}`);
    return data;
  }

  private setStatus(status: LiveAvatarViewStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }
}
