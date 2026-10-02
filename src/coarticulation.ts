// Viseme timeline (the model's viseme IDs, below) → smooth mouth weights, using JALI's procedural
// coarticulation rules
// (Edwards et al., "JALI: An Animator-Centric Viseme Model for Expressive Lip Synchronization", SIGGRAPH 2016):
// - tongue-only sounds (l t d n k g ng, h) don't shape the lips: they wear the neighbouring vowel's lip shape
//   (looking ahead, unless a pause or lip closure is in the way) with the jaw narrowed, so syllables stay visible;
// - repeated visemes are one long viseme (one smooth arc);
// - each viseme ramps in before its sound, peaks as the sound starts, holds to 70% of it, then ramps out;
//   lip-heavy sounds (oo/w, o, sh/ch) ramp longer; overlapping visemes blend as a weighted average;
// - bilabials (p b m) and labiodentals (f v) close the lips, overriding everything around them.

/**
 * The model's 22 viseme IDs and the sounds they cover (English phonemes, IPA):
 *   0 silence   1 æ ə ʌ   2 ɑ   3 ɔ   4 ɛ ʊ eɪ   5 ɝ   6 j i ɪ   7 w u   8 oʊ   9 aʊ   10 ɔɪ   11 aɪ
 *   12 h   13 ɹ   14 l   15 s z   16 ʃ tʃ dʒ ʒ   17 ð   18 f v   19 t d n θ   20 k g ŋ   21 p b m
 * Mapped here to Oculus visemes (the avatar's morph targets). 11 (aɪ, as in "I", "my") uses aa: the diphthong
 * starts wide open.
 */
const VISEME_TO_OCULUS = [
  "sil", "aa", "aa", "O", "E", "E", "I", "U", "O", "aa", "O", "aa", "kk", "RR", "nn", "SS", "CH", "TH", "FF", "DD",
  "kk", "PP",
];
/** IDs 12 h, 14 l, 19 t d n, 20 k g ng. */
const TONGUE_ONLY_IDS = new Set([12, 14, 19, 20]);
/** IDs 7 w/oo, 8 oh, 10 oy, 16 sh/ch/j/zh. */
const LIP_HEAVY_IDS = new Set([7, 8, 10, 16]);
const CLOSURES = new Set(["PP", "FF"]);

// Timing (ms) and levels.
const ONSET_MS = 80;
const LIP_HEAVY_ONSET_MS = 95;
const HOLD_FRACTION = 0.7;
const LOOK_MS = 250; // how far a tongue-only sound looks for a vowel to borrow its lip shape from
const NARROW_JAW = 0.25; // openness of a tongue-only sound wearing its neighbour's lip shape
const VISEME_LEVEL = 0.78; // the avatars read clearly below full morph travel
const CLOSURE_LEVEL = 0.9;

export type Segment = { viseme: string; start: number; end: number; lipHeavy: boolean; level: number };

/** Build viseme segments from (viseme ID, ms) events in audio order. */
export function buildSegments(events: { id: number; ms: number }[]): Segment[] {
  const items = events.map(({ id, ms }) => ({
    viseme: VISEME_TO_OCULUS[id] ?? "sil",
    ms,
    tongue: TONGUE_ONLY_IDS.has(id),
    lipHeavy: LIP_HEAVY_IDS.has(id),
    level: 1,
  }));
  const blocks = (i: number) => items[i].viseme === "sil" || CLOSURES.has(items[i].viseme);
  items.forEach((item, i) => {
    if (!item.tongue) return;
    let source: number | null = null;
    for (let j = i + 1; j < items.length && items[j].ms - item.ms <= LOOK_MS && !blocks(j); j += 1) {
      if (!items[j].tongue) { source = j; break; }
    }
    for (let j = i - 1; source === null && j >= 0 && item.ms - items[j].ms <= LOOK_MS && !blocks(j); j -= 1) {
      if (!items[j].tongue) source = j;
    }
    if (source !== null) {
      item.viseme = items[source].viseme;
      item.lipHeavy = items[source].lipHeavy;
      item.level = NARROW_JAW;
    }
  });

  const segments: Segment[] = [];
  items.forEach((item, i) => {
    // The next event determines the duration; guessing 100 ms made streamed speech dip to neutral.
    const end = items[i + 1]?.ms ?? Number.POSITIVE_INFINITY;
    const last = segments[segments.length - 1];
    if (last && last.viseme === item.viseme && last.level === item.level) {
      last.end = end;
      last.lipHeavy ||= item.lipHeavy;
    } else {
      segments.push({ viseme: item.viseme, start: item.ms, end, lipHeavy: item.lipHeavy, level: item.level });
    }
  });
  return segments;
}

const smoothstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** How strongly a segment is articulated at `t` (0–1). */
function activation(segment: Segment, t: number): number {
  const ramp = segment.lipHeavy ? LIP_HEAVY_ONSET_MS : ONSET_MS;
  const holdEnd = segment.start + HOLD_FRACTION * (segment.end - segment.start);
  if (t < segment.start) return smoothstep((t - (segment.start - ramp)) / ramp);
  if (t <= holdEnd) return 1;
  return smoothstep(1 - (t - holdEnd) / ramp);
}

/** Oculus viseme weights (names without `viseme_`) at `t` ms into the utterance audio. */
export function mouthAt(segments: Segment[], t: number): Record<string, number> {
  const weights: Record<string, number> = {};
  let total = 0;
  let closure = 0;
  const active: [Segment, number][] = [];
  for (const segment of segments) {
    if (segment.start - LIP_HEAVY_ONSET_MS > t) break;
    const a = activation(segment, t);
    if (a <= 0) continue;
    if (CLOSURES.has(segment.viseme)) {
      weights[segment.viseme] = Math.max(weights[segment.viseme] ?? 0, a * CLOSURE_LEVEL);
      closure = Math.max(closure, a);
    } else {
      active.push([segment, a]);
      total += a;
    }
  }
  // Weighted average of the overlapping shapes (silence pulls toward rest), faded out by any lip closure.
  const scale = (1 - closure) / Math.max(1, total);
  for (const [segment, a] of active) {
    if (segment.viseme === "sil") continue;
    weights[segment.viseme] = (weights[segment.viseme] ?? 0) + a * segment.level * VISEME_LEVEL * scale;
  }
  return weights;
}

const SPEAKING_HOLD_MS = 400; // a pause shorter than this still counts as speaking

/** Whether the voice is sounding at `t` (or paused for less than SPEAKING_HOLD_MS), from time-ordered events. */
export function isSpeakingAt(events: { id: number; ms: number }[], t: number): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].ms > t) continue;
    if (events[i].id !== 0) return true;
    return i > 0 && t - events[i].ms < SPEAKING_HOLD_MS;
  }
  return false;
}
