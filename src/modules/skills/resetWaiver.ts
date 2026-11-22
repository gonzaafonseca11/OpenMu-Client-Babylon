/**
 * Ours, server-driven: past a character's first real reset the server (openmu `ResetSkillsPlugIn`) lifts the
 * level and energy a learned skill asks for. It says so on every entry to the world, one byte on this module's
 * packet (1 lifted, 0 not); a server without that plugin never sends it, so the original rule holds. See readme.md.
 */
import { observable, runInAction } from 'mobx';

export const ResetWaiver = observable({ on: false });

/** This module's packet from its server half (`api.onPacket`). */
export function onSkillsPacket(payload: Uint8Array): void {
  runInAction(() => (ResetWaiver.on = payload[0] === 1));
}
