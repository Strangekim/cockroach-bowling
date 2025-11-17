import { Howl, Howler } from 'howler';

export const clampVolume = (volume: number): number =>
  Math.max(0, Math.min(1, volume));

export const resumeHowlerContext = (): void => {
  if (Howler.ctx && Howler.ctx.state === 'suspended') {
    Howler.ctx.resume();
  }
};

export const createHowlConfig = (
  src: string,
  loop: boolean,
  volume: number,
  onLoadError?: (id: number, error: unknown) => void,
  onPlayError?: (id: number, error: unknown) => void
) => ({
  src: [src],
  loop,
  volume: clampVolume(volume),
  preload: true,
  html5: false,
  onload: () => {
    console.log('Howl audio loaded');
  },
  onloaderror:
    onLoadError ||
    ((_id: number, error: unknown) => {
      console.error('Howl load error:', error);
    }),
  onplayerror:
    onPlayError ||
    ((_id: number, error: unknown) => {
      console.error('Howl play error:', error);
    }),
});

export const isAudioPlaying = (howl: Howl | null): boolean => {
  return howl ? howl.playing() : false;
};

export const setAudioVolume = (howl: Howl | null, volume: number): void => {
  if (howl) {
    const clampedVolume = clampVolume(volume);
    howl.volume(clampedVolume);
    console.log('Howl volume:', clampedVolume);
  }
};

