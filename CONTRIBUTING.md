# Contributing

Thanks for helping improve `@interviewflowai/talking-avatar`.

## Setup

```sh
git clone <this repository>
cd talking-avatar
npm install
npm test
```

The live demo is at https://talking-avatar.dev/demo.

Node 20 or newer.

## Before opening a pull request

```sh
npm run typecheck
npm test
npm run build
```

CI runs the same checks on Node 20, 22 and 24.

## Guidelines

- **Keep the public API small.** New options or methods need a clear use case; describe it in the PR.
- **Only the face moves:** mouth, blinks and brows. The SDK deliberately doesn't add gaze or head motion.
- **The model must match its reference.** `src/visemeModel.ts` is checked frame by frame against PyTorch output
  (`test/visemeModel.test.ts`). If you change the feature pipeline or inference, that test must still pass.
- **Lip-sync changes need evidence.** Changes to timing, coarticulation or the mouth mapping should say how they
  were checked: test results, plus a before/after recording on an avatar.
- **Tests:** add or update a `test/*.test.ts` for logic changes (Node's built-in test runner, run with `tsx`).
- **Docs:** update `README.md` for any user-visible change, and add an entry under "Unreleased" in `CHANGELOG.md`.

## Licensing of contributions

The project is licensed under the MIT License. By opening a pull request, you agree that your contribution is
licensed under it too.

## Reporting bugs

Open an issue with the browser and version, the avatar URL (or how it was made), the audio source (TTS provider,
WebRTC stack, microphone) and what you expected to see. A short screen recording helps a lot with lip-sync issues.

For security issues, see [SECURITY.md](SECURITY.md) instead.
