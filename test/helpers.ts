import { readFileSync } from "node:fs";
import { parseVisemeModel } from "../src/visemeModel.ts";

const bytes = (path: string) => {
  const buf = readFileSync(new URL(path, import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

export const model = parseVisemeModel(bytes("../model/viseme-model.bin"));
/** 3 s of TTS speech at 16 kHz, and PyTorch's viseme for each 10 ms model output. */
export const parityAudio = new Float32Array(bytes("./fixtures/parity-audio.f32"));
export const parityVisemes = Array.from(new Uint8Array(bytes("./fixtures/parity-visemes.u8")));
