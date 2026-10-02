import { Resampler } from "./resampler";
import { VisemeStream, type VisemeModel } from "./visemeModel";

export type VisemeEvent = { id: number; ms: number };

// A new viseme must hold this many 10 ms frames before it is reported (then backdated to its first frame), so
// one-frame misclassifications don't make the mouth twitch.
const MIN_RUN_FRAMES = 2;
// Except a p/b/m right after silence: its closure is silent, so the model only hears the release, often for one frame.
const SILENCE = 0;
const PP = 21;

/** Audio at any sample rate in, viseme changes out, timed from `startMs` (the time of the first sample pushed). */
export class VisemeDetector {
  private readonly resampler: Resampler;
  private readonly stream: VisemeStream;
  private frames = 0;
  private last = -1;
  private candidate = -1;
  private candidateRun = 0;

  constructor(
    private readonly model: VisemeModel,
    private readonly inRate: number,
    private readonly startMs: number,
    private readonly onViseme: (event: VisemeEvent) => void,
  ) {
    this.resampler = new Resampler(inRate, model.SR);
    this.stream = new VisemeStream(model);
  }

  push(samples: Float32Array): void {
    this.stream.push(this.resampler.push(samples), (viseme) => this.onFrame(viseme));
  }

  /** Push silence through so the last sounds (held back by the model's lookahead) are reported. */
  flush(): void {
    const { lookahead, HOP, WIN, SR } = this.model;
    this.push(new Float32Array(Math.ceil((((lookahead + MIN_RUN_FRAMES) * HOP + WIN) * this.inRate) / SR) + 64));
  }

  private onFrame(viseme: number): void {
    this.frames += 1;
    if (this.frames <= this.model.lookahead) return; // these outputs describe frames before the audio started
    this.candidateRun = viseme === this.candidate ? this.candidateRun + 1 : 1;
    this.candidate = viseme;
    if (viseme === this.last) return;
    if (this.candidateRun < MIN_RUN_FRAMES && !(viseme === PP && this.last === SILENCE)) return;
    this.last = viseme;
    // Output n describes frame n - lookahead; report the centre of the run's first frame.
    const { lookahead, HOP, WIN, SR } = this.model;
    const first = this.frames - this.candidateRun;
    this.onViseme({ id: viseme, ms: this.startMs + (((first - lookahead) * HOP + WIN / 2) / SR) * 1000 });
  }
}
