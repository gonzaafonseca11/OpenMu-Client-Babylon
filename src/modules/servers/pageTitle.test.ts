import { describe, expect, it } from 'vitest';
import { UIState } from '../../controllers/interface/uiState';
import { titleFor } from './pageTitle';

describe('titleFor', () => {
  it('says the client name until the login, then the world', () => {
    expect(titleFor(UIState.Servers, 'Mu Bardo')).toBe('OpenMUCB');
    expect(titleFor(UIState.World, 'Mu Bardo')).toBe('Mu Bardo');
    expect(titleFor(UIState.World, '  ')).toBe('OpenMUCB');
  });

  it('says the pinned world from the start', () => {
    expect(titleFor(UIState.Servers, 'Mu Bardo', true)).toBe('Mu Bardo');
    expect(titleFor(UIState.Login, '', true)).toBe('OpenMUCB');
  });
});
