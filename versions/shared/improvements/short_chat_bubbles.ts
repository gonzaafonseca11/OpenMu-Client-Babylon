import { defineImprovement } from '@/controllers/fidelity';

/**
 * A player's chat line stays over the head for 10 seconds.
 * Classic: 1000 ticks, 40 seconds (`AddChat` flag 1). Read in `controllers/interface/nameTags.ts`.
 */
export default defineImprovement({
  id: 'shortChatBubbles',
  preset: 'enhanced',
  labelKey: 'fidelity.shortChatBubbles',
  hintKey: 'fidelity.shortChatBubbles.hint',
});
