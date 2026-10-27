import { describe, expect, it } from 'vitest';
import { shouldShowCharacterCreationDebug } from './characterCreationDebug';

describe('shouldShowCharacterCreationDebug', () => {
  it('shows the diagnostic for administrators in local development', () => {
    expect(shouldShowCharacterCreationDebug({ isAdmin: true, isDevelopment: true })).toBe(true);
  });

  it('hides the diagnostic for administrators in preproduction or production builds', () => {
    expect(shouldShowCharacterCreationDebug({ isAdmin: true, isDevelopment: false })).toBe(false);
  });

  it('never shows the diagnostic to non-admin users', () => {
    expect(shouldShowCharacterCreationDebug({ isAdmin: false, isDevelopment: true })).toBe(false);
  });
});
