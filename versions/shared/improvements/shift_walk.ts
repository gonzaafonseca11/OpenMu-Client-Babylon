import { defineImprovement } from '@/controllers/fidelity';

/**
 * Holding Shift, a left click walks to the ground under the cursor even over a monster, so a
 * surrounded hero can step out. Classic: a click on a monster always attacks it (ZzzInterface.cpp
 * `MoveHero`). Read in `src/ecs/systems/pointerInputSystem.ts`.
 */
export default defineImprovement({
  id: 'shiftWalk',
  preset: 'enhanced',
  labelKey: 'fidelity.shiftWalk',
  hintKey: 'fidelity.shiftWalk.hint',
});
