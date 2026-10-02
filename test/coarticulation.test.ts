import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSegments, isSpeakingAt, mouthAt } from "../src/coarticulation.ts";

// "tomb": t(19) oo(7) m(21), then silence.
const TOMB = [{ id: 19, ms: 0 }, { id: 7, ms: 60 }, { id: 21, ms: 220 }, { id: 0, ms: 300 }];

test("tongue-only sounds wear the next vowel's lips (narrow jaw); repeats merge", () => {
  const segments = buildSegments([...TOMB.slice(0, 2), { id: 7, ms: 140 }, ...TOMB.slice(2)]);
  assert.deepEqual(segments.map((s) => [s.viseme, s.start, s.end, s.level]), [
    ["U", 0, 60, 0.25], ["U", 60, 220, 1], ["PP", 220, 300, 1], ["sil", 300, Infinity, 1],
  ]);
});

test("lips close fully on p/b/m and every frame changes smoothly", () => {
  const segments = buildSegments(TOMB);
  const atClosure = mouthAt(segments, 240);
  assert.ok(atClosure.PP > 0.85 && (atClosure.U ?? 0) < 0.05, JSON.stringify(atClosure));
  let previous: Record<string, number> = {};
  for (let t = -150; t < 500; t += 1000 / 60) {
    const w = mouthAt(segments, t);
    const change = Object.keys({ ...w, ...previous }).reduce((sum, k) => sum + Math.abs((w[k] ?? 0) - (previous[k] ?? 0)), 0);
    assert.ok(change < 0.7, `snap of ${change.toFixed(2)} at ${t.toFixed(0)}ms`);
    previous = w;
  }
});

test("sh/ch/j uses the CH mouth shape", () => {
  assert.equal(buildSegments([{ id: 16, ms: 0 }])[0].viseme, "CH");
});

test("the newest streamed viseme holds until its successor arrives", () => {
  const first = buildSegments([{ id: 7, ms: 0 }]);
  assert.ok((mouthAt(first, 180).U ?? 0) > 0.7);
  const next = buildSegments([{ id: 7, ms: 0 }, { id: 21, ms: 240 }]);
  assert.ok((mouthAt(next, 250).PP ?? 0) > 0.85);
  assert.ok((mouthAt(next, 250).U ?? 0) < 0.1);
});

test("speaking while the voice sounds and through short pauses, not before or after", () => {
  const events = [{ id: 0, ms: 0 }, { id: 2, ms: 100 }, { id: 0, ms: 300 }, { id: 21, ms: 500 }, { id: 0, ms: 600 }];
  assert.equal(isSpeakingAt(events, 50), false); // leading silence
  assert.equal(isSpeakingAt(events, 150), true);
  assert.equal(isSpeakingAt(events, 450), true); // 150 ms pause
  assert.equal(isSpeakingAt(events, 1100), false); // 500 ms after the last sound
  assert.equal(isSpeakingAt([], 0), false);
});
