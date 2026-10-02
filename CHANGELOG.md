# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-10-02

### Changed

- Retrained viseme model: the "th" in *think* and *three* now shows the TH mouth shape (76% of test frames, up
  from 11%); overall shape accuracy 82.3% (was 81.7%).

### Fixed

- A p/b/m at the start of a word now closes the lips; it was dropped when the model heard it for only one frame.
- The first viseme event could be timed slightly before the audio started.

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
