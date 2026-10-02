# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-02

### Added

- Licensed under the PolyForm Noncommercial License 1.0.0: free for personal and non-commercial use; commercial
  licences from InterviewFlowAI.
- `TalkingAvatar`: loads a `.glb` avatar and lip syncs it to live audio (`attachStream`) or clips (`speak`), playing
  the audio itself.
- In-browser audio-to-viseme model (~260k parameters, 1 MB), trained on LibriTTS-R.
- JALI-style coarticulation from viseme events to mouth weights.
- Natural blinks and brows that follow speaking, listening and thinking; `setStatus("listening" | "thinking")`.
- `morphTargets` option for avatars with other morph names; avatars named `h_expressions.*_h` are mapped
  automatically.
- `TalkingAvatarView` React component (`@interviewflowai/talking-avatar/react`).
- Demo app (`npm run demo`).
