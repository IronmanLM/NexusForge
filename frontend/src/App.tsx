import { useEffect, useRef, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './features/auth/store/authStore';
import { useAuth } from './hooks/useAuth';
import { I18nProvider } from './i18n/I18nProvider';
import {
  loadStartupSyncPreference,
  persistStartupSyncPreference,
  runStartupSync,
  shouldPromptStartupSync,
  StartupSyncPreference
} from './services/startupSyncService';
import { runSyncCycle } from './services/syncService';

function AppShell() {
  const { currentUser, isLoading } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [startupPromptVisible, setStartupPromptVisible] = useState(false);
  const [isRunningStartupSync, setIsRunningStartupSync] = useState(false);
  const [startupStatusMessage, setStartupStatusMessage] = useState<string | null>(null);
  const startupHandledForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const syncOnlineState = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', syncOnlineState);
    window.addEventListener('offline', syncOnlineState);
    return () => {
      window.removeEventListener('online', syncOnlineState);
      window.removeEventListener('offline', syncOnlineState);
    };
  }, []);

  useEffect(() => {
    const triggerSync = () => {
      if (!navigator.onLine) {
        return;
      }
      void runSyncCycle();
    };

    triggerSync();
    window.addEventListener('online', triggerSync);
    const intervalId = window.setInterval(() => {
      void runSyncCycle();
    }, 15_000);

    return () => {
      window.removeEventListener('online', triggerSync);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!startupStatusMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStartupStatusMessage(null);
    }, 10_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [startupStatusMessage]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapStartupSyncPrompt() {
      if (isLoading || !currentUser || !isOnline) {
        return;
      }
      if (startupHandledForUserRef.current === currentUser.id) {
        return;
      }

      const preference = loadStartupSyncPreference();
      const shouldPrompt = await shouldPromptStartupSync(currentUser.id);
      if (cancelled || !shouldPrompt) {
        startupHandledForUserRef.current = currentUser.id;
        return;
      }

      if (preference === 'always') {
        startupHandledForUserRef.current = currentUser.id;
        setIsRunningStartupSync(true);
        try {
          const result = await runStartupSync({ currentUserId: currentUser.id });
          if (!cancelled) {
            setStartupStatusMessage(
              `Synchronisation automatique terminée : ${result.syncReport.synced} action(s) rejouée(s), ${result.refreshedBundles} partie(s) rafraîchie(s).`
            );
          }
        } catch {
          if (!cancelled) {
            setStartupStatusMessage('La synchronisation automatique au démarrage a échoué.');
          }
        } finally {
          if (!cancelled) {
            setIsRunningStartupSync(false);
          }
        }
        return;
      }

      if (preference === 'never') {
        startupHandledForUserRef.current = currentUser.id;
        return;
      }

      setStartupPromptVisible(true);
    }

    void bootstrapStartupSyncPrompt();

    return () => {
      cancelled = true;
    };
  }, [currentUser, isLoading, isOnline]);

  const handleStartupChoice = async (choice: 'yes_once' | 'yes_always' | 'no_once' | 'no_never') => {
    if (!currentUser) {
      return;
    }
    startupHandledForUserRef.current = currentUser.id;
    setStartupPromptVisible(false);

    let nextPreference: StartupSyncPreference = 'ask';
    if (choice === 'yes_always') {
      nextPreference = 'always';
    } else if (choice === 'no_never') {
      nextPreference = 'never';
    }
    persistStartupSyncPreference(nextPreference);

    if (choice === 'yes_once' || choice === 'yes_always') {
      setIsRunningStartupSync(true);
      try {
        const result = await runStartupSync({ currentUserId: currentUser.id });
        setStartupStatusMessage(
          `Synchronisation terminée : ${result.syncReport.synced} action(s) rejouée(s), ${result.refreshedBundles} partie(s) rafraîchie(s).`
        );
      } catch {
        setStartupStatusMessage('La synchronisation de démarrage a échoué.');
      } finally {
        setIsRunningStartupSync(false);
      }
      return;
    }

    setStartupStatusMessage(nextPreference === 'never' ? 'La synchronisation automatique au démarrage reste désactivée.' : null);
  };

  return (
    <>
      {!isOnline ? <div className="app-offline-badge">Hors ligne</div> : null}
      {startupPromptVisible ? (
        <div className="startup-sync-banner" role="dialog" aria-live="polite">
          <strong>Synchroniser les parties maintenant ?</strong>
          <p>On peut rejouer les actions locales en attente et rafraîchir automatiquement les parties préparées hors ligne.</p>
          <div className="startup-sync-banner__actions">
            <button type="button" onClick={() => void handleStartupChoice('yes_once')}>Oui</button>
            <button type="button" onClick={() => void handleStartupChoice('yes_always')}>Oui et mémoriser</button>
            <button type="button" onClick={() => void handleStartupChoice('no_once')}>Non</button>
            <button type="button" onClick={() => void handleStartupChoice('no_never')}>Non et mémoriser</button>
          </div>
        </div>
      ) : null}
      {isRunningStartupSync ? <div className="startup-sync-banner startup-sync-banner--info">Synchronisation de démarrage en cours…</div> : null}
      {startupStatusMessage ? <div className="startup-sync-banner startup-sync-banner--status">{startupStatusMessage}</div> : null}
      <RouterProvider router={router} />
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </I18nProvider>
  );
}
