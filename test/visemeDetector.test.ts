import assert from "node:assert/strict";
import { test } from "node:test";
import { Resampler } from "../src/resampler.ts";
import { VisemeDetector, type VisemeEvent } from "../src/visemeDetector.ts";
import { model, parityAudio, parityVisemes } from "./helpers.ts";

function detect(audio: Float32Array, rate: number, startMs: number): VisemeEvent[] {
  const events: VisemeEvent[] = [];
  const detector = new VisemeDetector(model, rate, startMs, (e) => events.push(e));
  for (let i = 0; i < audio.length; i += 1024) detector.push(audio.subarray(i, i + 1024));
  detector.flush();
  return events;
}

/** Viseme in effect at each 10 ms frame centre. */
const frames = (events: VisemeEvent[], startMs: number, n: number) => Array.from({ length: n }, (_, f) => {
  const t = startMs + f * 10 + 12.5;
  return [...events].reverse().find((e) => e.ms <= t)?.id ?? 0;
});

test("16 kHz: events are PyTorch's visemes, held 2+ frames, timed from startMs", () => {
  const events = detect(parityAudio, 16000, 1000);
  const labels = parityVisemes.slice(model.lookahead); // output n describes frame n - lookahead
  const got = frames(events, 1000, labels.length);
  const agree = got.filter((v, i) => v === labels[i]).length / labels.length;
  assert.ok(agree > 0.9, `agreement ${agree}`); // the rest: one-frame blips the min-run filter drops
  assert.ok(events.every((e, i) => i === 0 || e.ms > events[i - 1].ms), "events in time order");
  assert.ok(events[0].ms >= 1000);
});

test("48 kHz input gives the same timeline as 16 kHz", () => {
  const up = new Resampler(16000, 48000);
  const audio48 = Float32Array.from([...up.push(parityAudio), ...up.push(new Float32Array(200))]);
  const n = 250;
  const a = frames(detect(parityAudio, 16000, 0), 0, n);
  const b = frames(detect(audio48, 48000, 0), 0, n);
  const agree = a.filter((v, i) => v === b[i]).length / n;
  assert.ok(agree > 0.9, `agreement ${agree}`);
});

test("a one-frame p/b/m is kept only right after silence", () => {
  const ids = (frames: number[]) => {
    const events: VisemeEvent[] = [];
    const detector = new VisemeDetector(model, 16000, 0, (e) => events.push(e));
    for (const f of [...Array(model.lookahead).fill(0), ...frames]) (detector as unknown as { onFrame(v: number): void }).onFrame(f);
    return events.map((e) => e.id);
  };
  assert.deepEqual(ids([0, 0, 21, 1, 1]), [0, 21, 1]); // "b" at a word start: only the release is audible
  assert.deepEqual(ids([1, 1, 21, 1, 1]), [1]); // mid-word one-frame blip still filtered
});
