import { defineImprovement } from '@/controllers/fidelity';

/**
 * The hero cannot walk, by click or by keys, while the Chaos Machine window is open.
 * Classic: the hero walks with it open. Read in `ecs/systems/walkLock.ts`.
 */
export default defineImprovement({
  id: 'mixLocksWalk',
  preset: 'enhanced',
  labelKey: 'fidelity.mixLocksWalk',
  hintKey: 'fidelity.mixLocksWalk.hint',
});
