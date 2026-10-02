import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import type { MorphTargetMap } from "./renderer";
import { TalkingAvatar, type AvatarStatus } from "./TalkingAvatar";

export interface TalkingAvatarViewProps {
  /** A .glb avatar with Oculus viseme morph targets. Changing it swaps the avatar. */
  avatarUrl: string;
  /** See TalkingAvatarOptions.morphTargets. Applied with avatarUrl. */
  morphTargets?: MorphTargetMap;
  /** Live audio to play and lip sync (e.g. a WebRTC stream). Pass null/undefined to stop. */
  stream?: MediaStream | null;
  /** Behaviour while not speaking: "listening" (default) or "thinking". */
  status?: AvatarStatus;
  /** See TalkingAvatarOptions.modelUrl. Read on mount. */
  modelUrl?: string;
  /** See TalkingAvatarOptions.streamDelayMs. Read on mount. */
  streamDelayMs?: number;
  onError?: (error: Error) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * React wrapper around TalkingAvatar. The ref is the TalkingAvatar instance (null until mounted), for
 * `ref.current?.speak(url)`.
 */
export const TalkingAvatarView = forwardRef<TalkingAvatar | null, TalkingAvatarViewProps>(function TalkingAvatarView(
  { avatarUrl, morphTargets, stream, status = "listening", modelUrl, streamDelayMs, onError, className, style },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [avatar, setAvatar] = useState<TalkingAvatar | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const urlRef = useRef(avatarUrl);
  urlRef.current = avatarUrl;
  const morphRef = useRef(morphTargets);
  morphRef.current = morphTargets;
  const loadedUrl = useRef(avatarUrl);
  useImperativeHandle(ref, () => avatar as TalkingAvatar, [avatar]);

  useEffect(() => {
    const instance = new TalkingAvatar({
      container: containerRef.current!,
      avatarUrl: urlRef.current,
      morphTargets: morphRef.current,
      modelUrl,
      streamDelayMs,
      onError: (error) => (onErrorRef.current ? onErrorRef.current(error) : console.error(error)),
    });
    loadedUrl.current = urlRef.current;
    setAvatar(instance);
    return () => instance.dispose();
  }, [modelUrl, streamDelayMs]);

  useEffect(() => {
    if (!avatar || avatarUrl === loadedUrl.current) return;
    loadedUrl.current = avatarUrl;
    avatar.setAvatar(avatarUrl, morphRef.current).catch(() => {}); // reported through onError
  }, [avatar, avatarUrl]);

  useEffect(() => {
    avatar?.setStatus(status);
  }, [avatar, status]);

  useEffect(() => {
    if (!avatar) return;
    if (stream) avatar.attachStream(stream).catch((error: Error) => onErrorRef.current?.(error));
    else avatar.detachStream();
  }, [avatar, stream]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
});
