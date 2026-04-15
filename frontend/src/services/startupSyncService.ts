import { localActionRepository, offlineSessionRepository } from '../data/repositories';
import { prepareSessionOfflineBundle } from './offlineSessionService';
import { runSyncCycle, SyncCycleReport } from './syncService';

export type StartupSyncPreference = 'ask' | 'always' | 'never';

const STARTUP_SYNC_PREFERENCE_KEY = 'nexusforge.mobile.startupSyncPreference';

export function loadStartupSyncPreference(): StartupSyncPreference {
  const raw = localStorage.getItem(STARTUP_SYNC_PREFERENCE_KEY);
  if (raw === 'always' || raw === 'never') {
    return raw;
  }
  return 'ask';
}

export function persistStartupSyncPreference(preference: StartupSyncPreference): void {
  if (preference === 'ask') {
    localStorage.removeItem(STARTUP_SYNC_PREFERENCE_KEY);
    return;
  }
  localStorage.setItem(STARTUP_SYNC_PREFERENCE_KEY, preference);
}

export async function shouldPromptStartupSync(currentUserId: string): Promise<boolean> {
  const [bundles, actions] = await Promise.all([
    offlineSessionRepository.listForUser(currentUserId),
    localActionRepository.listSyncCandidates()
  ]);
  return bundles.length > 0 || actions.length > 0;
}

export async function runStartupSync(params: { currentUserId: string }): Promise<{
  syncReport: SyncCycleReport;
  refreshedBundles: number;
}> {
  const syncReport = await runSyncCycle();
  const bundles = await offlineSessionRepository.listForUser(params.currentUserId);
  let refreshedBundles = 0;

  for (const bundle of bundles) {
    try {
      await prepareSessionOfflineBundle({
        sessionId: bundle.sessionId,
        currentUserId: params.currentUserId
      });
      refreshedBundles += 1;
      await offlineSessionRepository.markSynced(bundle.sessionId);
    } catch {
      // Leave bundle state as managed by prepareSessionOfflineBundle.
    }
  }

  return {
    syncReport,
    refreshedBundles
  };
}
