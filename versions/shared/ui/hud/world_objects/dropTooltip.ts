import { observable, runInAction } from 'mobx';

/**
 * One drop tooltip at a time. A drop shows its box under its label or under the cursor; with two drops close
 * together the cursor can be on one's label and over the other, which stacked two boxes (and two compare boxes).
 * The hovered label wins.
 */
export function showsDropTooltip<T>(self: T, state: { hovered: boolean; onLabel: boolean; labelOwner: T | null }): boolean {
  if (state.onLabel) return true;
  return state.hovered && (state.labelOwner === null || state.labelOwner === self);
}

/** The drop whose label the pointer is on, or null. */
export const hoveredDropLabel = observable.box<object | null>(null, { deep: false });

export function setHoveredDropLabel(owner: object | null): void {
  runInAction(() => hoveredDropLabel.set(owner));
}
