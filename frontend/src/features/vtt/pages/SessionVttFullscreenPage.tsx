import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import { useAuth } from '../../../hooks/useAuth';
import { sessionRepository, resourceRepository, characterRepository } from '../../../data/repositories';
import { Character } from '../../../types/character';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';
import SessionVttPanel from './SessionVttPanel';

function canManageSession(session: Session, userId: string, userRoles: string[]): boolean {
  if (userRoles.includes('admin')) {
    return true;
  }
  return session.ownerUserId === userId || session.gmUserId === userId || (session.gmUserIds || []).includes(userId);
}

export default function SessionVttFullscreenPage() {
  const { sessionId = '' } = useParams();
  const { currentUser } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!currentUser) {
        return;
      }
      try {
        const loadedSession = await sessionRepository.getById(sessionId);
        if (!loadedSession) {
          throw new Error('Partie introuvable.');
        }
        const canManageLoaded = canManageSession(loadedSession, currentUser.id, currentUser.roles);
        const [loadedResources, loadedCharacters] = await Promise.all([
          resourceRepository.list({ scopeType: 'session', scopeRefId: sessionId }),
          characterRepository.listForSession({ sessionId, role: canManageLoaded ? 'gm' : 'player', currentUserId: currentUser.id })
        ]);
        if (active) {
          setSession(loadedSession);
          setResources(loadedResources);
          setCharacters(loadedCharacters);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le VTT.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentUser, sessionId]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (isLoading) {
    return <Layout wide hideNavigation><section className="card">Chargement du VTT...</section></Layout>;
  }
  if (errorMessage || !session) {
    return <Layout wide hideNavigation><section className="card home-alert home-alert--error">{errorMessage ?? 'Partie introuvable.'}</section></Layout>;
  }

  const canManage = canManageSession(session, currentUser.id, currentUser.roles);
  return (
    <Layout wide hideNavigation>
      <SessionVttPanel
        session={session}
        currentUserId={currentUser.id}
        viewMode={canManage ? 'gm' : 'player'}
        canManage={canManage}
        sessionResources={resources}
        characters={characters}
        fullscreen
      />
    </Layout>
  );
}
