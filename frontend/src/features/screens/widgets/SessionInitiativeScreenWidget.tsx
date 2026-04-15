import { useEffect, useMemo, useState } from 'react';
import { characterRepository, sessionRepository } from '../../../data/repositories';
import { sendSystemMessage } from '../../../stores/chatStore';
import { Character } from '../../../types/character';
import { Session, SessionInitiativeEntry, SessionInitiativeState } from '../../../types/session';
import { User } from '../../../types/user';

type SessionInitiativeScreenWidgetProps = {
  currentUser: User;
  currentSession: Session;
  role: 'gm' | 'player';
  compact?: boolean;
  showDetails?: boolean;
};

function normalizeInitiative(session: Session): SessionInitiativeState {
  return (
    session.initiative ?? {
      round: 0,
      turnIndex: 0,
      isInCombat: false,
      entries: []
    }
  );
}

function buildDefaultEntries(session: Session): SessionInitiativeEntry[] {
  const players = (session.participants ?? []).filter((participant) => participant.role === 'player');
  return players.map((player, index) => ({
    id: `init-${player.userId}`,
    type: 'character',
    name: player.displayName || player.nickname || `Joueur ${index + 1}`,
    initiative: Math.max(1, 15 - index),
    characterId: player.characterId ?? null,
    isActive: true
  }));
}

function evaluateInitiativeFormula(character: Character, formula: string | null | undefined): number {
  if (!formula?.trim()) {
    return 0;
  }
  const values = new Map<string, number>();
  for (const field of character.sheet?.fields ?? []) {
    const raw = typeof field.value === 'number' ? field.value : Number(field.value);
    values.set(field.id, Number.isFinite(raw) ? raw : 0);
  }
  const expression = formula.replace(/@([A-Za-z0-9_]+)/g, (_, token: string) => String(values.get(token) ?? 0));
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
    return 0;
  }
  try {
    const result = Function(`"use strict"; return (${expression});`)();
    return Number.isFinite(Number(result)) ? Number(result) : 0;
  } catch {
    return 0;
  }
}

function buildCharacterEntries(session: Session, characters: Character[], formulaOverride?: string | null): SessionInitiativeEntry[] {
  return (session.participants ?? [])
    .filter((participant) => participant.role === 'player' || participant.role === 'gm')
    .map((participant, index) => {
      const character = characters.find((item) => item.id === participant.characterId);
      const initiativeValue = character
        ? evaluateInitiativeFormula(character, formulaOverride || character.initiativeFormula)
        : Math.max(1, 15 - index);
      return {
        id: `init-${participant.userId}`,
        type: 'character',
        name: character?.name || participant.displayName || participant.nickname || `Joueur ${index + 1}`,
        initiative: initiativeValue,
        characterId: participant.characterId ?? null,
        isActive: true
      };
    });
}

export default function SessionInitiativeScreenWidget({
  currentSession,
  currentUser,
  role,
  compact = false,
  showDetails = true
}: SessionInitiativeScreenWidgetProps) {
  const [initiative, setInitiative] = useState<SessionInitiativeState>(normalizeInitiative(currentSession));
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitiative() {
      try {
        const session = await sessionRepository.getById(currentSession.id);
        const loadedCharacters = await characterRepository.listForSession({
          sessionId: currentSession.id,
          role,
          currentUserId: currentUser.id,
          assignedCharacterId: currentSession.participants?.find((item) => item.userId === currentUser.id)?.characterId ?? null
        });
        if (isMounted && session) {
          setInitiative(normalizeInitiative(session));
          setCharacters(loadedCharacters);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "Impossible de charger l'initiative.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadInitiative();

    return () => {
      isMounted = false;
    };
  }, [currentSession.id, currentUser.id, role]);

  const activeEntry = useMemo(() => {
    if (!initiative.entries.length || !initiative.isInCombat) {
      return null;
    }
    return initiative.entries[initiative.turnIndex] ?? null;
  }, [initiative]);

  const persist = async (next: SessionInitiativeState) => {
    try {
      const updatedSession = await sessionRepository.updateInitiative(currentSession.id, next);
      if (!updatedSession) {
        setErrorMessage('Session introuvable.');
        return;
      }
      setInitiative(next);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'enregistrer l'initiative.");
    }
  };

  const effectiveMode = initiative.config?.mode && initiative.config.mode !== 'system_default'
    ? initiative.config.mode
    : characters.find((character) => character.initiativeMode)?.initiativeMode || 'combat_once';
  const effectiveFormula =
    initiative.config?.mode && initiative.config.mode !== 'system_default' ? initiative.config.formula : characters.find((character) => character.initiativeFormula)?.initiativeFormula;

  const handleStartCombat = async () => {
    const baseEntries =
      effectiveMode === 'gm_fixed' || effectiveMode === 'manual_turn'
        ? initiative.entries.length > 0
          ? initiative.entries
          : buildDefaultEntries(currentSession)
        : buildCharacterEntries(currentSession, characters, effectiveFormula);
    if (baseEntries.length === 0) {
      setErrorMessage('Aucun combattant disponible pour demarrer le combat.');
      return;
    }

    const entries = effectiveMode === 'manual_turn' ? [...baseEntries] : [...baseEntries].sort((a, b) => b.initiative - a.initiative);
    const next: SessionInitiativeState = {
      round: 1,
      turnIndex: 0,
      isInCombat: true,
      entries,
      config: initiative.config
    };

    await persist(next);
    sendSystemMessage({
      sessionId: currentSession.id,
      content: `Combat demarre. Round 1 - Tour de ${entries[0].name}.`,
      systemType: 'combat_start'
    });
  };

  const handleNextTurn = async () => {
    if (!initiative.isInCombat || !initiative.entries.length) {
      return;
    }

    const nextTurnIndex = initiative.turnIndex + 1;
    const reachedEndOfRound = nextTurnIndex >= initiative.entries.length;
    const round = reachedEndOfRound ? initiative.round + 1 : initiative.round;
    const turnIndex = reachedEndOfRound ? 0 : nextTurnIndex;
    const recalculatedEntries =
      reachedEndOfRound && effectiveMode === 'round_recalc'
        ? buildCharacterEntries(currentSession, characters, effectiveFormula).sort((a, b) => b.initiative - a.initiative)
        : initiative.entries;
    const next: SessionInitiativeState = {
      ...initiative,
      round,
      turnIndex: reachedEndOfRound && effectiveMode === 'round_recalc' ? 0 : turnIndex,
      entries: recalculatedEntries
    };

    await persist(next);

    if (reachedEndOfRound) {
      sendSystemMessage({
        sessionId: currentSession.id,
        content: `Round ${round} commence.`,
        systemType: 'round'
      });
    }

    const current = next.entries[next.turnIndex];
    if (current) {
      sendSystemMessage({
        sessionId: currentSession.id,
        content: `Tour de ${current.name}.`,
        systemType: 'turn'
      });
    }
  };

  const handleEndCombat = async () => {
    if (!initiative.isInCombat) {
      return;
    }
    const completedRounds = initiative.round;
    const next: SessionInitiativeState = {
      ...initiative,
      isInCombat: false,
      round: 0,
      turnIndex: 0
    };
    await persist(next);
    sendSystemMessage({
      sessionId: currentSession.id,
      content: `Combat termine apres ${completedRounds} rounds.`,
      systemType: 'combat_end'
    });
  };

  return (
    <div style={{ display: 'grid', gap: '0.7rem', height: '100%', alignContent: 'start' }}>
      {isLoading ? <p style={{ margin: 0 }}>Chargement initiative...</p> : null}
      {errorMessage ? <p style={{ margin: 0, color: '#fca5a5' }}>{errorMessage}</p> : null}

      {!isLoading ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
            <p style={{ margin: 0 }}>
              Etat: <strong>{initiative.isInCombat ? 'Combat en cours' : 'Hors combat'}</strong>
            </p>
            {initiative.isInCombat ? (
              <p style={{ margin: 0 }}>
                Round <strong>{initiative.round}</strong>
              </p>
            ) : null}
          </div>

          {activeEntry ? (
            <div className="card" style={{ margin: 0, borderColor: '#38bdf8' }}>
              Tour actif: <strong>{activeEntry.name}</strong>
            </div>
          ) : null}

          <ul style={{ margin: 0, paddingLeft: compact ? '1rem' : '1.2rem', display: 'grid', gap: compact ? '0.2rem' : '0.35rem' }}>
            {initiative.entries.map((entry, index) => (
              <li key={entry.id}>
                <strong>{entry.name}</strong>
                {showDetails ? ` (init ${entry.initiative})` : ''}
                {initiative.isInCombat && index === initiative.turnIndex ? ' <- actif' : ''}
              </li>
            ))}
          </ul>

          {role === 'gm' ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="button" type="button" onClick={() => void handleStartCombat()} disabled={initiative.isInCombat}>
                Demarrer
              </button>
              <button className="button secondary" type="button" onClick={() => void handleNextTurn()} disabled={!initiative.isInCombat}>
                Tour suivant
              </button>
              <button className="button secondary" type="button" onClick={() => void handleEndCombat()} disabled={!initiative.isInCombat}>
                Terminer
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
