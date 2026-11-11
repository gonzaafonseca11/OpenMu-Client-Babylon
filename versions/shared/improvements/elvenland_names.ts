import { defineImprovement } from '@/controllers/fidelity';

/**
 * Polluted Butterfly, Hideous Rabbit and Werewolf (419-421) show their own names. Classic: the
 * language packs' `NpcName` lines 419-421 are shifted by one, so each of them shows another's name.
 * Read in `versions/shared/monsters/monstersDatabase.ts` (`monsterDisplayName`).
 */
export default defineImprovement({
  id: 'elvenlandNames',
  preset: 'enhanced',
  labelKey: 'fidelity.elvenlandNames',
  hintKey: 'fidelity.elvenlandNames.hint',
});
