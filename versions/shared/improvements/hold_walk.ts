import { defineImprovement } from '@/controllers/fidelity';

/**
 * A left button held for half a second walks toward the cursor even over monsters, so a hero can
 * keep moving through a crowd; a short click still attacks. Classic: a click on a monster always
 * attacks it and the hero stays put (ZzzInterface.cpp `MoveHero`). Read in
 * `src/ecs/systems/playerControllerSystem.ts` (`tryMove`).
 */
export default defineImprovement({
  id: 'holdWalk',
  preset: 'enhanced',
  labelKey: 'fidelity.holdWalk',
  hintKey: 'fidelity.holdWalk.hint',
});
