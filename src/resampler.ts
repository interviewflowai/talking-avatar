// Streaming windowed-sinc resampler, any input rate → `outRate` (the model's 16 kHz). Output sample n sits at input
// position n * inRate / outRate, so timing is preserved exactly. Low-pass at 90% of the lower Nyquist, Blackman
// window, kernels precomputed for PHASES fractional positions.

const ZERO_CROSSINGS = 12; // per side; sets the filter length
const PHASES = 128;

export class Resampler {
  private readonly step: number; // input samples per output sample
  private readonly half: number; // taps per side, in input samples
  private readonly kernels: Float32Array[];
  private input: Float32Array;
  private pos: number; // next output position, in `input` samples

  constructor(inRate: number, outRate: number) {
    this.step = inRate / outRate;
    const cutoff = (0.9 * Math.min(inRate, outRate)) / 2 / inRate; // cycles per input sample
    this.half = Math.ceil(ZERO_CROSSINGS / (2 * cutoff));
    this.kernels = Array.from({ length: PHASES }, (_, p) => {
      const frac = p / PHASES;
      return Float32Array.from({ length: 2 * this.half }, (_, i) => {
        const d = i - this.half + 1 - frac; // distance from the output position, in input samples
        const x = 2 * cutoff * d;
        const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const w = 0.42 + 0.5 * Math.cos((Math.PI * d) / this.half) + 0.08 * Math.cos((2 * Math.PI * d) / this.half);
        return 2 * cutoff * sinc * w;
      });
    });
    this.input = new Float32Array(this.half - 1); // zero history so output 0 lines up with input 0
    this.pos = this.half - 1;
  }

  push(samples: Float32Array): Float32Array {
    const input = new Float32Array(this.input.length + samples.length);
    input.set(this.input);
    input.set(samples, this.input.length);
    const out: number[] = [];
    const { half } = this;
    for (;;) {
      let base = Math.floor(this.pos);
      let phase = Math.round((this.pos - base) * PHASES);
      if (phase === PHASES) {
        base += 1;
        phase = 0;
      }
      if (base + half >= input.length) break;
      const kernel = this.kernels[phase];
      let sum = 0;
      for (let i = 0; i < kernel.length; i += 1) sum += kernel[i] * input[base - half + 1 + i];
      out.push(sum);
      this.pos += this.step;
    }
    const keep = Math.max(0, Math.floor(this.pos) - half + 1); // oldest sample the next output needs
    this.input = input.slice(keep);
    this.pos -= keep;
    return Float32Array.from(out);
  }
}
