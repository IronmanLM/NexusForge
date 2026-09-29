import { useEffect, useState } from 'react';
import { characterRepository, resourceRepository, sessionRepository } from '../../../data/repositories';
import { Character } from '../../../types/character';
import { ResourceItem } from '../../../types/resource';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';
import SessionVttPanel from '../pages/SessionVttPanel';

type SessionVttPlayerWidgetProps = {
  currentUser: User;
  currentSession: Session;
};

export default function SessionVttPlayerWidget({ currentUser, currentSession }: SessionVttPlayerWidgetProps) {
  const [session, setSession] = useState<Session | null>(currentSession);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [freshSession, sessionResources, sessionCharacters] = await Promise.all([
          sessionRepository.getById(currentSession.id),
          resourceRepository.list({ scopeType: 'session', scopeRefId: currentSession.id }),
          characterRepository.listForSession({ sessionId: currentSession.id, role: 'player', currentUserId: currentUser.id })
        ]);
        if (!active) return;
        setSession(freshSession);
        setResources(sessionResources);
        setCharacters(sessionCharacters);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement du VTT');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [currentSession.id, currentUser.id]);

  if (loading) return <div>Chargement du VTT…</div>;
  if (error) return <div className="home-alert home-alert--error">{error}</div>;
  if (!session) return <div>Aucune partie VTT disponible.</div>;

  return (
    <SessionVttPanel
      session={session}
      currentUserId={currentUser.id}
      viewMode="player"
      canManage={false}
      sessionResources={resources}
      characters={characters}
      fullscreen={true}
    />
  );
}
