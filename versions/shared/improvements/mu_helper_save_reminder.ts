import { defineImprovement } from '@/controllers/fidelity';

/**
 * The MU Helper window's X (the frame's, top right, too) keeps the window open while an edit is unsaved and says
 * so in red. Classic: the exit button closes and drops the edits; the frame's X is a drawing.
 * Read in `modules/mu_helper/state.ts` (`tryCloseMuHelperWindow`) and `ui/windows/mu_helper`.
 */
export default defineImprovement({
  id: 'muHelperSaveReminder',
  preset: 'enhanced',
  labelKey: 'fidelity.muHelperSaveReminder',
  hintKey: 'fidelity.muHelperSaveReminder.hint',
});
