import { useEffect, useMemo, useState } from 'react';
import Button from '../../../components/Button';
import { characterRepository } from '../../../data/repositories';
import { Character } from '../../../types/character';
import { Session } from '../../../types/session';
import { User } from '../../../types/user';
import { RuntimeTargetDescriptor, writeRuntimeTargetState } from '../runtimeTargets';

type SessionCharacterListWidgetProps = {
  currentSession: Session;
  currentUser: User;
  role: 'gm' | 'player';
  templateId: string;
  showPcs?: boolean;
  showNpcs?: boolean;
  showMonsters?: boolean;
  compact?: boolean;
  runtimeTargets?: RuntimeTargetDescriptor[];
};

function characterTypeLabel(type?: Character['type']): string {
  switch (type) {
    case 'npc':
      return 'PNJ';
    case 'monster':
      return 'Monstre';
    case 'other':
      return 'Autre';
    case 'pc':
    default:
      return 'PJ';
  }
}

export default function SessionCharacterListWidget({
  currentSession,
  currentUser,
  role,
  templateId,
  showPcs = true,
  showNpcs = false,
  showMonsters = false,
  compact = false,
  runtimeTargets = []
}: SessionCharacterListWidgetProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadCharacters() {
      try {
      const items = await characterRepository.listForSession({
        sessionId: currentSession.id,
        role,
        currentUserId: currentUser.id,
        assignedCharacterId: currentSession.participants?.find((item) => item.userId === currentUser.id)?.characterId ?? null
      });
        if (!mounted) {
          return;
        }
        setCharacters(items);
      } catch {
        if (mounted) {
          setCharacters([]);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void loadCharacters();
    return () => {
      mounted = false;
    };
  }, [currentSession.id, currentUser.id, role]);

  const items = useMemo(() => {
    return characters.filter((character) => {
      const type = character.type || 'pc';
      if (type === 'pc') {
        return showPcs;
      }
      if (type === 'npc') {
        return showNpcs;
      }
      if (type === 'monster') {
        return showMonsters;
      }
      return role === 'gm';
    });
  }, [characters, role, showMonsters, showNpcs, showPcs]);

  const characterTargets = useMemo(
    () => runtimeTargets.filter((target) => target.widgetType === 'character_sheet'),
    [runtimeTargets]
  );

  if (isLoading) {
    return <p style={{ margin: 0 }}>Chargement des personnages...</p>;
  }

  if (items.length === 0) {
    return <p style={{ margin: 0 }}>Aucun personnage visible dans cette liste.</p>;
  }

  return (
    <div className={`screen-widget-list${compact ? ' screen-widget-list--compact' : ''}`.trim()}>
      {items.map((character) => {
        const owner = currentSession.participants?.find((participant) => participant.userId === character.ownerUserId);
        const ownerLabel = owner ? owner.nickname || owner.displayName || owner.userId : 'Non attribué';
        const meta = [
          characterTypeLabel(character.type),
          ownerLabel,
          character.ownerUserId === currentUser.id ? 'Vous' : null
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <article key={character.id} className={`screen-widget-row screen-widget-row--character${compact ? ' is-compact' : ''}`.trim()}>
            <div className="screen-widget-row__main">
              <div className="screen-widget-row__titleline">
                <strong>{character.name}</strong>
                <span className="screen-widget-type-badge">{characterTypeLabel(character.type)}</span>
              </div>
              <small>{meta}</small>
            </div>
            <div className="screen-widget-row__actions">
              <Button
                type="button"
                variant="secondary"
                className="screen-widget-action-button"
                onClick={() => window.open(`/sessions/${currentSession.id}/characters/${character.id}`, '_blank', 'noopener,noreferrer')}
              >
                Fiche
              </Button>
              <details className="screen-runtime-open-in-details screen-widget-open-in">
                <summary className="button secondary screen-widget-action-button">Dans...</summary>
                <div className="screen-runtime-open-in-menu">
                  {characterTargets.length ? (
                    characterTargets.map((target) => (
                      <button
                        key={target.id}
                        type="button"
                        className="screen-runtime-open-in-menu__item"
                        onClick={() =>
                          writeRuntimeTargetState({
                            sessionId: currentSession.id,
                            templateId,
                            targetId: target.id,
                            state: {
                              visible: true,
                              content: {
                                kind: 'character',
                                title: character.name,
                                characterId: character.id
                              },
                              updatedAt: new Date().toISOString()
                            }
                          })
                        }
                      >
                        {target.title} · {target.screenName}
                      </button>
                    ))
                  ) : (
                    <div className="screen-runtime-open-in-menu__empty">
                      Aucune cible de fiche disponible dans ce set.
                      <br />
                      Ajoute un widget `Fiche de personnage` dans le template pour utiliser `Ouvrir dans`.
                    </div>
                  )}
                </div>
              </details>
            </div>
          </article>
        );
      })}
    </div>
  );
}
