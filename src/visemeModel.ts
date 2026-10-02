// Streaming audio → viseme model: 16 kHz samples in, one viseme ID (0–21, see coarticulation.ts) per 10 ms frame out.
// A ~260k-parameter causal conv net trained on LibriTTS-R with MFA alignments; plain loops, no ML runtime.
// test/visemeModel.test.ts checks it against the PyTorch reference frame by frame.

export type VisemeModel = {
  SR: number;
  WIN: number;
  HOP: number;
  NFFT: number;
  N_MELS: number;
  FMIN: number;
  FMAX: number;
  LOG_FLOOR: number;
  channels: number;
  kernel: number;
  dilations: number[];
  lookahead: number; // output frame t describes the audio of frame t - lookahead
  classes: number;
  tensors: Record<string, Float32Array>;
};

/** Parse model.bin: uint32 header length, JSON header, float32 tensors. */
export function parseVisemeModel(buffer: ArrayBuffer): VisemeModel {
  const headLen = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headLen)));
  const tensors: Record<string, Float32Array> = {};
  for (const { name, shape, offset } of header.tensors as { name: string; shape: number[]; offset: number }[]) {
    tensors[name] = new Float32Array(buffer, 4 + headLen + offset * 4, shape.reduce((a, b) => a * b, 1));
  }
  return { ...header, tensors };
}

function melFilterbank({ SR, NFFT, N_MELS, FMIN, FMAX }: VisemeModel): Float32Array {
  const toMel = (f: number) => 2595 * Math.log10(1 + f / 700);
  const toHz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  const step = (toMel(FMAX) - toMel(FMIN)) / (N_MELS + 1);
  const edges = Array.from({ length: N_MELS + 2 }, (_, i) => toHz(toMel(FMIN) + step * i));
  const bins = NFFT / 2 + 1;
  const fb = new Float32Array(N_MELS * bins);
  for (let m = 0; m < N_MELS; m += 1) {
    const [a, b, c] = [edges[m], edges[m + 1], edges[m + 2]];
    for (let k = 0; k < bins; k += 1) {
      const hz = (k * SR) / NFFT;
      fb[m * bins + k] = Math.max(0, Math.min((hz - a) / (b - a), (c - hz) / (c - b)));
    }
  }
  return fb;
}

/** In-place iterative radix-2 complex FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const half = len / 2;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k += 1) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const vr = re[i + k + half] * wr - im[i + k + half] * wi;
        const vi = re[i + k + half] * wi + im[i + k + half] * wr;
        re[i + k + half] = re[i + k] - vr;
        im[i + k + half] = im[i + k] - vi;
        re[i + k] += vr;
        im[i + k] += vi;
      }
    }
  }
}

/** y[o] += sum_i W[o, i, tap] * x[i]   (torch Conv1d weight layout: out, in, kernel) */
function matAdd(y: Float32Array, W: Float32Array, x: Float32Array, outs: number, ins: number, kernel: number, tap: number) {
  for (let o = 0; o < outs; o += 1) {
    let sum = 0;
    const row = o * ins * kernel + tap;
    for (let i = 0; i < ins; i += 1) sum += W[row + i * kernel] * x[i];
    y[o] += sum;
  }
}

export class VisemeStream {
  private readonly window: Float32Array;
  private readonly filters: Float32Array;
  private readonly frame: Float32Array; // ring of the last WIN samples
  private filled = 0;
  private sinceHop = 0;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly mel: Float32Array;
  private readonly history: Float32Array[][]; // per block: last (kernel-1)*dilation+1 inputs, zero-initialised
  private x: Float32Array;
  private y: Float32Array;
  private readonly logits: Float32Array;

  constructor(private readonly m: VisemeModel) {
    const { WIN, NFFT, N_MELS, channels, kernel, dilations, classes } = m;
    this.window = Float32Array.from({ length: WIN }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / WIN));
    this.filters = melFilterbank(m);
    this.frame = new Float32Array(WIN);
    this.re = new Float64Array(NFFT);
    this.im = new Float64Array(NFFT);
    this.mel = new Float32Array(N_MELS);
    this.history = dilations.map((d) => Array.from({ length: (kernel - 1) * d + 1 }, () => new Float32Array(channels)));
    this.x = new Float32Array(channels);
    this.y = new Float32Array(channels);
    this.logits = new Float32Array(classes);
  }

  /** Feed 16 kHz samples; calls onFrame(visemeId) once per completed 10 ms frame. */
  push(samples: Float32Array, onFrame: (viseme: number) => void): void {
    const { WIN, HOP } = this.m;
    for (const sample of samples) {
      this.frame.copyWithin(0, 1);
      this.frame[WIN - 1] = sample;
      this.filled = Math.min(WIN, this.filled + 1);
      this.sinceHop += 1;
      if (this.filled === WIN && this.sinceHop >= HOP) {
        this.sinceHop = 0;
        onFrame(this.step());
      }
    }
  }

  private step(): number {
    const { NFFT, N_MELS, LOG_FLOOR, channels, kernel, dilations, classes, tensors: t } = this.m;
    const { re, im, mel } = this;
    re.fill(0);
    im.fill(0);
    for (let n = 0; n < this.frame.length; n += 1) re[n] = this.frame[n] * this.window[n];
    fft(re, im);
    const bins = NFFT / 2 + 1;
    for (let m = 0; m < N_MELS; m += 1) {
      let sum = 0;
      for (let k = 0; k < bins; k += 1) sum += this.filters[m * bins + k] * (re[k] * re[k] + im[k] * im[k]);
      mel[m] = (Math.log(sum + LOG_FLOOR) - t.mean[m]) / t.std[m];
    }

    let { x, y } = this;
    x.set(t["inp.bias"]);
    matAdd(x, t["inp.weight"], mel, channels, N_MELS, 1, 0);
    dilations.forEach((d, l) => {
      const hist = this.history[l];
      hist.push(hist.shift()!); // oldest buffer becomes the newest slot
      hist[hist.length - 1].set(x);
      y.set(t[`blocks.${l}.bias`]);
      for (let k = 0; k < kernel; k += 1) {
        // tap k reads the input from (kernel-1-k)*d frames ago
        matAdd(y, t[`blocks.${l}.weight`], hist[hist.length - 1 - (kernel - 1 - k) * d], channels, channels, kernel, k);
      }
      for (let c = 0; c < channels; c += 1) y[c] = x[c] + Math.max(0, y[c]);
      [x, y] = [y, x];
    });
    [this.x, this.y] = [x, y];
    this.logits.set(t["out.bias"]);
    matAdd(this.logits, t["out.weight"], x, classes, channels, 1, 0);
    let best = 0;
    for (let c = 1; c < classes; c += 1) if (this.logits[c] > this.logits[best]) best = c;
    return best;
  }
}
