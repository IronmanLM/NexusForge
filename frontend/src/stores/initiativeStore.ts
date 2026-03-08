import { sendSystemMessage } from './chatStore';

export type Combatant = {
  id: string;
  name: string;
};

type InitiativeState = {
  sessionId: string | null;
  combatants: Combatant[];
  currentTurnIndex: number;
  currentRound: number;
  isInCombat: boolean;
};

const initiativeState: InitiativeState = {
  sessionId: null,
  combatants: [],
  currentTurnIndex: 0,
  currentRound: 0,
  isInCombat: false
};

export const initiativeStore = {
  startCombat(sessionId: string, combatants: Combatant[]) {
    if (!combatants.length) {
      return;
    }

    initiativeState.sessionId = sessionId;
    initiativeState.combatants = combatants;
    initiativeState.currentTurnIndex = 0;
    initiativeState.currentRound = 1;
    initiativeState.isInCombat = true;

    const firstCombatant = initiativeState.combatants[initiativeState.currentTurnIndex];
    sendSystemMessage({
      sessionId,
      content: `Combat demarre. Round 1 - Tour de ${firstCombatant.name}.`,
      systemType: 'combat_start'
    });
  },

  nextTurn() {
    if (!initiativeState.isInCombat || !initiativeState.sessionId || !initiativeState.combatants.length) {
      return;
    }

    const nextTurnIndex = initiativeState.currentTurnIndex + 1;
    const reachedEndOfRound = nextTurnIndex >= initiativeState.combatants.length;

    if (reachedEndOfRound) {
      initiativeState.currentTurnIndex = 0;
      initiativeState.currentRound += 1;

      sendSystemMessage({
        sessionId: initiativeState.sessionId,
        content: `Round ${initiativeState.currentRound} commence.`,
        systemType: 'round'
      });
    } else {
      initiativeState.currentTurnIndex = nextTurnIndex;
    }

    const activeCombatant = initiativeState.combatants[initiativeState.currentTurnIndex];
    sendSystemMessage({
      sessionId: initiativeState.sessionId,
      content: `Tour de ${activeCombatant.name}.`,
      systemType: 'turn'
    });
  },

  endCombat() {
    if (!initiativeState.isInCombat || !initiativeState.sessionId) {
      return;
    }

    const completedRounds = initiativeState.currentRound;
    const sessionId = initiativeState.sessionId;

    initiativeState.isInCombat = false;
    initiativeState.combatants = [];
    initiativeState.currentTurnIndex = 0;
    initiativeState.currentRound = 0;
    initiativeState.sessionId = null;

    sendSystemMessage({
      sessionId,
      content: `Combat termine apres ${completedRounds} rounds.`,
      systemType: 'combat_end'
    });
  }
};
