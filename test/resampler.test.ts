import assert from "node:assert/strict";
import { test } from "node:test";
import { Resampler } from "../src/resampler.ts";

const tone = (hz: number, rate: number, n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (x: Float32Array) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);

/** Resample one second in uneven chunks (as audio arrives) and skip the filter's start-up. */
function resample(input: Float32Array, inRate: number): Float32Array {
  const resampler = new Resampler(inRate, 16000);
  const parts: number[] = [];
  for (let i = 0; i < input.length; i += 997) parts.push(...resampler.push(input.subarray(i, i + 997)));
  return Float32Array.from(parts).subarray(200, -200);
}

for (const inRate of [48000, 44100, 24000, 16000]) {
  test(`${inRate} Hz: speech-band tones keep their timing and level`, () => {
    for (const hz of [200, 1000, 3000, 6000]) {
      const out = resample(tone(hz, inRate, inRate), inRate);
      const expected = tone(hz, 16000, out.length + 200).subarray(200);
      const err = rms(out.map((v, i) => v - expected[i]));
      assert.ok(err < 0.01, `${hz} Hz: error ${err}`);
    }
  });
}

for (const inRate of [48000, 44100, 24000]) {
  test(`${inRate} Hz: tones above the 8 kHz output Nyquist are filtered, not aliased`, () => {
    for (const hz of [9000, 11000]) {
      const out = resample(tone(hz, inRate, inRate), inRate);
      assert.ok(rms(out) < 0.01, `${hz} Hz leaks ${rms(out)}`);
    }
  });
}
