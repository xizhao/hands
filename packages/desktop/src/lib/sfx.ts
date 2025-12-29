/**
 * Sound Effects
 *
 * Simple audio playback for UI feedback sounds.
 */

import confirmSfx from "../assets/sfx/hands-confirm.mp3";
import errorSfx from "../assets/sfx/hands-error.mp3";
import startupSfx from "../assets/sfx/hands-startup.mp3";

const sounds = {
  confirm: confirmSfx,
  error: errorSfx,
  startup: startupSfx,
} as const;

export type SfxName = keyof typeof sounds;

export function playSfx(name: SfxName) {
  new Audio(sounds[name]).play().catch(() => {});
}
