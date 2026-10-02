import assert from "node:assert/strict";
import { test } from "node:test";
import { VisemeStream } from "../src/visemeModel.ts";
import { model, parityAudio, parityVisemes } from "./helpers.ts";

test("streaming inference picks the same viseme as PyTorch on every frame", () => {
  const got: number[] = [];
  const stream = new VisemeStream(model);
  for (let i = 0; i < parityAudio.length; i += 997) stream.push(parityAudio.subarray(i, i + 997), (v) => got.push(v));
  assert.deepEqual(got, parityVisemes);
});
