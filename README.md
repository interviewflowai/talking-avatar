<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://talking-avatar.dev/brand/talking-avatar-logo-dark.png" />
  <img src="https://talking-avatar.dev/brand/talking-avatar-logo-light.png" alt="Talking Avatar" width="280" />
</picture>

# Talking Avatar

[![npm](https://img.shields.io/npm/v/@interviewflowai/talking-avatar)](https://www.npmjs.com/package/@interviewflowai/talking-avatar)
[![license](https://img.shields.io/npm/l/@interviewflowai/talking-avatar)](LICENSE)
[![types](https://img.shields.io/npm/types/@interviewflowai/talking-avatar)](src/index.ts)

**Free, open-source talking avatars for the browser.** Give your voice agent a face: real-time lip sync for 3D
avatars from any audio, running entirely on your user's device. Two ready-made avatars, a woman and a man, are built
in, so it works the moment you install it. MIT licensed: the code, the trained model and the avatars.

**[Website](https://talking-avatar.dev) · [Live demo](https://talking-avatar.dev/demo/3d-avatar) ·
[Docs](https://docs.talking-avatar.dev/open-source/overview)**

```js
import { TalkingAvatar } from "@interviewflowai/talking-avatar";

const avatar = new TalkingAvatar({ container }); // the built-in female avatar
avatar.attachStream(voiceAgentAudio);            // or avatar.speak("/hello.mp3")
```

No account, no API key, no server, no text or phoneme timings: a small model listens to the audio in the browser
and drives the avatar's mouth.

## Contents

- [Open source](#open-source)
- [Features](#features)
- [Quick start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Best results](#best-results)
- [API reference](#api-reference)
- [Avatars](#avatars)
- [Self-hosting the model and avatars](#self-hosting-the-model-and-avatars)
- [How it works](#how-it-works)
- [Accuracy and limitations](#accuracy-and-limitations)
- [Performance](#performance)
- [Browser support](#browser-support)
- [Troubleshooting](#troubleshooting)
- [Model and training data](#model-and-training-data)
- [Want a photorealistic avatar?](#want-a-photorealistic-avatar)
- [FAQ](#faq)
- [Development](#development)
- [Contributing](#contributing)
- [Credits](#credits)
- [License](#license)

## Open source

Everything in this repository is free for any use, commercial included, under the [MIT License](LICENSE):

- **The SDK:** the `TalkingAvatar` class, the React component, the audio pipeline and the three.js renderer.
- **The lip-sync model:** the trained weights (`model/viseme-model.bin`, 1 MB) and the plain-JavaScript inference
  that runs them, checked frame by frame against the PyTorch reference in the tests.
- **Two 3D avatars,** female and male, from Microsoft's [Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox)
  library (MIT). See [Credits](#credits).

It's built to be owned, not rented:

- **Private by design.** Audio never leaves the page. The only network requests are the avatar and the model file,
  and both can be [served from your own site](#self-hosting-the-model-and-avatars).
- **No lock-in.** No account, no usage limits, no telemetry, no watermark. Fork it, change it, ship it.
- **Readable.** About 1,200 lines of TypeScript with no ML runtime and no WebAssembly; the model is a small causal
  convolutional network you can read in [`src/visemeModel.ts`](src/visemeModel.ts).
- **Open to contributions.** Issues and pull requests are welcome; see [Contributing](#contributing).

## Features

- **Two inputs, one line each:** `attachStream(mediaStream)` for live audio, `speak(url | ArrayBuffer | Blob)` for
  clips.
- **Works with any voice source:** OpenAI, ElevenLabs, Azure, Fish Audio, Cartesia or any other TTS, WebRTC voice
  agents, or a microphone. The model only listens to the audio.
- **Runs entirely in the browser.** Audio never leaves the page. No API key, no server, no ML runtime.
- **Avatars included:** a female and a male 3D avatar ship in the package and load by default, so there's nothing
  to model, rig or host to get started.
- **Small:** 10 KB gzipped of code plus a 1 MB model that's downloaded once. About 2% of one CPU core while speaking.
- **Anticipates sounds,** like a real speaker. Streams are delayed slightly so the mouth moves into each sound on
  time; clips are analysed in full before they play.
- **Or bring your own:** any `.glb` avatar with Oculus visemes, or map your own morph names. Framed as a face close-up (no arms or
  hands).
- **Natural blinks and brows** that follow what the avatar is doing: speaking, listening or thinking.
- **Framework-free core** plus a React component. TypeScript types included.

## Quick start

```sh
npm install @interviewflowai/talking-avatar three
```

```html
<div id="avatar" style="width: 640px; height: 360px"></div>
<button id="start">Start</button>
```

```js
import { AVATARS, TalkingAvatar } from "@interviewflowai/talking-avatar";

const avatar = new TalkingAvatar({
  container: document.getElementById("avatar"), // the built-in female avatar fills it
  // avatarUrl: AVATARS.male,                    // the built-in male one, or any .glb with Oculus visemes
});

document.getElementById("start").onclick = () => {
  avatar.speak("/hello.mp3");          // a clip…
  // avatar.attachStream(mediaStream); // …or live audio
};
```

The avatar plays the audio itself, in sync with its mouth. Don't play the same audio anywhere else.

Prefer to see it first? Try both avatars with your own voice or audio in the [live demo](https://talking-avatar.dev/demo/3d-avatar).

## Installation

```sh
npm install @interviewflowai/talking-avatar three
# or
pnpm add @interviewflowai/talking-avatar three
# or
yarn add @interviewflowai/talking-avatar three
```

`three` (≥ 0.160) is needed for the 3D avatars. React (≥ 18) is only needed for the React component. The package is
ESM-only.

**Without a bundler,** use an import map:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
      "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
      "@interviewflowai/talking-avatar": "https://cdn.jsdelivr.net/npm/@interviewflowai/talking-avatar@0.3.0/dist/index.js"
    }
  }
</script>
<script type="module">
  import { TalkingAvatar } from "@interviewflowai/talking-avatar";
</script>
```

## Usage

### Live audio streams

`attachStream` takes any `MediaStream` with an audio track: a WebRTC remote stream, `getUserMedia`, or
`element.captureStream()`.

```js
await avatar.attachStream(stream); // plays it and lip syncs it
avatar.detachStream();             // stop
```

The stream plays `streamDelayMs` (default 150 ms) late. The model hears each sound that long before the listener
does, so the mouth can move into it on time. Lower it for less latency at the cost of rougher lip sync:

```js
new TalkingAvatar({ container, streamDelayMs: 80 });
```

Attaching a new stream replaces the previous one.

### Audio clips

`speak` takes a URL, an `ArrayBuffer` or a `Blob`, in any format the browser can decode (MP3, WAV, Ogg, AAC…).
The clip is analysed in full before it starts (roughly 1% of its duration), then played with no added delay.

```js
await avatar.speak("/greeting.mp3");          // resolves when the clip ends or is stopped
await avatar.speak(await ttsResponse.blob()); // e.g. straight from a TTS API
avatar.stopSpeaking();
```

Calling `speak` again stops the current clip.

### React

```jsx
import { useRef } from "react";
import { TalkingAvatarView } from "@interviewflowai/talking-avatar/react";

export function Agent({ stream }) {
  const avatar = useRef(null); // the TalkingAvatar instance

  return (
    <div style={{ width: 640, height: 360 }}>
      <TalkingAvatarView ref={avatar} stream={stream} /> {/* avatarUrl={AVATARS.male} for the male avatar */}
      <button onClick={() => avatar.current?.speak("/hello.mp3")}>Say hello</button>
    </div>
  );
}
```

Passing `stream={null}` detaches the stream. Changing `avatarUrl` swaps the avatar without recreating anything.

<a id="voice-agents"></a>

### Voice agents: OpenAI Realtime, LiveKit, Daily

Give the agent's incoming audio to `attachStream` **instead of** playing it in an `<audio>` element.

**OpenAI Realtime API (WebRTC)**

```js
const pc = new RTCPeerConnection();
pc.ontrack = (event) => avatar.attachStream(event.streams[0]);
```

**LiveKit** (`livekit-client`, e.g. with LiveKit Agents)

```js
import { RoomEvent, Track } from "livekit-client";

room.on(RoomEvent.TrackSubscribed, (track) => {
  if (track.kind === Track.Kind.Audio) {
    avatar.attachStream(new MediaStream([track.mediaStreamTrack])); // don't call track.attach()
  }
});
```

**Daily** (`@daily-co/daily-js`, e.g. with Pipecat)

```js
call.on("track-started", ({ track, participant }) => {
  if (track.kind === "audio" && !participant?.local) avatar.attachStream(new MediaStream([track]));
});
```

**Any other WebRTC stack:** find the remote audio `MediaStreamTrack` and pass `new MediaStream([track])`.

### Changing the avatar

```js
import { AVATARS } from "@interviewflowai/talking-avatar";

await avatar.setAvatar(AVATARS.male);                        // the built-in male avatar
await avatar.setAvatar("https://example.com/my-avatar.glb"); // or your own
```

### Listening and thinking

The avatar knows when it's speaking from its own audio. In between, it looks like it's listening: attentive brows
and a relaxed blink rate. While your agent is working on a reply, show it thinking:

```js
avatar.setStatus("thinking");  // e.g. after the user stops talking
avatar.setStatus("listening"); // back to the default
```

### Cleaning up

```js
avatar.dispose(); // releases the canvas, WebGL resources and audio; the instance can't be reused
```

The React component disposes itself on unmount.

### Autoplay

Browsers only allow sound after the user has interacted with the page. Call `attachStream` or `speak` from a
click (or after one). Otherwise the audio, and with it the lip sync, stays silent.

## Best results

> **Use TTS voices for the best lip sync.** The model was trained on clean, clearly articulated read speech
> (LibriTTS-R), which is what TTS engines produce. Synthetic voices from OpenAI, ElevenLabs, Azure, Fish Audio
> and similar work best. Real people's voices also work, for example from a microphone, but with background
> noise, echo or unclear speech the lip sync is less accurate and less reliable.

## API reference

### `new TalkingAvatar(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `container` | `HTMLElement` | required | Element the avatar fills. It needs a size; the canvas follows it. |
| `avatarUrl` | `string` | `AVATARS.female` | A built-in avatar (`AVATARS.female`, `AVATARS.male`) or your own `.glb`. See [Avatars](#avatars). |
| `morphTargets` | `Record<string, string \| string[]>` | — | Your avatar's morph names, if they aren't the standard ones. See [Other morph names](#other-morph-names). |
| `modelUrl` | `string` | `DEFAULT_MODEL_URL` | Where to load `viseme-model.bin` from. See [Self-hosting](#self-hosting-the-model-and-avatars). |
| `streamDelayMs` | `number` | `150` | Delay before an attached stream plays. Lower = less latency, rougher lip sync. |
| `onError` | `(error: Error) => void` | `console.error` | Errors from background work (avatar loading, stream analysis). |

### Instance

| Member | Returns | Description |
|---|---|---|
| `ready` | `Promise<void>` | Resolves when the first avatar is on screen; rejects if it fails to load. |
| `setAvatar(url, morphTargets?)` | `Promise<void>` | Load a different avatar. Resolves when it's on screen. |
| `attachStream(stream)` | `Promise<void>` | Play and lip sync a `MediaStream`. Replaces any attached stream. Rejects if it has no audio track. |
| `detachStream()` | `void` | Stop the attached stream. |
| `speak(audio)` | `Promise<void>` | Play and lip sync a clip (`string` URL, `ArrayBuffer` or `Blob`). Resolves when it ends or is stopped. |
| `stopSpeaking()` | `void` | Stop the current clip. |
| `setStatus(status)` | `void` | Behaviour while not speaking: `"listening"` (default) or `"thinking"`. Speaking is detected from the audio. |
| `dispose()` | `void` | Release everything. |

### `AVATARS`

`{ female: string, male: string }`: this package version's copies of the built-in avatars on jsDelivr.

### `DEFAULT_MODEL_URL`

`string`: this package version's copy of the model on jsDelivr.

### `<TalkingAvatarView>` (from `@interviewflowai/talking-avatar/react`)

| Prop | Type | Description |
|---|---|---|
| `avatarUrl` | `string` | Default `AVATARS.female`. Changing it swaps the avatar. |
| `morphTargets` | `Record<string, string \| string[]>` | As above, applied with `avatarUrl`. |
| `stream` | `MediaStream \| null` | Live audio to play; `null` or `undefined` detaches. |
| `status` | `"listening" \| "thinking"` | Behaviour while not speaking. Default `"listening"`. |
| `modelUrl` | `string` | As above. Read on mount. |
| `streamDelayMs` | `number` | As above. Read on mount. |
| `onError` | `(error: Error) => void` | As above. |
| `className`, `style` | | Applied to the wrapper `div` (100% × 100% by default). |
| `ref` | `TalkingAvatar` | The instance, for `speak()` and the rest. |

## Avatars

### Built-in avatars

Two avatars ship in the package, ready to use:

| | Key | Source |
|---|---|---|
| Female (the default) | `AVATARS.female` | Microsoft Rocketbox "Business female 04" |
| Male | `AVATARS.male` | Microsoft Rocketbox "Business male 01" |

```js
import { AVATARS, TalkingAvatar } from "@interviewflowai/talking-avatar";

new TalkingAvatar({ container });                           // female
new TalkingAvatar({ container, avatarUrl: AVATARS.male });  // male
```

They're converted to `.glb` (meshopt-compressed, under 1 MB each) with their Oculus visemes and ARKit blend shapes
kept, and they're what the mouth mapping and materials are tuned on. They're MIT licensed by Microsoft; see
[Credits](#credits).

<a id="avatar-requirements"></a>

### Your own avatars

- **Format:** glTF binary (`.glb`). Meshopt-compressed models are supported.
- **Required:** the Oculus viseme morph targets `viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`,
  `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_I`,
  `viseme_O`, `viseme_U`. This is the standard Oculus/Meta lip-sync set that many avatar pipelines can export.
  Without them the mouth won't move (a console warning says so).
- **Optional:** ARKit `jawOpen`, `mouthFunnel`, `mouthPucker`, `mouthRollLower`, `mouthClose`, `mouthPressLeft`
  and `mouthPressRight` give rounder and firmer lips.
- **Hosting:** the avatar's server must allow cross-origin requests (CORS) from your site.

The mouth, blinks and brows are animated; nothing else moves. The camera frames the face in close-up (head and
neck, no arms or hands) with soft portrait lighting. The canvas is transparent, so style the container's background
as you like. The mouth mapping and the skin and eye materials are tuned for Microsoft Rocketbox avatars; other
avatars work, but may want different settings.

### Other morph names

If your avatar's mouth, blink or brow morphs have other names, map them with `morphTargets`. Keys are the standard
names above (`viseme_aa` … `viseme_U`, `eyeBlinkLeft`, `eyeBlinkRight`, `browInnerUp`, `jawOpen`, the ARKit mouth
names); values are your avatar's morph name or names. Unlisted names are used as they are, and `[]` turns one off.

```js
new TalkingAvatar({
  container,
  avatarUrl: "https://example.com/my-avatar.glb",
  morphTargets: {
    viseme_PP: ["LipsClosed"],
    viseme_aa: "MouthOpenWide",
    eyeBlinkLeft: "Blink_L",
    eyeBlinkRight: "Blink_R",
  },
});
```

Avatars whose morphs are named `h_expressions.<shape>_h` (for example `h_expressions.AE_AA_h`) are recognised and
mapped automatically.

<a id="self-hosting-the-model"></a>

## Self-hosting the model and avatars

The model (`viseme-model.bin`, 1 MB) and the built-in avatars ship in this package. By default they load from
jsDelivr, pinned to the installed version, and the browser caches them. For production, serving them yourself
removes the third-party dependency.

**Vite**

```js
import modelUrl from "@interviewflowai/talking-avatar/viseme-model.bin?url";
import avatarUrl from "@interviewflowai/talking-avatar/avatars/female.glb?url"; // or male.glb

new TalkingAvatar({ container, avatarUrl, modelUrl });
```

**Anything else:** copy `viseme-model.bin` and `avatars/` from `node_modules/@interviewflowai/talking-avatar/dist/`
to your static files, and pass their URLs as `modelUrl` and `avatarUrl`.

## How it works

```
audio ──► [resample 16 kHz] ──► [log-mel, 10 ms frames] ──► [causal conv net] ──► viseme IDs
                                                                                     │
avatar ◄── [morph targets, speed-limited] ◄── [coarticulation: smooth mouth weights] ◄┘
```

1. **Audio → visemes.** A ~260k-parameter causal convolutional network reads 80-band log-mel frames (16 kHz, 10 ms
   hop) and outputs one of 22 visemes every 10 ms, looking 20 ms ahead. It runs
   as plain JavaScript, with no WebAssembly or ML runtime. Streams are captured in an `AudioWorklet` and resampled
   on the fly; clips are analysed whole before they play.
2. **Visemes → mouth.** A new viseme must hold for 20 ms, so one-frame flickers are ignored. The timeline is shaped
   with JALI-style coarticulation (Edwards et al., SIGGRAPH 2016): tongue-only sounds borrow the lip shape of the
   neighbouring vowel, shapes ramp in ahead of their sound, and p/b/m always close the lips.
3. **Mouth → avatar.** Viseme weights drive the avatar's viseme morph targets, plus ARKit lip rounding, lip press and
   a little jaw when available, with a speed limit so shapes glide rather than snap.

## Accuracy and limitations

- On 39 speakers held out from training, with clean read speech passed through the Opus codec (as on a WebRTC
  call), the model picks the right mouth shape for **82%** of 10 ms frames and closes the lips on **99%** of p/b/m
  sounds. Noisy or unclear audio scores lower.
- **English-trained.** On Spanish, French, German, Portuguese, Hindi, Arabic, Japanese and Mandarin its timing holds
  up, but sounds English lacks are drawn with the nearest English mouth shape.
- **One audio source at a time** per avatar: attaching a stream replaces the previous one; a clip and a stream can
  overlap.
- **The avatar plays the audio.** It can't lip sync audio that's played somewhere else without also playing it.
- **Streams are delayed** by `streamDelayMs` (150 ms by default).
- **Only the face moves:** mouth, natural blinks and brows. No gaze or head motion.

## Performance

| | |
|---|---|
| Code | ~27 KB (10 KB gzipped), plus `three` |
| Model | 1 MB, downloaded once and cached |
| CPU | ~2% of one core while audio plays (measured on an Apple M5 Pro; plan 2–3× on low-end laptops) |
| Clip analysis | ~1% of the clip's duration, in 1-second chunks that yield to the page |
| Added latency | `streamDelayMs` for streams (default 150 ms); ~50 ms scheduling margin for clips |

## Browser support

Needs WebGL 2 and Web Audio with `AudioWorklet`, which current Chrome, Edge, Firefox and Safari provide.

**Content-Security-Policy:** the audio capture worklet is loaded from a `blob:` URL, so `script-src` must allow
`blob:`. The avatar and the model (`modelUrl`, jsDelivr by default) are fetched, so `connect-src` must allow both.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No sound and the mouth doesn't move | The browser blocked audio before any user interaction | Call `attachStream`/`speak` from a click |
| The voice is heard twice | The audio is also played elsewhere (e.g. `track.attach()` or an `<audio>` element) | Only give it to the avatar |
| The avatar doesn't appear | Container has no size, the URL isn't a `.glb`, or CORS blocks it | Size the container; check the network tab |
| The avatar appears but the mouth never moves | The model has no `viseme_*` morph targets (see console warning) | Use an avatar with Oculus visemes |
| `viseme model … HTTP 4xx` | `modelUrl` is wrong, or jsDelivr is blocked | Self-host the model |
| CSP error mentioning `blob:` | `script-src` doesn't allow `blob:` | Add `blob:` to `script-src` |
| Lips look late | `streamDelayMs` too low for this device | Raise `streamDelayMs` |
| Lip sync is poor | Noisy or unclear audio | See [Best results](#best-results) |

## Model and training data

The model was trained on [LibriTTS-R](https://www.openslr.org/141/) (Koizumi et al., Interspeech 2023), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and derived from LibriTTS and LibriSpeech. Phoneme
timings came from the [Montreal Forced Aligner](https://montreal-forced-aligner.readthedocs.io/) (McAuliffe et al.,
Interspeech 2017) and were mapped to visemes. The training data itself is not redistributed here.

## Want a photorealistic avatar?

This package is, and stays, free and open source. If you'd rather have a photorealistic person than a 3D one,
[Realistic Avatars](https://talking-avatar.dev) are the hosted option from the same team: real-looking people with
natural expressions and head motion, streamed to your page over WebRTC (or into your LiveKit room) from your agent's
voice. They're a paid service, $0.02 per minute, with their own SDK,
[`@talkingavatar/sdk`](https://www.npmjs.com/package/@talkingavatar/sdk). See the
[docs](https://docs.talking-avatar.dev/realistic-avatars/overview).

## FAQ

**Is it really free?** Yes. The SDK, the model and the built-in avatars are MIT licensed: free for any use,
commercial included, with no account, usage limit or watermark.

**Do I need my own 3D avatar?** No. A female and a male avatar are built in, and the female one loads by default.
Bring your own `.glb` whenever you like.

**Does it need the text or the TTS provider's viseme events?** No. It follows the audio alone, so it works with any
provider and any voice.

**Is any audio sent to a server?** No: everything runs in the browser, and the only network requests are the avatar
and the model file, which you can [host yourself](#self-hosting-the-model-and-avatars).

**Which languages work?** The model is trained on English and holds up reasonably on other languages tested; see
[Accuracy and limitations](#accuracy-and-limitations).

**Which 3D avatars work?** The built-in ones, and any `.glb` with Oculus viseme morph targets, or other morph names
mapped with `morphTargets`.

**Where are the server and live-avatar APIs (`/server`, `/live`)?** Up to 0.2.0 this package also held the client for
the paid Realistic Avatars. From 0.3.0 that lives in its own package,
[`@talkingavatar/sdk`](https://www.npmjs.com/package/@talkingavatar/sdk), with the same
API: change the imports to `@talkingavatar/sdk/server` and `/live`.

## Development

```sh
npm install
npm test           # model parity with the PyTorch reference, resampler, viseme timing, coarticulation
npm run typecheck
npm run build      # dist/: ESM bundles, type declarations, viseme-model.bin, avatars/
```

```
src/
  TalkingAvatar.ts    public class: audio playback, capture and timing
  react.tsx           React component
  renderer.ts         three.js scene, framing, viseme → morph targets
  visemeModel.ts      the model: log-mel features + causal conv net, plain JS
  visemeDetector.ts   audio at any rate → timed viseme events
  resampler.ts        streaming windowed-sinc resampler
  coarticulation.ts   viseme events → smooth mouth weights
model/                viseme-model.bin
avatars/              the built-in female.glb and male.glb, with their license
test/                 node:test suites and fixtures
```

## Contributing

Issues and pull requests are welcome: bug reports with a recording, new avatar pipelines that export Oculus visemes,
browser fixes, docs. See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are listed in
[CHANGELOG.md](CHANGELOG.md), and security issues should be reported as described in [SECURITY.md](SECURITY.md).

## Credits

- **3D avatars:** the built-in female and male avatars are from the
  [Microsoft Rocketbox avatar library](https://github.com/microsoft/Microsoft-Rocketbox), Copyright (c) 2020
  Microsoft, used and redistributed under the MIT License (full text in [`avatars/LICENSE`](avatars/LICENSE)). Thank
  you to Microsoft Research and the Rocketbox team for releasing them. If you use them in research, please cite
  Gonzalez-Franco et al., "The Rocketbox Library and the Utility of Freely Available Rigged Avatars", *Frontiers in
  Virtual Reality*, 2020.
- **Training data:** [LibriTTS-R](https://www.openslr.org/141/) (Koizumi et al., Interspeech 2023, CC BY 4.0).
- **Alignment:** [Montreal Forced Aligner](https://montreal-forced-aligner.readthedocs.io/) (McAuliffe et al.,
  Interspeech 2017).
- **Coarticulation:** after JALI (Edwards et al., SIGGRAPH 2016).
- **Rendering:** [three.js](https://threejs.org).

### Supported by

Talking Avatar is supported by [AWS Activate](https://aws.amazon.com/startups/),
[Cloudflare for Startups](https://www.cloudflare.com/startups/), [PostHog](https://posthog.com),
[Microsoft for Startups](https://www.microsoft.com/en-us/startups), [AssemblyAI](https://www.assemblyai.com), and
[Google for Startups](https://startup.google.com).

## License

The SDK and the lip-sync model are [MIT](LICENSE) licensed, Copyright (c) 2026 InterviewFlowAI: free for any use,
commercial included. The built-in avatars are MIT licensed, Copyright (c) 2020 Microsoft
([`avatars/LICENSE`](avatars/LICENSE)).

Built and maintained by [InterviewFlowAI](https://interviewflowai.com).
