import { isOn } from '@/controllers/fidelity';
import { Economy } from '@/modules/economy/economy';

/** Ours (`mixLocksWalk`): no click or key walks the hero while the Chaos Machine is open. */
export const walkLocked = (): boolean => Economy.mixOpen && isOn('mixLocksWalk');
