import { Economy } from '@/modules/economy/economy';

/** Ours, in every fidelity (the world's owner asked for it): no click or key walks the hero while the Chaos Machine is open. */
export const walkLocked = (): boolean => Economy.mixOpen;
