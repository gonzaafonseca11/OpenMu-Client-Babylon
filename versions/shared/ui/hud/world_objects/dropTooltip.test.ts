import { describe, expect, it } from 'vitest';
import { showsDropTooltip } from './dropTooltip';

const a = { id: 'a' };
const b = { id: 'b' };

describe('showsDropTooltip', () => {
  it('shows the drop under its label', () => {
    expect(showsDropTooltip(a, { hovered: false, onLabel: true, labelOwner: a })).toBe(true);
  });

  it('shows the drop under the cursor while no label is hovered', () => {
    expect(showsDropTooltip(b, { hovered: true, onLabel: false, labelOwner: null })).toBe(true);
  });

  it('lets the hovered label win over another drop under the cursor, so one box shows', () => {
    expect(showsDropTooltip(b, { hovered: true, onLabel: false, labelOwner: a })).toBe(false);
    expect(showsDropTooltip(a, { hovered: false, onLabel: true, labelOwner: a })).toBe(true);
  });

  it('shows nothing when neither', () => {
    expect(showsDropTooltip(a, { hovered: false, onLabel: false, labelOwner: null })).toBe(false);
  });
});
