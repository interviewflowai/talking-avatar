<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://talking-avatar.dev/brand/talking-avatar-logo-dark.png" />
  <img src="https://talking-avatar.dev/brand/talking-avatar-logo-light.png" alt="Talking Avatar" width="280" />
</picture>

# Talking Avatar

[![npm](https://img.shields.io/npm/v/@interviewflowai/talking-avatar)](https://www.npmjs.com/package/@interviewflowai/talking-avatar)
[![license](https://img.shields.io/npm/l/@interviewflowai/talking-avatar)](LICENSE)
[![types](https://img.shields.io/npm/types/@interviewflowai/talking-avatar)](src/index.ts)

**Give your voice agent a face.** Talking Avatar turns any voice, from any text-to-speech engine or voice agent, into
a lifelike talking avatar on your page, in real time.

**[Website](https://talking-avatar.dev) · [Live demo](https://talking-avatar.dev/demo) ·
[Create an account](https://app.talking-avatar.dev)**

| | **Realistic Avatars** | **Open-source 3D lip sync** |
|---|---|---|
| What you get | Photorealistic people with natural expressions and head motion | Your own 3D `.glb` avatars, lip synced in the browser |
| Price | **$0.02 per minute**, pay as you go | **Free** (MIT) |
| Runs | Fully managed: streamed to your page in real time | In your user's browser, no server |
| Setup | Create an account, add credits, get an API key | `npm install`, nothing else |
| Get started | [Realistic Avatars](#realistic-avatars) | [Open-source 3D lip sync](#open-source-3d-lip-sync) |

Both ship in one package, [`@interviewflowai/talking-avatar`](https://www.npmjs.com/package/@interviewflowai/talking-avatar).

## Contents

- [Realistic Avatars](#realistic-avatars)
  - [See them talk](#see-them-talk)
  - [Pricing](#pricing)
  - [Get started](#get-started)
  - [Your server](#your-server)
  - [Your page](#your-page)
  - [LiveKit](#livekit)
  - [Avatars](#realistic-avatar-catalogue)
  - [Sessions and errors](#sessions-and-errors)
  - [API reference](#realistic-avatars-api-reference)
- [Open-source 3D lip sync](#open-source-3d-lip-sync)
  - [Features](#features)
  - [Quick start](#quick-start)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Best results](#best-results)
  - [API reference](#api-reference)
  - [Avatars](#avatars)
  - [Self-hosting the model](#self-hosting-the-model)
  - [How it works](#how-it-works)
  - [Accuracy and limitations](#accuracy-and-limitations)
  - [Performance](#performance)
  - [Browser support](#browser-support)
  - [Troubleshooting](#troubleshooting)
  - [Model and training data](#model-and-training-data)
- [FAQ](#faq)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

# Realistic Avatars

Photorealistic talking avatars for voice agents, AI interviewers, tutors, support and sales assistants. Send your
agent's voice as it's generated; your users see a real-looking person say it, with accurate lip sync, natural
expressions and subtle head motion, streamed to your page in real time.

- **Any voice:** OpenAI, ElevenLabs, Azure, Fish Audio, Cartesia, or any other TTS or speech-to-speech model. The
  avatar follows the audio, so no text or timings are needed.
- **Real time:** speech appears on the avatar's lips moments after you send it, ready for live conversation.
  Interruptions (barge-in) are handled in one call.
- **Voice and video in sync,** delivered together over WebRTC. No media servers to run.
- **Drop-in for LiveKit:** the avatar can join your LiveKit room as a participant instead.
- **A few lines of code** on your server and your page. The SDK handles streaming, playback and reconnection.

<a id="see-them-talk"></a>

## See them talk

Two avatars, each speaking an OpenAI TTS voice. Click to watch, with sound.

| Friendly host (`ava6`) | Friendly coach (`ava7`) |
|---|---|
| [![Friendly host, ava6: watch the demo](https://recordings.talking-avatar.dev/talking-avatar-ava6-poster.jpg)](https://recordings.talking-avatar.dev/talking-avatar-ava6-demo.mp4) | [![Friendly coach, ava7: watch the demo](https://recordings.talking-avatar.dev/talking-avatar-ava7-poster.jpg)](https://recordings.talking-avatar.dev/talking-avatar-ava7-demo.mp4) |
| [▶ Watch the demo (15 s)](https://recordings.talking-avatar.dev/talking-avatar-ava6-demo.mp4) | [▶ Watch the demo (15 s)](https://recordings.talking-avatar.dev/talking-avatar-ava7-demo.mp4) |

## Pricing

**$0.02 per minute** of avatar session, billed by the second. No subscription, no minimum, no setup fee.

1. [Create an account](https://app.talking-avatar.dev).
2. Add credits, and turn on auto top-up if you'd like your balance refilled automatically.
3. Create an API key and start building.

$10 of credits is 500 minutes of conversation. Usage and spend are shown live in the dashboard.

## Get started

```sh
npm install @interviewflowai/talking-avatar
```

The SDK has two parts, because your API key must stay on your server:

| Import | Runs on | Does |
|---|---|---|
| `@interviewflowai/talking-avatar/server` → `LiveAvatar` | your server (Node.js 22+) | starts the avatar, sends your agent's voice, handles interruptions |
| `@interviewflowai/talking-avatar/live` → `LiveAvatarView` | your page | shows the avatar with its voice, reconnects by itself |

<a id="your-server"></a>

### Your server

```js
import { LiveAvatar } from "@interviewflowai/talking-avatar/server";

const avatar = await LiveAvatar.start({
  apiKey: process.env.TALKING_AVATAR_API_KEY, // tav_…
  avatar: "ava6",
  sampleRate: 24000,                           // your TTS audio's sample rate
});

// One route for your page. It sets up the video connection; any number of viewers.
app.post("/avatar", async (req, res) => {
  try {
    res.json(await avatar.handleView(req.body));
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

// Your agent's voice as it streams: PCM16 mono, as an Int16Array, a Buffer or base64.
tts.on("audio", (pcm) => avatar.pushAudio(pcm));

// The user interrupted: stop speaking. Resolves with how much of the reply they heard.
const heardMs = await avatar.clear();

avatar.on("speechStarted", () => {});
avatar.on("speechEnded", (playedMs) => {});
avatar.close(); // end of the conversation: billing stops
```

The avatar plays the voice itself, in sync with its lips, so don't play your TTS audio anywhere else. Audio can
arrive faster than real time; it's queued and spoken at its natural pace.

<a id="your-page"></a>

### Your page

```js
import { LiveAvatarView } from "@interviewflowai/talking-avatar/live";

const view = new LiveAvatarView({
  container: document.getElementById("avatar"), // the video fills this element
  endpoint: "/avatar",                          // the route above
});

document.getElementById("start").onclick = () => view.connect(); // after a click, so the voice can play
```

Running several conversations at once? Keep one `LiveAvatar` per conversation and give each its own route, such as
`/avatar/:conversationId`.

<a id="livekit"></a>

### LiveKit

Already using LiveKit? The avatar can join your room instead, with its video and voice as tracks. Mint a
publish-only token for it; your LiveKit secrets stay with you.

```js
const avatar = await LiveAvatar.start({
  apiKey: process.env.TALKING_AVATAR_API_KEY,
  avatar: "ava6",
  livekit: { url: LIVEKIT_URL, token: avatarToken }, // video track "avatar", voice track "avatar-audio"
});
tts.on("audio", (pcm) => avatar.pushAudio(pcm));
```

Your LiveKit client plays the tracks, so `LiveAvatarView` isn't needed.

<a id="realistic-avatar-catalogue"></a>

### Avatars

| ID | Name | Style |
|---|---|---|
| `ava4` | Male interviewer: dark suit, office | Professional |
| `ava5` | Female interviewer: blazer, office | Professional |
| `ava6` | Friendly host: navy henley, home study | Casual |
| `ava7` | Friendly coach: knit cardigan, living room | Casual |

All avatars stream at 832×468 (16:9), 25 frames per second. `LiveAvatarView` fits the video inside its container
without cropping. More avatars are on the way; previews are in the dashboard.

### Sessions and errors

A session is billed from the moment the avatar is live until you call `close()` (or your server disconnects).
`LiveAvatar.start` rejects with a `LiveAvatarError` when a session can't start, and the `close` event reports why a
session ended:

| Code | Meaning |
|---|---|
| `1000` | You closed the session |
| `4001` | Invalid or missing API key |
| `4002` | Balance below one minute: add credits or turn on auto top-up |
| `4003` | The session reached its 3-hour limit |

<a id="realistic-avatars-api-reference"></a>

### API reference

#### `LiveAvatar.start(options)` (from `@interviewflowai/talking-avatar/server`)

Resolves with a `LiveAvatar` once the avatar is live.

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | required | Your `tav_…` key. Keep it on your server. |
| `avatar` | `string` | required | An avatar ID, such as `"ava6"`. |
| `sampleRate` | `8000 \| 12000 \| 16000 \| 24000 \| 48000` | `24000` | Your TTS audio's sample rate (PCM16 mono). |
| `livekit` | `{ url, token, publishAudio?, audioTrackName? }` | | Join your LiveKit room instead of streaming to `LiveAvatarView`. With `publishAudio: false` you play the voice yourself and pass `playAtMs` to `pushAudio`. |
| `WebSocket` | class | global `WebSocket` | For Node.js 18 and 20: `import WebSocket from "ws"`. |

| Member | Description |
|---|---|
| `pushAudio(pcm, { sampleRate?, playAtMs? })` | Queue your agent's voice: `Int16Array`, bytes (`Buffer`, `Uint8Array`, `ArrayBuffer`) or base64, in chunks of any size. |
| `clear()` | Interrupt. Resolves with how many ms of the interrupted reply were heard. |
| `handleView(body)` | Your page's route: pass the request body, return the result as JSON. |
| `on(event, listener)` | `speechStarted`, `speechEnded(playedMs)`, `republished` (recovered from a network drop; the page reconnects by itself), `close(code, reason)`. Returns an unsubscribe function. |
| `close()` | End the session. Billing stops. |
| `width`, `height` | The video size. |

#### `new LiveAvatarView(options)` (from `@interviewflowai/talking-avatar/live`)

| Option | Type | Default | Description |
|---|---|---|---|
| `container` | `HTMLElement` | required | Element the video fills, or your own `<video>`. |
| `endpoint` | `string \| (body) => Promise<object>` | required | Your route, or a function that calls it (for example, with auth headers). |
| `iceServers` | `RTCIceServer[]` | public STUN | Add your TURN server for users behind strict firewalls. |
| `onStatus` | `(status) => void` | | `connecting`, `live`, `muted` (the browser blocked sound: call `unmute()` from a click), `reconnecting`, `closed`. |
| `onError` | `(error) => void` | `console.warn` | Connection errors. It retries by itself. |

Methods: `connect()`, `disconnect()`, `unmute()`. Properties: `video` (the `<video>` element), `status`.

# Open-source 3D lip sync

Free and open source (MIT). Real-time lip sync for your own 3D avatars, from any audio. Give it an avatar URL and an
audio stream; a small model listens to the audio in the browser and drives the avatar's mouth. No text, no phoneme
timings, no TTS-provider visemes, no server, no API key.

```js
const avatar = new TalkingAvatar({ container, avatarUrl: "https://example.com/avatar.glb" });
avatar.attachStream(voiceAgentAudio);
```

## Features

- **Two inputs, one line each:** `attachStream(mediaStream)` for live audio, `speak(url | ArrayBuffer | Blob)` for
  clips.
- **Works with any voice source:** OpenAI, ElevenLabs, Azure, Fish Audio, Cartesia or any other TTS, WebRTC voice
  agents, or a microphone. The model only listens to the audio.
- **Runs entirely in the browser.** Audio never leaves the page. No API key, no server, no ML runtime.
- **Small:** 8 KB gzipped of code plus a 1 MB model that's downloaded once. About 2% of one CPU core while speaking.
- **Anticipates sounds,** like a real speaker. Streams are delayed slightly so the mouth moves into each sound on
  time; clips are analysed in full before they play.
- **Any `.glb` avatar with Oculus visemes,** or map your own morph names. Framed as a face close-up (no arms or
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
import { TalkingAvatar } from "@interviewflowai/talking-avatar";

const avatar = new TalkingAvatar({
  container: document.getElementById("avatar"),
  avatarUrl: "https://example.com/avatar.glb", // any .glb with Oculus visemes
});

document.getElementById("start").onclick = () => {
  avatar.speak("/hello.mp3");          // a clip…
  // avatar.attachStream(mediaStream); // …or live audio
};
```

The avatar plays the audio itself, in sync with its mouth. Don't play the same audio anywhere else.

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
      "@interviewflowai/talking-avatar": "https://cdn.jsdelivr.net/npm/@interviewflowai/talking-avatar@0.1.0/dist/index.js"
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
new TalkingAvatar({ container, avatarUrl, streamDelayMs: 80 });
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
      <TalkingAvatarView ref={avatar} avatarUrl="https://example.com/avatar.glb" stream={stream} />
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
await avatar.setAvatar("https://example.com/another-avatar.glb");
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
| `avatarUrl` | `string` | required | Your `.glb` avatar. See [Avatars](#avatars). |
| `morphTargets` | `Record<string, string \| string[]>` | — | Your avatar's morph names, if they aren't the standard ones. See [Other morph names](#other-morph-names). |
| `modelUrl` | `string` | `DEFAULT_MODEL_URL` | Where to load `viseme-model.bin` from. See [Self-hosting](#self-hosting-the-model). |
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

### `DEFAULT_MODEL_URL`

`string`: this package version's copy of the model on jsDelivr.

### `<TalkingAvatarView>` (from `@interviewflowai/talking-avatar/react`)

| Prop | Type | Description |
|---|---|---|
| `avatarUrl` | `string` | Changing it swaps the avatar. |
| `morphTargets` | `Record<string, string \| string[]>` | As above, applied with `avatarUrl`. |
| `stream` | `MediaStream \| null` | Live audio to play; `null` or `undefined` detaches. |
| `status` | `"listening" \| "thinking"` | Behaviour while not speaking. Default `"listening"`. |
| `modelUrl` | `string` | As above. Read on mount. |
| `streamDelayMs` | `number` | As above. Read on mount. |
| `onError` | `(error: Error) => void` | As above. |
| `className`, `style` | | Applied to the wrapper `div` (100% × 100% by default). |
| `ref` | `TalkingAvatar` | The instance, for `speak()` and the rest. |

## Avatars

<a id="avatar-requirements"></a>

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

## Self-hosting the model

`viseme-model.bin` (1 MB) ships in this package. By default it loads from jsDelivr, pinned to the installed version,
and the browser caches it. For production, serving it yourself removes the third-party dependency.

**Vite**

```js
import modelUrl from "@interviewflowai/talking-avatar/viseme-model.bin?url";

new TalkingAvatar({ container, avatarUrl, modelUrl });
```

**Anything else:** copy `node_modules/@interviewflowai/talking-avatar/dist/viseme-model.bin` to your static files and
pass its URL as `modelUrl`.

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
| Code | ~22 KB (8 KB gzipped), plus `three` |
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

# FAQ

**Which should I use?** Realistic Avatars when you want a photorealistic person with no 3D work, for $0.02 a minute.
The open-source lip sync when you have, or want, your own 3D avatars and prefer it free and fully in the browser.

**Do they need the text or the TTS provider's viseme events?** No. Both follow the audio alone, so they work with any
provider and any voice.

**Is any audio sent to a server?** With the open-source lip sync, no: everything runs in the browser, and the only
network requests are the avatar and the model file. Realistic Avatars receive your agent's voice to animate the
avatar; it isn't stored.

**Which languages work?** The open-source model is trained on English and holds up reasonably on other languages
tested; see [Accuracy and limitations](#accuracy-and-limitations).

**Which 3D avatars work?** Any `.glb` with Oculus viseme morph targets, or other morph names mapped with
`morphTargets`.

**Can I use it in a commercial product?** Yes. The SDK and the lip-sync model are MIT licensed. Realistic Avatars are
billed at $0.02 per minute of session.

**Is there a free option?** Yes: the [open-source 3D lip sync](#open-source-3d-lip-sync) is free for any use, with your
own 3D avatars, directly in the browser. Realistic Avatars are pay as you go with no minimum; one dollar of credits
is 50 minutes.

# Development

```sh
npm install
npm test           # model parity with the PyTorch reference, resampler, viseme timing, coarticulation, LiveAvatar
npm run typecheck
npm run build      # dist/: ESM bundles, type declarations, viseme-model.bin
```

```
src/
  TalkingAvatar.ts    public class: audio playback, capture and timing
  server.ts           LiveAvatar: Realistic Avatars, on your server
  live.ts             LiveAvatarView: Realistic Avatars, in the page
  react.tsx           React component
  renderer.ts         three.js scene, framing, viseme → morph targets
  visemeModel.ts      the model: log-mel features + causal conv net, plain JS
  visemeDetector.ts   audio at any rate → timed viseme events
  resampler.ts        streaming windowed-sinc resampler
  coarticulation.ts   viseme events → smooth mouth weights
model/                viseme-model.bin
test/                 node:test suites and fixtures
```

# Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are listed in
[CHANGELOG.md](CHANGELOG.md), and security issues should be reported as described in [SECURITY.md](SECURITY.md).

<a id="license"></a>

# License

The SDK and the lip-sync model are [MIT](LICENSE) licensed, Copyright (c) 2026 InterviewFlowAI: free for any use,
commercial included. Realistic Avatars are a paid service, billed per minute to your account.

Built and maintained by [InterviewFlowAI](https://interviewflowai.com).
