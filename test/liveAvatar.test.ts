import assert from "node:assert/strict";
import { test } from "node:test";
import { LiveAvatar, LiveAvatarError, type WebSocketClass } from "../src/server.ts";

/** Stands in for the API: records what the SDK sends, and replies like the server. */
class FakeSocket {
  static last: FakeSocket;
  readyState = 0;
  binaryType = "blob";
  sent: (string | Uint8Array)[] = [];
  private handlers: Record<string, ((event: any) => void)[]> = {};
  constructor(readonly url: string) {
    FakeSocket.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.fire("open", {});
    });
  }
  addEventListener(type: string, fn: (event: any) => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  send(data: string | ArrayBufferView) {
    this.sent.push(typeof data === "string" ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
    if (typeof data === "string") this.onText?.(JSON.parse(data));
  }
  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.fire("close", { code, reason });
  }
  onText?: (msg: any) => void;
  reply(msg: object) {
    this.fire("message", { data: JSON.stringify(msg) });
  }
  json() {
    return this.sent.filter((m): m is string => typeof m === "string").map((m) => JSON.parse(m));
  }
  binary() {
    return this.sent.filter((m): m is Uint8Array => typeof m !== "string");
  }
  private fire(type: string, event: object) {
    for (const fn of this.handlers[type] ?? []) fn(event);
  }
}
const WebSocket = FakeSocket as unknown as WebSocketClass;

/** A started session; `onText` answers the start message with ready (direct) unless replaced. */
async function started(options: Partial<Parameters<typeof LiveAvatar.start>[0]> = {}) {
  const pending = LiveAvatar.start({ apiKey: "tav_test", avatar: "ava4", WebSocket, ...options });
  const ws = FakeSocket.last;
  ws.onText = (msg) => msg.type === "start" && ws.reply({ type: "ready", width: 832, height: 468, audio: true });
  return { avatar: await pending, ws };
}

test("start: direct output by default, resolves on ready with the video size", async () => {
  const { avatar, ws } = await started();
  assert.equal(ws.url, "wss://api.talking-avatar.dev");
  assert.deepEqual(ws.json()[0], { type: "start", apiKey: "tav_test", avatar: "ava4", sampleRate: 24000, output: "direct" });
  assert.equal(avatar.width, 832);
  assert.equal(avatar.height, 468);
  assert.equal(avatar.playsVoice, true);
});

test("start: livekit publishes the voice unless told not to", async () => {
  const livekit = { url: "wss://lk", token: "jwt" };
  const { ws } = await started({ livekit });
  assert.deepEqual(ws.json()[0], {
    type: "start", apiKey: "tav_test", avatar: "ava4", sampleRate: 24000, livekitUrl: "wss://lk", token: "jwt",
    audio: { publish: true, trackName: "avatar-audio" },
  });
  const { avatar, ws: ws2 } = await started({ livekit: { ...livekit, publishAudio: false } });
  assert.equal(ws2.json()[0].audio, undefined);
  assert.equal(avatar.playsVoice, false);
  assert.equal(await avatar.clear(), null); // nothing to wait for: we don't play the voice
});

test("start: rejects with the API's reason and close code", async () => {
  const pending = LiveAvatar.start({ apiKey: "tav_bad", avatar: "ava4", WebSocket });
  const ws = FakeSocket.last;
  ws.onText = () => {
    ws.reply({ type: "error", message: "insufficient balance" });
    ws.close(4002, "insufficient balance");
  };
  await assert.rejects(pending, (error: LiveAvatarError) => error.code === 4002 && /insufficient balance/.test(error.message));
});

test("pushAudio: 12-byte header, rejoins split samples, splits big chunks", async () => {
  const { avatar, ws } = await started();
  avatar.pushAudio(new Uint8Array([1, 2, 3])); // one sample and a half
  avatar.pushAudio(new Uint8Array([4, 5]));
  const [first, second] = ws.binary();
  const header = (m: Uint8Array) => new DataView(m.buffer, m.byteOffset);
  assert.equal(header(first).getFloat64(0, true), 0); // play time 0: the API schedules it
  assert.equal(header(first).getUint32(8, true), 24000);
  assert.deepEqual([...first.subarray(12)], [1, 2]);
  assert.deepEqual([...second.subarray(12)], [3, 4]); // 5 waits for its pair

  avatar.pushAudio(Buffer.from(new Int16Array([7, 8]).buffer).toString("base64"), { sampleRate: 16000 });
  const b64 = ws.binary()[2];
  assert.equal(header(b64).getUint32(8, true), 16000);
  assert.deepEqual([...b64.subarray(12)], [5, 7, 0, 8]); // the held byte leads; the last 0 waits

  const before = ws.binary().length;
  avatar.pushAudio(new Int16Array(24000 * 10), { playAtMs: 1_000_000 }); // 10 s: 480 KB
  const pieces = ws.binary().slice(before);
  assert.ok(pieces.length >= 2 && pieces.every((m) => m.length <= 12 + 256 * 1024));
  assert.equal(pieces.reduce((n, m) => n + m.length - 12, 0), 24000 * 10 * 2); // the held byte went first, one is held again
  assert.equal(header(pieces[1]).getFloat64(0, true), 1_000_000 + (256 * 1024) / 2 / 24000 * 1000); // later piece, later time
});

test("clear resolves with playedMs; events are emitted", async () => {
  const { avatar, ws } = await started();
  const seen: unknown[] = [];
  avatar.on("speechStarted", () => seen.push("started"));
  avatar.on("speechEnded", (ms) => seen.push(["ended", ms]));
  avatar.on("republished", () => seen.push("republished"));
  ws.reply({ type: "speech_started" });
  ws.reply({ type: "speech_ended", playedMs: 1234 });
  ws.reply({ type: "republished", sessionId: "x" });
  assert.deepEqual(seen, ["started", ["ended", 1234], "republished"]);

  ws.onText = (msg) => msg.type === "clear" && ws.reply({ type: "cleared", playedMs: 820 });
  assert.equal(await avatar.clear(), 820);
});

test("handleView relays the offer and the answer, matched by id", async () => {
  const { avatar, ws } = await started();
  ws.onText = (msg) => {
    if (msg.type === "view") ws.reply({ type: "view_offer", id: msg.id, viewId: "v1", sdp: "offer-sdp" });
    if (msg.type === "view_answer") ws.reply({ type: "view_ready", id: msg.id, viewId: msg.viewId });
  };
  assert.deepEqual(await avatar.handleView({}), { viewId: "v1", sdp: "offer-sdp" });
  assert.deepEqual(await avatar.handleView({ viewId: "v1", sdp: "answer-sdp" }), { viewId: "v1" });
  assert.deepEqual(ws.json().at(-1), { type: "view_answer", viewId: "v1", sdp: "answer-sdp", id: ws.json().at(-1).id });

  ws.onText = (msg) => ws.reply({ type: "error", id: msg.id, message: "cloudflare down" });
  await assert.rejects(avatar.handleView(), /cloudflare down/);
});

test("close: pending requests fail, the close event carries the reason", async () => {
  const { avatar, ws } = await started();
  ws.onText = () => {}; // never replies
  const view = avatar.handleView();
  let closed: unknown[] = [];
  avatar.on("close", (code, reason) => (closed = [code, reason]));
  ws.close(4003);
  await assert.rejects(view, (error: LiveAvatarError) => error.code === 4003);
  assert.deepEqual(closed, [4003, "session reached its 3-hour limit"]);
  assert.equal(avatar.closed, true);
  avatar.pushAudio(new Int16Array(10)); // after the end: dropped, no throw
});
