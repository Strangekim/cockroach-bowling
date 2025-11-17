import { useCallback, useEffect, useRef, useMemo } from 'react';
import type React from 'react';
import { Howl } from 'howler';
import {
  clampVolume,
  resumeHowlerContext,
  createHowlConfig,
  isAudioPlaying,
  setAudioVolume,
} from '../utils/audioUtils';
import { useVisibilityChange } from './useVisibilityChange';

interface AudioProps {
  src: string;
  loop?: boolean;
  volume?: number;
}

interface AudioControls {
  playAudio: () => Promise<void>;
  stopAudio: () => void;
  pause: () => void;
  fade: (from: number, to: number, duration: number) => void;
  audioRef: React.RefObject<Howl | null>;
}

export function useAudio({
  src,
  loop = false,
  volume = 1,
}: AudioProps): AudioControls {
  const howlRef = useRef<Howl | null>(null);
  const isInitializedRef = useRef(false);
  const wasPlayingRef = useRef(false);

  const howlConfig = useMemo(
    () =>
      createHowlConfig(
        src,
        loop,
        volume,
        (_id, error) => {
          console.error('Howl load error:', error);
        },
        (_id, error) => {
          console.error('Howl play error:', error);
        }
      ),
    [src, loop, volume]
  );

  useEffect(() => {
    if (isInitializedRef.current) return;

    const howl = new Howl(howlConfig);
    howlRef.current = howl;
    isInitializedRef.current = true;

    return () => {
      if (howlRef.current) {
        howlRef.current.stop();
        howlRef.current.unload();
        howlRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [howlConfig, volume]);

  useEffect(() => {
    setAudioVolume(howlRef.current, volume);
  }, [volume]);

  const playAudio = useCallback(async (): Promise<void> => {
    const howl = howlRef.current;
    if (howl === null) {
      console.warn('Audio not initialized');
      return;
    }

    try {
      setAudioVolume(howl, volume);
      howl.play();
      wasPlayingRef.current = true;
    } catch (error) {
      console.warn('Howl play failed:', error);
    }
  }, [volume]);

  const stopAudio = useCallback((): void => {
    const howl = howlRef.current;
    if (!howl) return;
    howl.stop();
    wasPlayingRef.current = false;
  }, []);

  const pause = useCallback((): void => {
    const howl = howlRef.current;
    if (!howl) return;
    howl.pause();
    wasPlayingRef.current = false;
  }, []);

  const fade = useCallback(
    (from: number, to: number, duration: number): void => {
      const howl = howlRef.current;
      if (!howl) return;
      howl.fade(clampVolume(from), clampVolume(to), duration);
    },
    []
  );

  const handleVisible = useCallback(() => {
    const howl = howlRef.current;
    if (!howl) return;
    if (!wasPlayingRef.current) return;

    setTimeout(() => {
      try {
        resumeHowlerContext();
        howl.play();
      } catch (error) {
        console.warn('Audio resume failed:', error);
        howl.once('unlock', () => {
          howl.play();
        });
      }
    }, 100);
  }, []);

  const handleHidden = useCallback(() => {
    const howl = howlRef.current;
    if (!howl) return;
    wasPlayingRef.current = isAudioPlaying(howl);
    howl.pause();
  }, []);

  useVisibilityChange({
    onVisible: handleVisible,
    onHidden: handleHidden,
  });

  return {
    audioRef: howlRef,
    playAudio,
    stopAudio,
    pause,
    fade,
  };
}
