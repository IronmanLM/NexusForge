import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import SocialUserAutocomplete from '../../../components/SocialUserAutocomplete';
import { SystemStudioV2Values } from '../../../components/SystemStudioV2Runtime';
import { useAuth } from '../../../hooks/useAuth';
import { LocalAction } from '../../../types/localAction';
import { OfflineSessionBundle } from '../../../types/offline';
import { Session, SessionInitiativeConfig, SessionInvitation, SessionParticipant, SessionSettings } from '../../../types/session';
import { Character } from '../../../types/character';
import { SheetField } from '../../../types/characterSheet';
import { GameSystem, SystemStudioViewDefinitionV2 } from '../../../types/system';
import { ResourceItem } from '../../../types/resource';
import { ScreenTemplate } from '../../../types/screenTemplate';
import { SocialUser } from '../../../types/social';
import {
  characterRepository,
  localActionRepository,
  offlineSessionRepository,
  resourceRepository,
  screenTemplateRepository,
  sessionRepository,
  systemRepository
} from '../../../data/repositories';
import { listCharacterSheetViews, listPlayerCreationCharacterSheetViews } from '../../systems/studioCharacterSheetAdapter';
import { prepareSessionOfflineBundle, purgeOfflineResourceCache } from '../../../services/offlineSessionService';
import { runSyncCycle, SyncCycleReport } from '../../../services/syncService';
import ScreenTemplateRuntime from '../../screens/components/ScreenTemplateRuntime';
import SessionCharacterCreationWizard from '../components/SessionCharacterCreationWizard';
import { ensureScreenSetFormat, screenFormatSummary } from '../../screens/screenSetPresets';

const DEFAULT_SETTINGS: SessionSettings = {
  allowPlayerToEditCharacterOffline: true,
  allowPlayerToPlayerChat: true,
  allowPlayerToPlayerDocuments: true,
  silenceMode: 'off'
};

function roleSupportsTemplate(role: 'gm' | 'player', template: ScreenTemplate): boolean {
  return template.roleTarget === 'both' || template.roleTarget === role;
}

function buildTemplateClone(source: ScreenTemplate, userId: string): ScreenTemplate {
  const now = new Date().toISOString();
  return {
    ...source,
    id: `screen_tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${source.name} (copie perso)`,
    scopeType: 'account',
    scopeRefId: null,
    visibility: 'private',
    createdBy: userId,
    updatedBy: userId,
    sourceTemplateId: source.id,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
    sets: source.sets.map((set) => ({
      ...set,
      screens: set.screens.map((screen) => ({
        ...screen,
        tabGroups: screen.tabGroups.map((group) => ({
          ...group,
          widgets: group.widgets.map((widget) => ({
            ...widget,
            layout: { ...widget.layout },
            config: widget.config ? { ...widget.config } : {},
            dataSource: widget.dataSource ? { ...widget.dataSource } : {},
            permissions: widget.permissions ? { ...widget.permissions } : {}
          }))
        }))
      }))
    }))
  };
}

function canManageSession(session: Session, userId: string, userRoles: string[]): boolean {
  if (userRoles.includes('admin')) {
    return true;
  }
  return session.ownerUserId === userId || session.gmUserId === userId || (session.gmUserIds || []).includes(userId);
}

function computeRole(session: Session, user: { id: string; roles: string[] }): 'gm' | 'player' {
  const participant = session.participants?.find((item) => item.userId === user.id);
  if (participant?.role === 'gm') {
    return user.roles.includes('gm') || user.roles.includes('admin') ? 'gm' : 'player';
  }
  if (participant?.role === 'player' || participant?.role === 'observer') {
    return 'player';
  }
  return canManageSession(session, user.id, user.roles) ? 'gm' : 'player';
}

function normalizeParticipants(participants: SessionParticipant[], fallbackOwnerUserId: string): SessionParticipant[] {
  const seen = new Set<string>();
  const normalized = participants
    .filter((participant) => participant.userId)
    .map((participant): SessionParticipant => {
      const role: SessionParticipant['role'] =
        participant.role === 'gm' || participant.role === 'observer' ? participant.role : 'player';
      return {
        ...participant,
        role,
        characterId: participant.characterId || null
      };
    })
    .filter((participant) => {
      if (seen.has(participant.userId)) {
        return false;
      }
      seen.add(participant.userId);
      return true;
    });

  if (!normalized.some((participant) => participant.role === 'gm')) {
    const ownerIndex = normalized.findIndex((participant) => participant.userId === fallbackOwnerUserId);
    if (ownerIndex >= 0) {
      normalized[ownerIndex] = { ...normalized[ownerIndex], role: 'gm' };
    } else {
      normalized.unshift({ userId: fallbackOwnerUserId, role: 'gm', characterId: null });
    }
  }

  return normalized;
}

function participantLabel(participant: SessionParticipant): string {
  return participant.nickname || participant.displayName || participant.userId;
}

function invitationLabel(invitation: SessionInvitation): string {
  return invitation.nickname || invitation.displayName || invitation.userId;
}

function isCharacterSessionModel(character: Character): boolean {
  return !character.ownerUserId;
}

function canDeleteCharacterPermanently(params: {
  character: Character;
  currentUserId: string;
  canManage: boolean;
  isAdmin: boolean;
}): boolean {
  if (params.isAdmin) {
    return true;
  }
  if (params.character.ownerUserId === params.currentUserId) {
    return true;
  }
  return isCharacterSessionModel(params.character) && params.canManage;
}

function canRemoveCharacterFromSession(params: {
  character: Character;
  currentUserId: string;
  canManage: boolean;
  isAdmin: boolean;
}): boolean {
  if (params.isAdmin) {
    return false;
  }
  return params.canManage && Boolean(params.character.ownerUserId) && params.character.ownerUserId !== params.currentUserId;
}

function getCharacterLifecycleLabel(character: Character): string {
  if (character.isPreGeneratedClone) {
    return 'Clone joueur';
  }
  if (!character.ownerUserId) {
    return 'Modele MJ';
  }
  return 'Fiche attribuee';
}

function formatSessionActivityLabel(entry: NonNullable<Session['activityLog']>[number]): string {
  const actor = entry.actorNickname ? `@${entry.actorNickname}` : 'Systeme';

  switch (entry.type) {
    case 'session_created':
      return `${actor} a cree la partie.`;
    case 'session_updated':
      return `${actor} a mis a jour les reglages de partie.`;
    case 'invitation_sent':
      return `${actor} a envoye une invitation.`;
    case 'invitation_cancelled':
      return `${actor} a annule une invitation en attente.`;
    case 'invitation_resent':
      return `${actor} a relance une invitation.`;
    case 'invitation_accepted':
      return `${actor} a accepte une invitation.`;
    case 'invitation_declined':
      return `${actor} a refuse une invitation.`;
    case 'participant_removed':
      return `${actor} a retire un participant de la table.`;
    case 'participant_left':
      return `${actor} a quitte la partie.`;
    case 'character_created':
      return `${actor} a cree une fiche de personnage.`;
    case 'character_cloned':
      return `${actor} a duplique un pre-tire pour un joueur.`;
    case 'character_updated':
      return `${actor} a reattribue ou modifie une fiche.`;
    case 'character_removed_from_session':
      return `${actor} a retire une fiche de cette partie.`;
    case 'character_deleted':
      return `${actor} a supprime une fiche.`;
    default:
      return entry.message || `${actor} a effectue une action de partie.`;
  }
}

function devicePresetLabel(devicePreset: ScreenTemplate['sets'][number]['devicePreset']): string {
  switch (devicePreset) {
    case 'desktop_2':
      return 'PC 2 ecrans';
    case 'desktop_3':
      return 'PC 3 ecrans';
    case 'tablet':
      return 'Tablette';
    case 'mobile':
      return 'Telephone mobile';
    case 'desktop_1':
    default:
      return 'PC 1 ecran';
  }
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function parseStudioSelectOptions(options?: string[]): Array<{ key: string; label: string }> {
  return (options ?? []).map((option) => {
    const [rawKey, rawLabel] = option.split('=>').map((item) => item.trim());
    return {
      key: rawKey || option.trim(),
      label: rawLabel || rawKey || option.trim()
    };
  });
}

function buildSheetFieldsFromV2View(view: SystemStudioViewDefinitionV2, values: SystemStudioV2Values): SheetField[] {
  const groupId = `${view.id}_main`;
  const editableNodes = view.nodes.filter((node) => ['text', 'textarea', 'date', 'time', 'number', 'checkbox', 'select', 'multiselect', 'progress'].includes(node.type));

  return editableNodes.map((node): SheetField => {
    const value = values[node.key];

    if (node.type === 'number') {
      return {
        id: node.key,
        label: node.label,
        type: 'number',
        value: typeof value === 'number' ? value : Number(value) || 0,
        groupId
      };
    }

    if (node.type === 'progress') {
      return {
        id: node.key,
        label: node.label,
        type: 'resource',
        value: typeof value === 'number' ? value : Number(value) || 0,
        max: 100,
        groupId
      };
    }

    if (node.type === 'checkbox') {
      return {
        id: node.key,
        label: node.label,
        type: 'tag',
        value: Boolean(value) ? 'Oui' : 'Non',
        groupId
      };
    }

    if (node.type === 'select') {
      return {
        id: node.key,
        label: node.label,
        type: 'select',
        value: String(value ?? ''),
        options: parseStudioSelectOptions(node.options),
        groupId
      };
    }

    if (node.type === 'multiselect') {
      return {
        id: node.key,
        label: node.label,
        type: 'multiselect',
        value: Array.isArray(value) ? value.join(', ') : '',
        options: parseStudioSelectOptions(node.options),
        groupId
      };
    }

    return {
      id: node.key,
      label: node.label,
      type: node.type === 'textarea' ? 'textarea' : 'text',
      value: String(value ?? ''),
      groupId,
      ...(node.type === 'textarea' ? { rows: 4 } : {})
    };
  });
}

function formatOfflineBundleStatus(bundle: OfflineSessionBundle | null): string {
  if (!bundle) {
    return 'Aucun cache hors ligne préparé pour cette partie.';
  }
  switch (bundle.status) {
    case 'queued':
      return 'Préparation hors ligne en attente.';
    case 'downloading':
      return 'Préparation hors ligne en cours.';
    case 'ready':
      return 'Cache hors ligne prêt pour les données de partie, les fiches et la liste des fichiers.';
    case 'stale':
      return 'Cache hors ligne à rafraîchir après des changements récents.';
    case 'error':
      return bundle.lastError ? `Erreur hors ligne : ${bundle.lastError}` : 'La préparation hors ligne a échoué.';
    default:
      return 'État hors ligne inconnu.';
  }
}

function sessionActionBelongsToContext(params: {
  action: LocalAction;
  sessionId: string;
  characterIds: Set<string>;
  resourceIds: Set<string>;
}): boolean {
  const { action, sessionId, characterIds, resourceIds } = params;

  if (action.entityType === 'session' && action.entityId === sessionId) {
    return true;
  }

  if (action.entityType === 'character') {
    return characterIds.has(action.entityId) || action.payload.sessionId === sessionId;
  }

  if (action.entityType === 'resource') {
    return resourceIds.has(action.entityId) || (action.payload.scopeType === 'session' && action.payload.scopeRefId === sessionId);
  }

  if (action.entityType === 'note' || action.entityType === 'message' || action.entityType === 'document') {
    return action.payload.sessionId === sessionId || action.payload.scopeRefId === sessionId;
  }

  return false;
}

export default function SessionViewPage() {
  const { sessionId = '' } = useParams();
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [templates, setTemplates] = useState<ScreenTemplate[]>([]);
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [sessionSystem, setSessionSystem] = useState<GameSystem | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [sessionResources, setSessionResources] = useState<ResourceItem[]>([]);
  const [summaryDraft, setSummaryDraft] = useState({ name: '', description: '', state: 'planned' as Session['state'], systemId: '' });
  const [settingsDraft, setSettingsDraft] = useState<SessionSettings>(DEFAULT_SETTINGS);
  const [discordGuildIdDraft, setDiscordGuildIdDraft] = useState('');
  const [discordMutualGuilds, setDiscordMutualGuilds] = useState<Array<{ id: string; name: string }>>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [selectedInviteUser, setSelectedInviteUser] = useState<SocialUser | null>(null);
  const [participantRoleDraft, setParticipantRoleDraft] = useState<SessionParticipant['role']>('player');
  const [characterTemplateId, setCharacterTemplateId] = useState('');
  const [characterOwnerId, setCharacterOwnerId] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [characterDrafts, setCharacterDrafts] = useState<Record<string, { name: string; type: Character['type']; ownerUserId: string }>>({});
  const [pregenCloneTargets, setPregenCloneTargets] = useState<Record<string, string>>({});
  const [playerCharacterViewId, setPlayerCharacterViewId] = useState('');
  const [playerCharacterName, setPlayerCharacterName] = useState('');
  const [guidedCharacterOwnerId, setGuidedCharacterOwnerId] = useState('');
  const [isCharacterCreationWizardOpen, setIsCharacterCreationWizardOpen] = useState(false);
  const [initiativeConfigDraft, setInitiativeConfigDraft] = useState<SessionInitiativeConfig>({ mode: 'system_default', formula: null });
  const [localActions, setLocalActions] = useState<LocalAction[]>([]);
  const [offlineBundle, setOfflineBundle] = useState<OfflineSessionBundle | null>(null);
  const [lastSyncReport, setLastSyncReport] = useState<SyncCycleReport | null>(null);
  const [isRunningSync, setIsRunningSync] = useState(false);
  const [isPreparingOffline, setIsPreparingOffline] = useState(false);
  const [isPurgingOfflineCache, setIsPurgingOfflineCache] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'settings' | 'logs'>('general');
  const [runtimeSetId, setRuntimeSetId] = useState('');
  const [pendingRuntimeLaunch, setPendingRuntimeLaunch] = useState<null | { markRunning: boolean }>(null);

  const detachedScreenId = searchParams.get('detachedScreen');
  const requestedSetId = searchParams.get('set');
  const requestedTemplateId = searchParams.get('template');
  const isRuntimeMode = searchParams.get('runtime') === '1';
  const autoFullscreen = searchParams.get('autofullscreen') === '1';
  const shouldAutoDetach = searchParams.get('autoDetach') === '1';
  const isDetachedRuntime = Boolean(detachedScreenId);
  const discordInviteStatus = searchParams.get('discordInvite');

  const role = session && currentUser ? computeRole(session, currentUser) : 'player';
  const canManage = Boolean(session && currentUser && canManageSession(session, currentUser.id, currentUser.roles));
  const isAdmin = Boolean(currentUser?.roles.includes('admin'));

  const refreshSessionContext = async (targetSession: Session, options?: { refreshTemplates?: boolean; refreshSystems?: boolean }) => {
    if (!currentUser) {
      return;
    }

    const [loadedCharacters, loadedResources, loadedSystem, loadedTemplates, loadedSystems] = await Promise.all([
      characterRepository.listForSession({
        sessionId: targetSession.id,
        role,
        currentUserId: currentUser.id,
        assignedCharacterId: targetSession.participants?.find((item) => item.userId === currentUser.id)?.characterId ?? null
      }),
      resourceRepository.list({ scopeType: 'session', scopeRefId: targetSession.id }),
      systemRepository.getById(targetSession.systemId),
      options?.refreshTemplates === false ? Promise.resolve(null) : screenTemplateRepository.listForUser(currentUser.id),
      options?.refreshSystems ? systemRepository.listAvailableForUser(currentUser) : Promise.resolve(null)
    ]);

    setCharacters(loadedCharacters);
    setSessionResources(loadedResources);
    setSessionSystem(loadedSystem);
    if (loadedTemplates) {
      setTemplates(loadedTemplates);
    }
    if (loadedSystems) {
      setSystems(loadedSystems);
    }
  };

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
    let isMounted = true;

    async function loadPage() {
      if (!currentUser) {
        return;
      }
      try {
        const loadedSession = await sessionRepository.getById(sessionId);
        if (!loadedSession || !isMounted) {
          setSession(loadedSession);
          return;
        }
        setSession(loadedSession);
        const [loadedTemplates, loadedSystems, loadedSystem, loadedCharacters, loadedResources] = await Promise.all([
          screenTemplateRepository.listForUser(currentUser.id),
          systemRepository.listAvailableForUser(currentUser),
          systemRepository.getById(loadedSession.systemId),
          characterRepository.listForSession({
            sessionId: loadedSession.id,
            role: computeRole(loadedSession, currentUser),
            currentUserId: currentUser.id,
            assignedCharacterId: loadedSession.participants?.find((item) => item.userId === currentUser.id)?.characterId ?? null
          }),
          resourceRepository.list({ scopeType: 'session', scopeRefId: loadedSession.id })
        ]);
        const loadedOfflineBundle = await offlineSessionRepository.get(loadedSession.id);
        if (!isMounted) {
          return;
        }
        setTemplates(loadedTemplates);
        setSystems(loadedSystems);
        setSessionSystem(loadedSystem);
        setCharacters(loadedCharacters);
        setSessionResources(loadedResources);
        setOfflineBundle(loadedOfflineBundle);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la partie.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();
    return () => {
      isMounted = false;
    };
  }, [currentUser, sessionId]);

  useEffect(() => {
    if (!discordInviteStatus) {
      return;
    }

    if (discordInviteStatus === 'accepted') {
      setStatusMessage('Invitation Discord acceptée. La partie et le salon lié vont se resynchroniser.');
      setErrorMessage(null);
    } else if (discordInviteStatus === 'declined') {
      setStatusMessage('Invitation Discord refusée.');
      setErrorMessage(null);
    } else if (discordInviteStatus === 'expired') {
      setErrorMessage('Ce lien Discord a expiré. Demande une nouvelle invitation depuis Nexus Forge.');
      setStatusMessage(null);
    } else if (discordInviteStatus === 'invalid') {
      setErrorMessage('Le lien Discord est invalide ou incomplet.');
      setStatusMessage(null);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('discordInvite');
    navigate(
      {
        pathname: `/sessions/${sessionId}`,
        search: nextParams.toString() ? `?${nextParams.toString()}` : ''
      },
      { replace: true }
    );
  }, [discordInviteStatus, navigate, searchParams, sessionId]);

  useEffect(() => {
    let active = true;

    const loadLocalActions = async () => {
      const items = await localActionRepository.listAll();
      if (active) {
        setLocalActions(items);
      }
    };

    void loadLocalActions();
    const interval = window.setInterval(() => {
      void loadLocalActions();
    }, 5_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    setSummaryDraft({
      name: session.name,
      description: session.description ?? '',
      state: session.state,
      systemId: session.systemId
    });
    setSettingsDraft({
      ...DEFAULT_SETTINGS,
      ...(session.settings ?? {})
    });
    setInitiativeConfigDraft({
      mode: session.initiative?.config?.mode ?? 'system_default',
      formula: session.initiative?.config?.formula ?? null
    });
  }, [session]);

  useEffect(() => {
    setCharacterDrafts(
      Object.fromEntries(
        characters.map((character) => [
          character.id,
          {
            name: character.name,
            type: character.type || 'pc',
            ownerUserId: character.ownerUserId || ''
          }
        ])
      )
    );
  }, [characters]);

  const roleTemplates = useMemo(() => templates.filter((template) => roleSupportsTemplate(role, template)), [role, templates]);
  const assignedTemplateId = role === 'gm' ? session?.screenTemplateAssignments?.gmTemplateId || null : session?.screenTemplateAssignments?.playerTemplateId || null;
  const selectedTemplateId =
    session && currentUser
      ? (session.screenTemplateSelections?.[currentUser.id]?.[role === 'gm' ? 'gmTemplateId' : 'playerTemplateId'] as string | undefined) ||
        requestedTemplateId ||
        assignedTemplateId ||
        ''
      : '';
  const activeTemplate = roleTemplates.find((template) => template.id === selectedTemplateId) ?? roleTemplates.find((template) => template.id === assignedTemplateId) ?? null;
  const gmAssignableTemplates = templates.filter((template) => roleSupportsTemplate('gm', template));
  const playerAssignableTemplates = templates.filter((template) => roleSupportsTemplate('player', template));

  const participantCount = session?.participants?.length ?? 0;
  const pendingInvitationCount = (session?.invitations ?? []).filter((invitation) => invitation.status === 'pending').length;
  const gmCount = (session?.participants ?? []).filter((participant) => participant.role === 'gm').length;
  const playerCount = (session?.participants ?? []).filter((participant) => participant.role === 'player').length;
  const sessionResourceCount = sessionResources.length;
  const sessionCommonDocuments = sessionResources.filter((resource) => resource.sessionAudience === 'session_all').length;
  const sessionPrivateDocuments = sessionResources.filter((resource) => resource.sessionAudience === 'private' || resource.sessionAudience === 'session_member').length;
  const sessionGmDocuments = sessionResources.filter((resource) => resource.sessionAudience === 'session_gm').length;
  const characterIds = useMemo(() => new Set(characters.map((character) => character.id)), [characters]);
  const sessionResourceIds = useMemo(() => new Set(sessionResources.map((resource) => resource.id)), [sessionResources]);
  const sessionLocalActions = useMemo(
    () =>
      localActions.filter((action) =>
        sessionActionBelongsToContext({
          action,
          sessionId,
          characterIds,
          resourceIds: sessionResourceIds
        })
      ),
    [characterIds, localActions, sessionId, sessionResourceIds]
  );
  const pendingActionCount = sessionLocalActions.filter((action) => action.syncStatus === 'pending').length;
  const failedActionCount = sessionLocalActions.filter((action) => action.syncStatus === 'failed').length;
  const conflictActions = sessionLocalActions.filter((action) => action.syncStatus === 'conflict');
  const unassignedCharacters = characters.filter((character) => !character.ownerUserId).length;
  const unassignedParticipants = (session?.participants ?? []).filter((participant) => participant.role !== 'observer' && !participant.characterId).length;

  const characterSheetViews = listCharacterSheetViews(sessionSystem);
  const playerCreationViews = listPlayerCreationCharacterSheetViews(sessionSystem);
  const characterCreationConfig = sessionSystem?.characterCreationConfig;
  const isGuidedCharacterCreationEnabled = Boolean(
    characterCreationConfig?.version === 2 &&
      characterCreationConfig.enabled &&
      (characterCreationConfig.stages?.length ?? 0) > 0
  );
  const currentParticipant = (session?.participants ?? []).find((participant) => participant.userId === currentUser?.id) ?? null;
  const currentCharacter = characters.find((character) => character.ownerUserId === currentUser?.id) ?? null;
  const unassignedPregenCharacters = characters.filter((character) => !character.ownerUserId);
  const generalParticipants = (session?.participants ?? []).filter((participant) => participant.role === 'gm' || participant.role === 'player' || participant.role === 'observer');
  const guidedCreationParticipants = generalParticipants.filter((participant) => participant.role !== 'gm');
  const generalCharacters = role === 'gm'
    ? characters.filter((character) => (character.type || 'pc') === 'pc')
    : characters.filter(
        (character) =>
          character.ownerUserId === currentUser?.id ||
          (currentParticipant?.characterId && character.id === currentParticipant.characterId)
      );
  const characterSheetViewsByKind = useMemo(
    () => ({
      pc: characterSheetViews.filter((view) => (view.characterSheetKind ?? 'pc') === 'pc'),
      npc: characterSheetViews.filter((view) => view.characterSheetKind === 'npc'),
      creature: characterSheetViews.filter((view) => view.characterSheetKind === 'creature')
    }),
    [characterSheetViews]
  );

  useEffect(() => {
    const preferredViewId =
      playerCreationViews.find((view) => view.isDefaultForPlayer)?.id ??
      playerCreationViews[0]?.id ??
      '';
    if (!preferredViewId) {
      if (playerCharacterViewId) {
        setPlayerCharacterViewId('');
      }
      return;
    }
    if (!playerCreationViews.some((view) => view.id === playerCharacterViewId)) {
      setPlayerCharacterViewId(preferredViewId);
    }
  }, [playerCharacterViewId, playerCreationViews]);

  useEffect(() => {
    const preferredOwnerId = guidedCreationParticipants[0]?.userId ?? '';
    if (!preferredOwnerId) {
      if (guidedCharacterOwnerId) {
        setGuidedCharacterOwnerId('');
      }
      return;
    }
    if (!guidedCreationParticipants.some((participant) => participant.userId === guidedCharacterOwnerId)) {
      setGuidedCharacterOwnerId(preferredOwnerId);
    }
  }, [guidedCharacterOwnerId, guidedCreationParticipants]);

  useEffect(() => {
    setDiscordGuildIdDraft(session?.discordIntegration?.guildId || '');
  }, [session?.discordIntegration?.guildId]);

  useEffect(() => {
    if (!currentUser?.discordAccount) {
      setDiscordMutualGuilds([]);
      return;
    }
    let cancelled = false;
    void sessionRepository
      .listDiscordMutualGuilds()
      .then((items) => {
        if (!cancelled) {
          setDiscordMutualGuilds(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiscordMutualGuilds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.discordAccount?.id]);

  const persistSession = async (nextSession: Session, successMessage: string, options?: { refreshSystems?: boolean }) => {
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await sessionRepository.upsert(nextSession);
      setSession(nextSession);
      await refreshSessionContext(nextSession, { refreshSystems: options?.refreshSystems });
      setStatusMessage(successMessage);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de mettre a jour la partie.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!session || !canManage) {
      return;
    }
    const nextSession: Session = {
      ...session,
      name: summaryDraft.name.trim() || session.name,
      description: summaryDraft.description.trim(),
      state: summaryDraft.state,
      systemId: summaryDraft.systemId || session.systemId,
      updatedAt: new Date().toISOString()
    };
    await persistSession(nextSession, 'Résumé de partie mis à jour.', { refreshSystems: summaryDraft.systemId !== session.systemId });
  };

  const handleSaveSettings = async () => {
    if (!session || !canManage) {
      return;
    }
    const nextSession: Session = {
      ...session,
      settings: {
        ...DEFAULT_SETTINGS,
        ...settingsDraft
      },
      initiative: {
        ...(session.initiative ?? {
          round: 0,
          turnIndex: 0,
          isInCombat: false,
          entries: []
        }),
        config: initiativeConfigDraft
      },
      updatedAt: new Date().toISOString()
    };
    await persistSession(nextSession, 'Règles de table mises à jour.');
  };

  const handleLinkDiscordChannel = async () => {
    if (!session || !canManage) {
      return;
    }
    const guildId = discordGuildIdDraft.trim();
    if (!guildId) {
      setErrorMessage('Renseigne l identifiant du serveur Discord cible.');
      setStatusMessage(null);
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.linkDiscordChannel({ sessionId: session.id, guildId });
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      }
      setStatusMessage('Demande de synchronisation Discord envoyée. Le bot va créer ou mettre à jour le salon de partie.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de lier cette partie à Discord.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnlinkDiscordChannel = async () => {
    if (!session || !canManage) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.unlinkDiscordChannel(session.id);
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      }
      setStatusMessage('Liaison Discord retirée. Le bot va fermer le salon associé.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de retirer la liaison Discord.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrepareOffline = async () => {
    if (!session || !currentUser) {
      return;
    }
    setIsPreparingOffline(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await prepareSessionOfflineBundle({
        sessionId: session.id,
        currentUserId: currentUser.id
      });
      setOfflineBundle(result.bundle);
      const downloadedCount = result.bundle.resources.filter((item) => item.downloadStatus === 'downloaded').length;
      const failedCount = result.bundle.resources.filter((item) => item.downloadStatus === 'failed').length;
      setStatusMessage(
        `Cache hors ligne préparé : ${result.characters.length} fiche(s), ${downloadedCount} ressource(s) téléchargée(s)${
          failedCount > 0 ? `, ${failedCount} en échec` : ''
        }.`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de préparer le cache hors ligne.');
      const refreshed = await offlineSessionRepository.get(session.id);
      setOfflineBundle(refreshed);
    } finally {
      setIsPreparingOffline(false);
    }
  };

  const handlePurgeOfflineCache = async () => {
    if (!currentUser) {
      return;
    }
    setIsPurgingOfflineCache(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const result = await purgeOfflineResourceCache({ currentUserId: currentUser.id });
      setStatusMessage(
        `Nettoyage du cache hors ligne terminé : ${result.removedFiles} fichier(s) supprimé(s), ${formatBytes(result.removedBytes)} libérés, ${result.keptFiles} conservé(s).`
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de nettoyer le cache hors ligne.');
    } finally {
      setIsPurgingOfflineCache(false);
    }
  };

  const updateParticipants = async (participants: SessionParticipant[], successMessage: string) => {
    if (!session || !canManage) {
      return;
    }
    const normalizedParticipants = normalizeParticipants(participants, session.ownerUserId || session.gmUserId);
    const gmUserIds = normalizedParticipants.filter((participant) => participant.role === 'gm').map((participant) => participant.userId);
    const nextSession: Session = {
      ...session,
      participants: normalizedParticipants,
      gmUserIds,
      gmUserId: gmUserIds[0],
      updatedAt: new Date().toISOString()
    };
    await persistSession(nextSession, successMessage);
  };

  const handleInviteParticipant = async (user: SocialUser, nextRole: SessionParticipant['role'] = participantRoleDraft) => {
    if (!session || !canManage) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.inviteParticipant({
        sessionId: session.id,
        userId: user.id,
        role: nextRole
      });
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      }
      setParticipantSearch('');
      setSelectedInviteUser(null);
      setStatusMessage(`Invitation envoyée à ${user.nickname || user.displayName}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’envoyer l’invitation.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleInvitationResponse = async (invitationId: string, response: 'accept' | 'decline') => {
    if (!session) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.respondToInvitation({
        sessionId: session.id,
        invitationId,
        response
      });
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      }
      setStatusMessage(response === 'accept' ? 'Invitation acceptée.' : 'Invitation refusée.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de répondre à l’invitation.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!session || !canManage) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.cancelInvitation({ sessionId: session.id, invitationId });
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      }
      setStatusMessage('Invitation annulee.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d annuler cette invitation.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResendInvitation = async (invitationId: string) => {
    if (!session || !canManage) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.resendInvitation({ sessionId: session.id, invitationId });
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      }
      setStatusMessage('Invitation relancee.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de relancer cette invitation.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleParticipantRoleChange = async (userId: string, nextRole: SessionParticipant['role']) => {
    if (!session || !canManage) {
      return;
    }
    const nextParticipants = (session.participants ?? []).map((participant) =>
      participant.userId === userId ? { ...participant, role: nextRole } : participant
    );
    await updateParticipants(nextParticipants, 'Participants mis à jour.');
  };

  const handleParticipantCharacterChange = async (userId: string, nextCharacterId: string) => {
    if (!session || !canManage) {
      return;
    }
    const currentAssignedId =
      (session.participants ?? []).find((participant) => participant.userId === userId)?.characterId ?? null;
    if (!nextCharacterId) {
      if (!currentAssignedId) {
        return;
      }
      await characterRepository.updateCharacter({
        sessionId: session.id,
        characterId: currentAssignedId,
        patch: { ownerUserId: null }
      });
      await reloadSession(session.id);
      setStatusMessage('Personnage desattribue.');
      return;
    }
    await characterRepository.updateCharacter({
      sessionId: session.id,
      characterId: nextCharacterId,
      patch: { ownerUserId: userId }
    });
    await reloadSession(session.id);
    setStatusMessage('Attribution de personnage mise à jour.');
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!session || !currentUser) {
      return;
    }
    const target = (session.participants ?? []).find((participant) => participant.userId === userId);
    if (!target) {
      return;
    }
    const isSelfRemoval = target.userId === currentUser.id;
    if (!isSelfRemoval && !canManage) {
      return;
    }
    const ownsSessionCharacter = characters.some((character) => character.sessionId === session.id && character.ownerUserId === target.userId);
    const actionLabel = isSelfRemoval ? 'quitter cette partie' : `retirer ${participantLabel(target)} de la partie`;
    const consequence = ownsSessionCharacter
      ? ' Sa fiche restera dans la partie mais sera desattribuee.'
      : '';
    if (!window.confirm(`Confirmer : ${actionLabel} ?${consequence}`)) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await sessionRepository.removeParticipant({ sessionId: session.id, userId });
      if (updated) {
        setSession(updated);
        await refreshSessionContext(updated);
      } else {
        await reloadSession(session.id);
      }
      setStatusMessage(isSelfRemoval ? 'Tu as quitte la partie.' : 'Participant retire de la partie.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de retirer ce participant.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateCharacter = async () => {
    if (!session || !sessionSystem || !characterSheetViews.length || !characterTemplateId || !canManage) {
      return;
    }
    const view = characterSheetViews.find((item) => item.id === characterTemplateId);
    if (!view) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await characterRepository.createFromStudioView({
        sessionId: session.id,
        system: sessionSystem,
        view,
        ownerUserId: characterOwnerId || null,
        name: characterName.trim() || view.name
      });
      await refreshSessionContext(session);
      setCharacterName('');
      setStatusMessage('Personnage créé depuis le modèle de fiche.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer le personnage.');
    } finally {
      setIsBusy(false);
    }
  };

  const reloadSession = async (targetSessionId: string) => {
    const refreshed = await sessionRepository.getById(targetSessionId);
    if (refreshed) {
      setSession(refreshed);
      await refreshSessionContext(refreshed);
    }
  };

  const resolveFreshPlayerCreationContext = async () => {
    if (!session || !currentUser) {
      throw new Error('Partie ou utilisateur introuvable.');
    }
    const freshSystem = await systemRepository.getById(session.systemId);
    if (!freshSystem) {
      throw new Error('Système introuvable.');
    }
    setSessionSystem(freshSystem);
    const freshPlayerCreationViews = listPlayerCreationCharacterSheetViews(freshSystem);
    const preferredViewId = playerCharacterViewId;
    const freshView =
      freshPlayerCreationViews.find((item) => item.id === preferredViewId) ??
      freshPlayerCreationViews.find((view) => view.isDefaultForPlayer) ??
      freshPlayerCreationViews[0] ??
      null;
    if (!freshView) {
      throw new Error('Vue de création introuvable.');
    }
    if (freshView.id !== playerCharacterViewId) {
      setPlayerCharacterViewId(freshView.id);
    }
    return { freshSystem, freshView };
  };

  const handleCreateOwnCharacter = async () => {
    if (!session || !currentUser || !currentParticipant || currentParticipant.role !== 'player') {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { freshSystem, freshView } = await resolveFreshPlayerCreationContext();
      await characterRepository.createOwnCharacter({
        sessionId: session.id,
        system: freshSystem,
        view: freshView,
        ownerUserId: currentUser.id,
        name: playerCharacterName.trim() || freshView.name
      });
      await reloadSession(session.id);
      setPlayerCharacterName('');
      setStatusMessage('Ta fiche personnage a été créée.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer ton personnage.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateManagedCharacter = async () => {
    if (!session || !canManage) {
      return;
    }
    const ownerUserId = guidedCharacterOwnerId.trim();
    if (!ownerUserId) {
      setErrorMessage('Choisis le joueur qui doit recevoir la fiche.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { freshSystem, freshView } = await resolveFreshPlayerCreationContext();
      const created = await characterRepository.createFromStudioView({
        sessionId: session.id,
        system: freshSystem,
        view: freshView,
        ownerUserId,
        name: playerCharacterName.trim() || freshView.name
      });
      await characterRepository.updateCharacter({
        sessionId: session.id,
        characterId: created.id,
        patch: { ownerUserId }
      });
      await reloadSession(session.id);
      setPlayerCharacterName('');
      setStatusMessage('La fiche du joueur a été créée.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer la fiche du joueur.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCompleteGuidedCharacterCreation = async (payload: { name: string; runtimeValues: SystemStudioV2Values }) => {
    if (!session || !currentUser) {
      return;
    }
    const { freshSystem, freshView } = await resolveFreshPlayerCreationContext();

    const ownerUserId =
      canManage
        ? guidedCharacterOwnerId.trim()
        : currentParticipant?.role === 'player'
        ? currentUser.id
        : '';
    if (!ownerUserId) {
      throw new Error('Aucun joueur cible sélectionné pour cette création.');
    }

    const created =
      !canManage && currentParticipant?.role === 'player'
        ? await characterRepository.createOwnCharacter({
            sessionId: session.id,
            system: freshSystem,
            view: freshView,
            ownerUserId,
            name: payload.name
          })
        : await characterRepository.createFromStudioView({
            sessionId: session.id,
            system: freshSystem,
            view: freshView,
            ownerUserId,
            name: payload.name
          });

    const nextFields = buildSheetFieldsFromV2View(freshView, payload.runtimeValues);
    await characterRepository.updateSheetFields({
      sessionId: session.id,
      characterId: created.id,
      fields: nextFields,
      runtimeValues: payload.runtimeValues
    });

    if (canManage) {
      await characterRepository.updateCharacter({
        sessionId: session.id,
        characterId: created.id,
        patch: { ownerUserId }
      });
    }

    await reloadSession(session.id);
    setPlayerCharacterName('');
    setIsCharacterCreationWizardOpen(false);
    setStatusMessage(canManage ? 'La fiche du joueur a été créée via le parcours guidé.' : 'Ta fiche personnage a été créée via le parcours guidé.');
  };

  const handleClonePregenCharacter = async (sourceCharacterId: string) => {
    if (!session || !canManage) {
      return;
    }
    const ownerUserId = pregenCloneTargets[sourceCharacterId] || '';
    if (!ownerUserId) {
      setErrorMessage('Choisis le joueur qui doit recevoir cette copie.');
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await characterRepository.cloneCharacterToOwner({
        sessionId: session.id,
        sourceCharacterId,
        ownerUserId
      });
      await reloadSession(session.id);
      setStatusMessage('Pré-tiré dupliqué et attribué au joueur.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de dupliquer ce pré-tiré.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectCharacterTemplate = (viewId: string) => {
    setCharacterTemplateId(viewId);
    const view = characterSheetViews.find((item) => item.id === viewId);
    setCharacterName(view?.defaultSheetNameTemplate ?? '');
  };

  const handleCloneAssignedTemplate = async () => {
    if (!session || !currentUser || !assignedTemplateId) {
      return;
    }
    const source = templates.find((template) => template.id === assignedTemplateId);
    if (!source) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const clone = buildTemplateClone(source, currentUser.id);
      await screenTemplateRepository.upsert(clone);
      const refreshedTemplates = await screenTemplateRepository.listForUser(currentUser.id);
      setTemplates(refreshedTemplates);
      const key = role === 'gm' ? 'gmTemplateId' : 'playerTemplateId';
      const nextSession: Session = {
        ...session,
        screenTemplateSelections: {
          ...(session.screenTemplateSelections ?? {}),
          [currentUser.id]: {
            ...(session.screenTemplateSelections?.[currentUser.id] ?? {}),
            [key]: clone.id
          }
        },
        updatedAt: new Date().toISOString()
      };
      await sessionRepository.upsert(nextSession);
      setSession(nextSession);
      setStatusMessage(`Template cloné : ${clone.name}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de cloner le template proposé.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveCharacter = async (characterId: string) => {
    if (!session || !canManage) {
      return;
    }
    const draft = characterDrafts[characterId];
    if (!draft) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const updated = await characterRepository.updateCharacter({
        sessionId: session.id,
        characterId,
        patch: {
          name: draft.name.trim(),
          type: draft.type || 'pc',
          ownerUserId: draft.ownerUserId || null
        }
      });
      if (updated) {
        await reloadSession(session.id);
      }
      setStatusMessage('Personnage mis à jour.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de mettre à jour le personnage.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!session || !currentUser) {
      return;
    }
    const character = characters.find((item) => item.id === characterId);
    if (!character) {
      return;
    }
    if (!canDeleteCharacterPermanently({ character, currentUserId: currentUser.id, canManage, isAdmin })) {
      setErrorMessage('Seul le proprietaire peut supprimer definitivement cette fiche. Le MJ peut seulement la retirer de la partie.');
      return;
    }
    if (!window.confirm(`Supprimer définitivement ${character.name} de cette partie ?`)) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await characterRepository.removeCharacter({ sessionId: session.id, characterId });
      const nextSession = {
        ...session,
        participants: (session.participants ?? []).map((participant) =>
          participant.characterId === characterId ? { ...participant, characterId: null } : participant
        ),
        updatedAt: new Date().toISOString()
      };
      await sessionRepository.upsert(nextSession);
      setSession(nextSession);
      await refreshSessionContext(nextSession);
      setStatusMessage('Fiche supprimee definitivement.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer le personnage.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveCharacterFromSession = async (characterId: string) => {
    if (!session || !currentUser) {
      return;
    }
    const character = characters.find((item) => item.id === characterId);
    if (!character) {
      return;
    }
    if (!canRemoveCharacterFromSession({ character, currentUserId: currentUser.id, canManage, isAdmin })) {
      setErrorMessage('Cette fiche ne peut pas etre retiree de la partie avec ton role actuel.');
      return;
    }
    if (!window.confirm(`Retirer ${character.name} de cette partie sans supprimer la fiche ?`)) {
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await characterRepository.removeFromSession({ sessionId: session.id, characterId });
      await reloadSession(session.id);
      setStatusMessage('La fiche a ete retiree de la partie.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de retirer la fiche de la partie.');
    } finally {
      setIsBusy(false);
    }
  };

  const refreshLocalActions = async () => {
    const refreshed = await localActionRepository.listAll();
    setLocalActions(refreshed);
  };

  const handleRunSyncNow = async () => {
    setIsRunningSync(true);
    setErrorMessage(null);
    try {
      const report = await runSyncCycle();
      setLastSyncReport(report);
      await refreshLocalActions();
      if (!navigator.onLine) {
        setStatusMessage('Appareil hors ligne : les actions restent en file locale.');
      } else if (report.conflicts > 0) {
        setStatusMessage('Synchronisation terminée avec conflits à résoudre.');
      } else if (report.synced > 0) {
        setStatusMessage(`${report.synced} action(s) locale(s) synchronisée(s).`);
      } else {
        setStatusMessage('Aucune nouvelle action à synchroniser.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de lancer la synchronisation.');
    } finally {
      setIsRunningSync(false);
    }
  };

  const handleRetryConflict = async (actionId: string) => {
    await localActionRepository.retryConflict(actionId);
    await refreshLocalActions();
    await handleRunSyncNow();
  };

  const handleIgnoreConflict = async (actionId: string) => {
    await localActionRepository.ignoreConflict(actionId);
    await refreshLocalActions();
    setStatusMessage('Conflit ignoré localement.');
  };

  const handleResolveConflictField = async (actionId: string, fieldName: string, strategy: 'keep_local' | 'keep_server') => {
    await localActionRepository.resolveConflictField(actionId, fieldName, strategy);
    await refreshLocalActions();
    setStatusMessage(strategy === 'keep_server' ? `Valeur serveur retenue pour ${fieldName}.` : `Valeur locale conservée pour ${fieldName}.`);
  };

  const activeSet = activeTemplate ? activeTemplate.sets.find((set) => set.id === requestedSetId) ?? activeTemplate.sets[0] ?? null : null;
  const detachedScreens = activeSet?.screens.filter((screen) => screen.mode === 'detached') ?? [];

  useEffect(() => {
    if (!activeTemplate) {
      setRuntimeSetId('');
      return;
    }
    const fallbackSetId = requestedSetId && activeTemplate.sets.some((set) => set.id === requestedSetId)
      ? requestedSetId
      : activeTemplate.sets[0]?.id ?? '';
    setRuntimeSetId((current) => (current && activeTemplate.sets.some((set) => set.id === current) ? current : fallbackSetId));
  }, [activeTemplate, requestedSetId]);

  useEffect(() => {
    if (!isRuntimeMode || !shouldAutoDetach || isDetachedRuntime || !activeTemplate || !activeSet || detachedScreens.length === 0 || !session) {
      return;
    }
    const storageKey = `runtime-detached:${session.id}:${activeTemplate.id}:${activeSet.id}`;
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return;
    }
    window.sessionStorage.setItem(storageKey, '1');
    detachedScreens.forEach((screen) => {
      const url = `/sessions/${session.id}?runtime=1&template=${activeTemplate.id}&set=${activeSet.id}&detachedScreen=${screen.id}`;
      window.open(url, '_blank', 'popup=yes,width=1440,height=900');
    });
  }, [activeSet, activeTemplate, detachedScreens, isDetachedRuntime, isRuntimeMode, session, shouldAutoDetach]);

  const buildRuntimeUrl = (options?: { autoFullscreen?: boolean }) => {
    if (!session || !activeTemplate) {
      return null;
    }
    const setId = runtimeSetId && activeTemplate.sets.some((set) => set.id === runtimeSetId)
      ? runtimeSetId
      : activeTemplate.sets[0]?.id ?? '';
    const params = new URLSearchParams();
    params.set('runtime', '1');
    params.set('template', activeTemplate.id);
    params.set('autoDetach', '1');
    if (options?.autoFullscreen) {
      params.set('autofullscreen', '1');
    }
    if (setId) {
      params.set('set', setId);
    }
    return `/sessions/${session.id}?${params.toString()}`;
  };

  const openRuntimeNow = async (markRunning: boolean) => {
    if (!session || !activeTemplate) {
      setErrorMessage('Aucun template d écran actif n est encore disponible pour cette partie.');
      setActiveTab('settings');
      return;
    }

    if (markRunning && canManage && session.state !== 'running') {
      const nextSession = { ...session, state: 'running' as Session['state'], updatedAt: new Date().toISOString() };
      try {
        await persistSession(nextSession, 'La séance est maintenant en cours.');
      } catch {
        return;
      }
    }

    const url = buildRuntimeUrl({ autoFullscreen: markRunning });
    if (url) {
      window.location.assign(url);
    }
  };

  const handleOpenRuntime = async (markRunning: boolean) => {
    if (activeTemplate && activeTemplate.sets.length > 1) {
      setPendingRuntimeLaunch({ markRunning });
      return;
    }
    await openRuntimeNow(markRunning);
  };

  if (isLoading) {
    return (
      <Layout>
        <section className="card">Chargement de la partie...</section>
      </Layout>
    );
  }

  if (errorMessage && !session) {
    return (
      <Layout>
        <section className="card" style={{ color: '#b42318' }}>
          {errorMessage}
        </section>
      </Layout>
    );
  }

  if (!session) {
    return <Navigate to="/sessions" replace />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const runtimeSection = activeTemplate ? (
    <ScreenTemplateRuntime
      session={session}
      template={activeTemplate}
      currentUser={currentUser}
      role={role}
      detachedScreenId={detachedScreenId}
      initialSetId={requestedSetId}
      autoFullscreen={autoFullscreen}
    />
  ) : (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Aucun template d'écran actif</h2>
      <p style={{ marginBottom: 0 }}>
        {role === 'gm'
          ? 'Assigne un template MJ ou sélectionne un template personnel pour afficher un vrai espace de travail.'
          : 'Le MJ n a pas encore proposé de template joueur. Tu peux aussi choisir un template personnel dans le catalogue.'}
      </p>
    </section>
  );

  if (isDetachedRuntime) {
    return (
      <Layout wide hideNavigation>
        <div className="screen-runtime-shell">{runtimeSection}</div>
      </Layout>
    );
  }

  if (isRuntimeMode) {
    return (
      <Layout wide hideNavigation>
        <div className="screen-runtime-shell">{runtimeSection}</div>
      </Layout>
    );
  }

  return (
    <Layout wide>
      <section className="card session-hero" style={{ marginBottom: '1rem' }}>
        <div className="session-inline-actions" style={{ marginBottom: '0.85rem', justifyContent: 'flex-start' }}>
          <Link to="/sessions">← Retour aux parties</Link>
        </div>
        <div className="session-page-header">
          <div className="session-page-header__title">
            <p className="home-section__eyebrow" style={{ marginBottom: '0.4rem' }}>PARTIE</p>
            <h1 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{session.name}</h1>
            <p style={{ marginBottom: 0 }}>
              Système : <strong>{sessionSystem?.name || session.systemId}</strong>
              {' '}· Rôle : <strong>{role === 'gm' ? 'MJ' : role === 'player' ? 'Joueur' : 'Observateur'}</strong>
            </p>
          </div>
          <div className="session-page-header__actions">
            {activeTemplate && activeTemplate.sets.length > 1 ? (
              <label className="session-launch-select">
                <span>Affichage</span>
                <select value={runtimeSetId} onChange={(event) => setRuntimeSetId(event.target.value)}>
                  {activeTemplate.sets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name} · {devicePresetLabel(set.devicePreset)} · {set.screens.length} écran(s)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canManage ? (
              <>
                {session.state !== 'running' ? (
                  <Button type="button" onClick={() => void handleOpenRuntime(true)}>
                    Démarrer la séance
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void persistSession({ ...session, state: 'paused', updatedAt: new Date().toISOString() }, 'La séance a été mise en pause.')}>
                    Mettre la séance en pause
                  </Button>
                )}
                {session.state === 'paused' ? (
                  <Button type="button" variant="secondary" onClick={() => void persistSession({ ...session, state: 'running', updatedAt: new Date().toISOString() }, 'La séance reprend.')}>
                    Reprendre la séance
                  </Button>
                ) : null}
                {session.state !== 'finished' ? (
                  <Button type="button" variant="secondary" onClick={() => void persistSession({ ...session, state: 'finished', updatedAt: new Date().toISOString() }, 'La séance est marquée comme terminée.')}>
                    Terminer la séance
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => void handleOpenRuntime(false)}>
              Ouvrir l'interface
            </Button>
            <Link className="button secondary" to="/screen-templates">
              Catalogue des écrans
            </Link>
            <Link className="button secondary" to="/resources">
              Ressources
            </Link>
            {detachedScreens.map((screen) => (
              <Button
                key={screen.id}
                type="button"
                variant="secondary"
                onClick={() => {
                  const url = `/sessions/${session.id}?runtime=1&template=${activeTemplate?.id ?? ''}&set=${activeSet?.id ?? ''}&detachedScreen=${screen.id}`;
                  window.open(url, '_blank', 'popup=yes,width=1440,height=900');
                }}
              >
                Détacher {screen.name}
              </Button>
            ))}
          </div>
          <div className="session-page-header__status">
            <div className="session-status-pill">{session.state}</div>
          </div>
        </div>
        {statusMessage ? <p className="home-alert home-alert--success" style={{ marginTop: '1rem', marginBottom: 0 }}>{statusMessage}</p> : null}
        {errorMessage ? <p className="home-alert home-alert--error" style={{ marginTop: '1rem', marginBottom: 0 }}>{errorMessage}</p> : null}
        {!isOnline ? <p className="home-alert" style={{ marginTop: '1rem', marginBottom: 0 }}>Mode hors ligne actif. Les changements restent locaux puis repartent à la reconnexion.</p> : null}
      </section>

      <nav className="card session-tab-bar" aria-label="Navigation de la partie">
        <button type="button" className={`session-tab-button${activeTab === 'general' ? ' is-active' : ''}`} onClick={() => setActiveTab('general')}>
          Général
        </button>
        <button type="button" className={`session-tab-button${activeTab === 'settings' ? ' is-active' : ''}`} onClick={() => setActiveTab('settings')}>
          Paramètres
        </button>
        <button type="button" className={`session-tab-button${activeTab === 'logs' ? ' is-active' : ''}`} onClick={() => setActiveTab('logs')}>
          Log et sécurité
        </button>
      </nav>

      {activeTab === 'general' ? (
        <div className="session-stack">
          <section className="card session-section">
            <div className="session-section__header">
              <div>
                <h2>Résumé de partie</h2>
                <p>Vue rapide de la table sans les réglages avancés.</p>
              </div>
            </div>
            <div className="session-summary-grid">
              <article className="session-summary-item">
                <span>État</span>
                <strong>{session.state}</strong>
              </article>
              <article className="session-summary-item">
                <span>Système</span>
                <strong>{sessionSystem?.name || session.systemId}</strong>
              </article>
              <article className="session-summary-item">
                <span>Participants</span>
                <strong>{generalParticipants.length}</strong>
              </article>
              <article className="session-summary-item">
                <span>Documents</span>
                <strong>{sessionResources.length}</strong>
              </article>
            </div>
            <p style={{ margin: 0 }}>{session.description || 'Aucune description pour le moment.'}</p>
          </section>

          <section className="card session-section">
            <div className="session-section__header">
              <div>
                <h2>Participants</h2>
                <p>Vue simple des personnes déjà présentes dans la partie.</p>
              </div>
            </div>
            <div className="session-participants-list">
              {generalParticipants.map((participant) => (
                <article key={participant.userId} className="session-participant-summary">
                  <div>
                    <strong>{participantLabel(participant)}</strong>
                    <small>@{participant.nickname || participant.userId}</small>
                  </div>
                  <span className="session-status-pill">{participant.role === 'gm' ? 'MJ' : participant.role === 'observer' ? 'Observateur' : 'Joueur'}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="card session-section">
            <div className="session-section__header">
              <div>
                <h2>Personnages</h2>
                <p>{canManage ? 'Tous les personnages PJ visibles pour le MJ.' : 'Tes personnages dans cette partie.'}</p>
              </div>
            </div>
            {(canManage || currentParticipant?.role === 'player') ? (
              <div className="card" style={{ marginBottom: '1rem', borderColor: '#38bdf8' }}>
                <h3 style={{ marginTop: 0 }}>{canManage ? 'Créer une fiche joueur' : 'Créer mon personnage'}</h3>
                <p style={{ marginTop: 0 }}>
                  {canManage
                    ? 'Tu peux lancer le parcours de création pour un joueur et construire sa fiche avec lui, par exemple en stream ou à table.'
                    : 'Tu peux créer plusieurs fiches si ton personnage evolue ou si tu as besoin d en separer certains aspects.'}
                </p>
                {unassignedPregenCharacters.length > 0 ? (
                  <p className="session-inline-note" style={{ marginTop: 0 }}>
                    {unassignedPregenCharacters.length} pre-tire{unassignedPregenCharacters.length > 1 ? 's sont' : ' est'} disponible{unassignedPregenCharacters.length > 1 ? 's' : ''} dans cette partie si le MJ prefere te fournir une base.
                  </p>
                ) : null}
                {playerCreationViews.length > 0 ? (
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
                    {canManage ? (
                      <label>
                        <span>Joueur cible</span>
                        <select value={guidedCharacterOwnerId} onChange={(event) => setGuidedCharacterOwnerId(event.target.value)} disabled={isBusy}>
                          <option value="">Sélectionner</option>
                          {guidedCreationParticipants.map((participant) => (
                            <option key={participant.userId} value={participant.userId}>
                              {participantLabel(participant)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      <span>Vue de fiche</span>
                      <select value={playerCharacterViewId} onChange={(event) => setPlayerCharacterViewId(event.target.value)} disabled={isBusy}>
                        {playerCreationViews.map((view) => (
                          <option key={view.id} value={view.id}>
                            {view.name}{view.isDefaultForPlayer ? ' · défaut joueur' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Nom du personnage</span>
                      <input value={playerCharacterName} onChange={(event) => setPlayerCharacterName(event.target.value)} placeholder="Nom du personnage" disabled={isBusy} />
                    </label>
                    <div style={{ display: 'grid', alignContent: 'end' }}>
                      {isGuidedCharacterCreationEnabled ? (
                        <Button type="button" onClick={() => setIsCharacterCreationWizardOpen(true)} disabled={isBusy || !playerCharacterViewId || (canManage && !guidedCharacterOwnerId)}>
                          Lancer la création guidée
                        </Button>
                      ) : (
                        <Button type="button" onClick={() => void (canManage ? handleCreateManagedCharacter() : handleCreateOwnCharacter())} disabled={isBusy || !playerCharacterViewId || (canManage && !guidedCharacterOwnerId)}>
                          {canManage ? 'Créer la fiche du joueur' : 'Créer ma fiche'}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ marginBottom: 0 }}>Le système ne propose pas encore de vue de fiche utilisable pour un joueur.</p>
                )}
              </div>
            ) : null}
            <div className="session-character-list">
              {generalCharacters.length === 0 ? <p style={{ margin: 0 }}>Aucun personnage à afficher dans cet onglet.</p> : null}
              {generalCharacters.map((character) => {
                const owner = (session.participants ?? []).find((participant) => participant.userId === character.ownerUserId);
                const sourceView = characterSheetViews.find((view) => view.id === character.viewId || view.id === character.createdFromViewId);
                return (
                  <article key={character.id} className="session-character-card">
                    <div className="session-character-card__meta">
                      <div className="session-character-card__heading">
                        <strong>{character.name}</strong>
                        <span className="session-character-kind-badge">{character.type || 'pc'}</span>
                      </div>
                      <span>Vue liée : {sourceView?.name || character.viewId}</span>
                      <small>Propriétaire : {owner ? participantLabel(owner) : 'Non attribué'}</small>
                    </div>
                    <div className="session-search-result-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => window.open(`/sessions/${session.id}/characters/${character.id}`, '_blank', 'noopener,noreferrer')}
                      >
                        Ouvrir la fiche
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="card session-section">
            <div className="session-section__header">
              <div>
                <h2>Documents de partie</h2>
                <p>Vue rapide de ce qui circule dans la session.</p>
              </div>
              <Link className="button secondary" to="/resources">Ouvrir la bibliothèque</Link>
            </div>
            <div className="session-resource-summary">
              <article className="session-metric"><strong>{sessionCommonDocuments}</strong><span>Commun</span></article>
              <article className="session-metric"><strong>{sessionGmDocuments}</strong><span>MJ uniquement</span></article>
              <article className="session-metric"><strong>{sessionPrivateDocuments}</strong><span>Ciblés / privés</span></article>
            </div>
            {sessionResources.length > 0 ? (
              <div className="session-character-list" style={{ marginTop: '1rem' }}>
                {sessionResources.slice(0, 6).map((resource) => (
                  <article key={resource.id} className="session-character-card">
                    <strong>{resource.name}</strong>
                    <span>{resource.kind}</span>
                    <small>{resource.sessionAudience || 'session_all'}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p style={{ marginBottom: 0 }}>Aucun document de session pour le moment.</p>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === 'settings' ? (
        <div className="session-layout">
          <div className="session-stack">
            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Options de la partie</h2>
                  <p>Nom, état, système de jeu et contexte général de la table.</p>
                </div>
                {canManage ? (
                  <Button type="button" onClick={() => void handleSaveSummary()} disabled={isBusy}>
                    Enregistrer
                  </Button>
                ) : null}
              </div>
              <div className="grid">
                <label>
                  <span>Nom</span>
                  <input value={summaryDraft.name} onChange={(event) => setSummaryDraft((current) => ({ ...current, name: event.target.value }))} disabled={!canManage} />
                </label>
                <label>
                  <span>État</span>
                  <select
                    value={summaryDraft.state}
                    onChange={(event) => setSummaryDraft((current) => ({ ...current, state: event.target.value as Session['state'] }))}
                    disabled={!canManage}
                  >
                    <option value="planned">Prévue</option>
                    <option value="running">En cours</option>
                    <option value="paused">En pause</option>
                    <option value="finished">Terminée</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Système de jeu</span>
                  <select
                    value={summaryDraft.systemId}
                    onChange={(event) => setSummaryDraft((current) => ({ ...current, systemId: event.target.value }))}
                    disabled={!canManage}
                  >
                    {systems.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={summaryDraft.description}
                    onChange={(event) => setSummaryDraft((current) => ({ ...current, description: event.target.value }))}
                    disabled={!canManage}
                  />
                </label>
              </div>
              <div className="session-inline-actions" style={{ marginTop: '0.75rem' }}>
                <span>Système actif : <strong>{sessionSystem?.name || 'Introuvable'}</strong></span>
                <span>Personnages sans joueur : <strong>{unassignedCharacters}</strong></span>
                <span>Participants sans fiche : <strong>{unassignedParticipants}</strong></span>
                {sessionSystem ? (
                  <Link className="button secondary" to={`/systems/${sessionSystem.id}/studio`}>
                    Ouvrir le studio système
                  </Link>
                ) : null}
              </div>
            </section>

            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Invitations et participants</h2>
                  <p>Résumé des invitations en attente et gestion des membres de la table.</p>
                </div>
              </div>
              {(session.invitations ?? []).length > 0 ? (
                <div className="session-participants-list" style={{ marginBottom: '1rem' }}>
                  {(session.invitations ?? []).map((invitation) => {
                    const isInvitee = invitation.userId === currentUser.id;
                    const canRespond = isInvitee && invitation.status === 'pending';
                    const canManageInvitation = canManage && invitation.status === 'pending';
                    return (
                      <article key={invitation.id} className="session-participant-row">
                        <div>
                          <strong>{invitationLabel(invitation)}</strong>
                          <small>
                            Invitation {invitation.status === 'pending' ? 'en attente' : invitation.status === 'accepted' ? 'acceptée' : 'refusée'}
                            {' '}· rôle proposé : {invitation.role}
                          </small>
                        </div>
                        <div>
                          <span>Invité par </span>
                          <strong>@{invitation.invitedByNickname || invitation.invitedByUserId}</strong>
                        </div>
                        <div className="session-inline-actions">
                          {canRespond ? (
                            <>
                              <Button type="button" variant="secondary" onClick={() => void handleInvitationResponse(invitation.id, 'decline')} disabled={isBusy}>
                                Refuser
                              </Button>
                              <Button type="button" onClick={() => void handleInvitationResponse(invitation.id, 'accept')} disabled={isBusy}>
                                Accepter
                              </Button>
                            </>
                          ) : canManageInvitation ? (
                            <>
                              <Button type="button" variant="secondary" onClick={() => void handleCancelInvitation(invitation.id)} disabled={isBusy}>
                                Annuler
                              </Button>
                              <Button type="button" onClick={() => void handleResendInvitation(invitation.id)} disabled={isBusy}>
                                Relancer
                              </Button>
                            </>
                          ) : (
                            <span className="session-status-pill">{invitation.status}</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0 }}>Aucune invitation en attente pour le moment.</p>
              )}

              <div className="session-participants-list">
                {(session.participants ?? []).map((participant) => (
                  <article key={participant.userId} className="session-participant-row">
                    <div>
                      <strong>{participantLabel(participant)}</strong>
                      <small>
                        @{participant.nickname || participant.userId}
                        {participant.characterId ? ` · fiche liee` : ' · aucune fiche'}
                      </small>
                    </div>
                    <label>
                      <span>Rôle</span>
                      <select
                        value={participant.role}
                        onChange={(event) => void handleParticipantRoleChange(participant.userId, event.target.value as SessionParticipant['role'])}
                        disabled={!canManage || participant.userId === session.ownerUserId}
                      >
                        <option value="gm">MJ</option>
                        <option value="player">Joueur</option>
                        <option value="observer">Observateur</option>
                      </select>
                    </label>
                    <label>
                      <span>Personnage</span>
                      <select
                        value={participant.characterId || ''}
                        onChange={(event) => void handleParticipantCharacterChange(participant.userId, event.target.value)}
                        disabled={!canManage}
                      >
                        <option value="">Aucun personnage</option>
                        {characters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canManage || (currentUser && participant.userId === currentUser.id && participant.userId !== session.ownerUserId) ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleRemoveParticipant(participant.userId)}
                        disabled={isBusy || participant.userId === session.ownerUserId}
                      >
                        {currentUser && participant.userId === currentUser.id ? 'Quitter la partie' : 'Retirer'}
                      </Button>
                    ) : null}
                  </article>
                ))}
              </div>

              {canManage ? (
                <div className="session-participant-search">
                  <div className="grid">
                    <label>
                      <span>Inviter un utilisateur</span>
                      <SocialUserAutocomplete
                        value={participantSearch}
                        onChange={(nextValue) => {
                          setParticipantSearch(nextValue);
                          if (!nextValue.trim()) {
                            setSelectedInviteUser(null);
                          }
                        }}
                        onSelect={(user) => {
                          setSelectedInviteUser(user);
                          setParticipantSearch(user.nickname || user.displayName);
                        }}
                        placeholder="Chercher un utilisateur approuvé"
                        hintMessage="Tape au moins 3 lettres pour voir les comptes disponibles."
                        filterResults={(results) => {
                          const excluded = new Set((session?.participants ?? []).map((participant) => participant.userId));
                          for (const invitation of session?.invitations ?? []) {
                            if (invitation.status === 'pending') {
                              excluded.add(invitation.userId);
                            }
                          }
                          if (currentUser?.id) {
                            excluded.add(currentUser.id);
                          }
                          return results.filter((user) => !excluded.has(user.id));
                        }}
                      />
                    </label>
                    <label>
                      <span>Rôle par défaut à l'ajout</span>
                      <select value={participantRoleDraft} onChange={(event) => setParticipantRoleDraft(event.target.value as SessionParticipant['role'])}>
                        <option value="player">Joueur</option>
                        <option value="gm">MJ</option>
                        <option value="observer">Observateur</option>
                      </select>
                    </label>
                  </div>
                  {selectedInviteUser ? (
                    <div className="session-search-result-card">
                      <div>
                        <strong>{selectedInviteUser.displayName}</strong>
                        <span>@{selectedInviteUser.nickname || selectedInviteUser.id}</span>
                      </div>
                      <div className="session-search-result-actions">
                        <Button type="button" variant="secondary" onClick={() => void handleInviteParticipant(selectedInviteUser, 'player')}>
                          Inviter joueur
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => void handleInviteParticipant(selectedInviteUser, 'observer')}>
                          Inviter observateur
                        </Button>
                        <Button type="button" onClick={() => void handleInviteParticipant(selectedInviteUser, 'gm')}>
                          Inviter MJ
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ margin: 0 }}>Choisis un compte dans la liste proposée, puis invite-le avec le rôle voulu.</p>
                  )}
                </div>
              ) : null}
            </section>

            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Salon Discord de partie</h2>
                  <p>Le bot crée et synchronise le salon privé de cette partie sur le serveur Discord indiqué.</p>
                </div>
              </div>
              {currentUser?.discordAccount ? (
                <>
                  <div className="grid">
                    {discordMutualGuilds.length > 0 ? (
                      <label style={{ gridColumn: '1 / -1' }}>
                        <span>Serveur Discord partagé avec le bot</span>
                        <select
                          value={discordGuildIdDraft}
                          onChange={(event) => setDiscordGuildIdDraft(event.target.value)}
                          disabled={!canManage || isBusy}
                        >
                          <option value="">Choisir un serveur</option>
                          {discordMutualGuilds.map((guild) => (
                            <option key={guild.id} value={guild.id}>
                              {guild.name} · {guild.id}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label style={{ gridColumn: '1 / -1' }}>
                      <span>{discordMutualGuilds.length > 0 ? 'ID manuel du serveur Discord' : 'Serveur Discord (ID)'}</span>
                      <input
                        value={discordGuildIdDraft}
                        onChange={(event) => setDiscordGuildIdDraft(event.target.value)}
                        disabled={!canManage || isBusy}
                        placeholder="Exemple : 140406786349648557"
                      />
                    </label>
                  </div>
                  <div className="session-inline-actions" style={{ marginTop: '0.75rem' }}>
                    <span>
                      Compte Discord lié : <strong>{currentUser.discordAccount.globalName || currentUser.discordAccount.username || currentUser.discordAccount.id}</strong>
                    </span>
                    <a className="button secondary" href="https://bot.nexusforge.en-ligne.fr" target="_blank" rel="noreferrer">
                      Ouvrir le dashboard du bot
                    </a>
                    {canManage ? (
                      <Button type="button" onClick={() => void handleLinkDiscordChannel()} disabled={isBusy}>
                        Créer / synchroniser le salon
                      </Button>
                    ) : null}
                    {canManage && session.discordIntegration?.guildId ? (
                      <Button type="button" variant="secondary" onClick={() => void handleUnlinkDiscordChannel()} disabled={isBusy}>
                        Retirer la liaison
                      </Button>
                    ) : null}
                  </div>
                  <div className="session-inline-actions" style={{ marginTop: '0.5rem', alignItems: 'start' }}>
                    <span>Serveur lié : <strong>{session.discordIntegration?.guildId || 'Aucun'}</strong></span>
                    <span>Statut : <strong>{session.discordIntegration?.status || 'Aucun'}</strong></span>
                    <span>Salon : <strong>{session.discordIntegration?.channelName || session.discordIntegration?.channelId || 'Pas encore créé'}</strong></span>
                  </div>
                  <p className="session-inline-note" style={{ marginBottom: 0 }}>
                    La catégorie des salons de partie se configure dans le dashboard du bot. Quand possible, Nexus Forge te propose directement les serveurs où ton compte Discord et le bot sont présents ensemble.
                  </p>
                </>
              ) : (
                <p style={{ marginBottom: 0 }}>
                  Lie d abord ton compte Discord depuis ton profil Nexus Forge pour activer la gestion des salons de partie.
                </p>
              )}
            </section>
          </div>

          <div className="session-stack">
            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Écrans de la partie</h2>
                  <p>Templates par défaut de la table et sélection personnelle de l'utilisateur courant.</p>
                </div>
              </div>
              {activeTemplate ? (
                <div className="session-inline-actions" style={{ marginBottom: '0.75rem' }}>
                  <span>Template actif : <strong>{activeTemplate.name}</strong></span>
                  <label className="session-launch-select">
                    <span>Set de lancement</span>
                    <select value={runtimeSetId} onChange={(event) => setRuntimeSetId(event.target.value)}>
                      {activeTemplate.sets.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name} · {devicePresetLabel(set.devicePreset)} · {set.screens.length} écran(s)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="grid">
                <label>
                  <span>Mon template actif ({role === 'gm' ? 'MJ' : 'Joueur'})</span>
                  <select
                    value={activeTemplate?.id ?? ''}
                    onChange={(event) => {
                      const nextSession: Session = {
                        ...session,
                        screenTemplateSelections: {
                          ...(session.screenTemplateSelections ?? {}),
                          [currentUser.id]: {
                            ...(session.screenTemplateSelections?.[currentUser.id] ?? {}),
                            [role === 'gm' ? 'gmTemplateId' : 'playerTemplateId']: event.target.value || null
                          }
                        },
                        updatedAt: new Date().toISOString()
                      };
                      void persistSession(nextSession, 'Template actif mis à jour.');
                    }}
                    disabled={isBusy}
                  >
                    <option value="">Utiliser le template proposé</option>
                    {roleTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                {role === 'player' && assignedTemplateId ? (
                  <div style={{ display: 'grid', alignContent: 'end', gap: '0.4rem' }}>
                    <span>Template joueur proposé par le MJ</span>
                    <Button type="button" variant="secondary" onClick={() => void handleCloneAssignedTemplate()} disabled={isBusy}>
                      Cloner dans mes templates
                    </Button>
                  </div>
                ) : null}
              </div>
              {canManage ? (
                <div className="grid" style={{ marginTop: '1rem' }}>
                  <label>
                    <span>Template par défaut MJ</span>
                    <select
                      value={session.screenTemplateAssignments?.gmTemplateId ?? ''}
                      onChange={(event) => {
                        const nextSession: Session = {
                          ...session,
                          screenTemplateAssignments: {
                            ...(session.screenTemplateAssignments ?? {}),
                            gmTemplateId: event.target.value || null,
                            playerTemplateId: session.screenTemplateAssignments?.playerTemplateId ?? null
                          },
                          updatedAt: new Date().toISOString()
                        };
                        void persistSession(nextSession, 'Template MJ de partie mis à jour.');
                      }}
                      disabled={isBusy}
                    >
                      <option value="">Aucun template MJ</option>
                      {gmAssignableTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Template proposé aux joueurs</span>
                    <select
                      value={session.screenTemplateAssignments?.playerTemplateId ?? ''}
                      onChange={(event) => {
                        const nextSession: Session = {
                          ...session,
                          screenTemplateAssignments: {
                            ...(session.screenTemplateAssignments ?? {}),
                            gmTemplateId: session.screenTemplateAssignments?.gmTemplateId ?? null,
                            playerTemplateId: event.target.value || null
                          },
                          updatedAt: new Date().toISOString()
                        };
                        void persistSession(nextSession, 'Template joueur de partie mis à jour.');
                      }}
                      disabled={isBusy}
                    >
                      <option value="">Aucun template joueur</option>
                      {playerAssignableTemplates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </section>

            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Règles de table</h2>
                  <p>Les permissions de communication et de partage se règlent au niveau de la partie.</p>
                </div>
                {canManage ? (
                  <Button type="button" onClick={() => void handleSaveSettings()} disabled={isBusy}>
                    Enregistrer
                  </Button>
                ) : null}
              </div>
              <div className="form">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.allowPlayerToEditCharacterOffline)}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, allowPlayerToEditCharacterOffline: event.target.checked }))}
                    disabled={!canManage}
                  />{' '}
                  Joueurs : édition de fiche hors ligne
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.allowPlayerToPlayerChat)}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, allowPlayerToPlayerChat: event.target.checked }))}
                    disabled={!canManage}
                  />{' '}
                  Joueurs : chat direct entre joueurs
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.allowPlayerToPlayerDocuments)}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, allowPlayerToPlayerDocuments: event.target.checked }))}
                    disabled={!canManage}
                  />{' '}
                  Joueurs : partage de documents entre joueurs
                </label>
                <label>
                  <span>Mode silence</span>
                  <select value={settingsDraft.silenceMode || 'off'} onChange={(event) => setSettingsDraft((current) => ({ ...current, silenceMode: event.target.value as SessionSettings['silenceMode'] }))} disabled={!canManage}>
                    <option value="off">Off</option>
                    <option value="noGlobal">Sans salon global</option>
                    <option value="playersToPlayersBlocked">Joueur ↔ joueur bloqué</option>
                    <option value="full">Silence complet</option>
                  </select>
                </label>
                <label>
                  <span>Initiative</span>
                  <select
                    value={initiativeConfigDraft.mode}
                    onChange={(event) =>
                      setInitiativeConfigDraft((current) => ({
                        ...current,
                        mode: event.target.value as SessionInitiativeConfig['mode']
                      }))
                    }
                    disabled={!canManage}
                  >
                    <option value="system_default">Suivre le système</option>
                    <option value="combat_once">Calcul au début du combat</option>
                    <option value="round_recalc">Recalcul à chaque round</option>
                    <option value="gm_fixed">Valeurs arbitraires MJ</option>
                    <option value="manual_turn">Tour par désignation</option>
                  </select>
                </label>
                {initiativeConfigDraft.mode === 'combat_once' || initiativeConfigDraft.mode === 'round_recalc' ? (
                  <label>
                    <span>Formule initiative forcée</span>
                    <input
                      type="text"
                      value={initiativeConfigDraft.formula ?? ''}
                      onChange={(event) =>
                        setInitiativeConfigDraft((current) => ({
                          ...current,
                          formula: event.target.value
                        }))
                      }
                      disabled={!canManage}
                      placeholder="@dexterite + @initiative_bonus"
                    />
                  </label>
                ) : null}
              </div>
            </section>

            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Personnages de la partie</h2>
                  <p>Gestion complète des PJ, PNJ et créatures depuis l’onglet paramètres.</p>
                </div>
              </div>
              <div className="session-character-list">
                {characters.length === 0 ? <p style={{ margin: 0 }}>Aucun personnage dans cette partie pour le moment.</p> : null}
                {characters.map((character) => {
                  const owner = (session.participants ?? []).find((participant) => participant.userId === character.ownerUserId);
                  const draft = characterDrafts[character.id] ?? { name: character.name, type: character.type || 'pc', ownerUserId: character.ownerUserId || '' };
                  const sourceView = characterSheetViews.find((view) => view.id === character.viewId || view.id === character.createdFromViewId);
                  const canDeletePermanently = currentUser
                    ? canDeleteCharacterPermanently({ character, currentUserId: currentUser.id, canManage, isAdmin })
                    : false;
                  const canRemoveFromSession = currentUser
                    ? canRemoveCharacterFromSession({ character, currentUserId: currentUser.id, canManage, isAdmin })
                    : false;
                  return (
                    <article key={character.id} className="session-character-card">
                      <div className="session-character-card__meta">
                        <div className="session-character-card__heading">
                          <strong>{character.name}</strong>
                          <span className="session-character-badge">{getCharacterLifecycleLabel(character)}</span>
                          <span className="session-character-kind-badge">{character.type || 'pc'}</span>
                        </div>
                        <span>{character.type || 'pc'} · vue {sourceView?.name || character.viewId}</span>
                        <small>Propriétaire : {owner ? participantLabel(owner) : 'Non attribué'}</small>
                      </div>
                      {canManage ? (
                        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                          <label>
                            <span>Nom</span>
                            <input
                              value={draft.name}
                              onChange={(event) =>
                                setCharacterDrafts((current) => ({
                                  ...current,
                                  [character.id]: { ...draft, name: event.target.value }
                                }))
                              }
                            />
                          </label>
                          <label>
                            <span>Type</span>
                            <select
                              value={draft.type || 'pc'}
                              onChange={(event) =>
                                setCharacterDrafts((current) => ({
                                  ...current,
                                  [character.id]: { ...draft, type: event.target.value as Character['type'] }
                                }))
                              }
                            >
                              <option value="pc">PJ</option>
                              <option value="npc">PNJ</option>
                              <option value="monster">Monstre</option>
                              <option value="other">Autre</option>
                            </select>
                          </label>
                          <label>
                            <span>Attribué à</span>
                            <select
                              value={draft.ownerUserId}
                              onChange={(event) =>
                                setCharacterDrafts((current) => ({
                                  ...current,
                                  [character.id]: { ...draft, ownerUserId: event.target.value }
                                }))
                              }
                            >
                              <option value="">Non attribué</option>
                              {(session.participants ?? [])
                                .filter((participant) => participant.role !== 'observer')
                                .map((participant) => (
                                  <option key={participant.userId} value={participant.userId}>
                                    {participantLabel(participant)}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </div>
                      ) : null}
                      {canManage || canDeletePermanently || canRemoveFromSession ? (
                        <div className="session-search-result-actions">
                          {canManage ? (
                            <Button type="button" variant="secondary" onClick={() => void handleSaveCharacter(character.id)} disabled={isBusy}>
                              Enregistrer
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => window.open(`/sessions/${session.id}/characters/${character.id}`, '_blank', 'noopener,noreferrer')}
                          >
                            Ouvrir la fiche
                          </Button>
                          {canRemoveFromSession ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void handleRemoveCharacterFromSession(character.id)}
                              disabled={isBusy}
                            >
                              Retirer de la partie
                            </Button>
                          ) : null}
                          {canDeletePermanently ? (
                            <Button type="button" variant="secondary" onClick={() => void handleDeleteCharacter(character.id)} disabled={isBusy}>
                              Supprimer définitivement
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                      {canManage && !character.ownerUserId ? (
                        <div className="grid" style={{ marginTop: '0.75rem', gridTemplateColumns: 'minmax(220px,1fr) auto' }}>
                          <label>
                            <span>Dupliquer pour</span>
                            <select
                              value={pregenCloneTargets[character.id] ?? ''}
                              onChange={(event) =>
                                setPregenCloneTargets((current) => ({
                                  ...current,
                                  [character.id]: event.target.value
                                }))
                              }
                            >
                              <option value="">Choisir un joueur</option>
                              {(session.participants ?? [])
                                .filter((participant) => participant.role === 'player')
                                .map((participant) => (
                                  <option key={participant.userId} value={participant.userId}>
                                    {participantLabel(participant)}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <div style={{ display: 'grid', alignContent: 'end' }}>
                            <Button type="button" onClick={() => void handleClonePregenCharacter(character.id)} disabled={isBusy || !pregenCloneTargets[character.id]}>
                              Dupliquer et attribuer
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              {canManage && characterSheetViews.length > 0 ? (
                <div className="grid" style={{ marginTop: '1rem' }}>
                  <div className="session-character-template-grid" style={{ gridColumn: '1 / -1' }}>
                    {([
                      ['pc', 'Créer un PJ', 'Fiche destinée à un joueur, attribuable ensuite.'],
                      ['npc', 'Créer un PNJ', 'Fiche MJ pour allié, contact ou personnage secondaire.'],
                      ['creature', 'Créer une créature', 'Fiche MJ pour monstre, familier ou créature domptable.']
                    ] as const).map(([kind, label, description]) => {
                      const views = characterSheetViewsByKind[kind];
                      return (
                        <article key={kind} className="session-character-template-card">
                          <strong>{label}</strong>
                          <p>{description}</p>
                          <select
                            value={characterTemplateId && views.some((view) => view.id === characterTemplateId) ? characterTemplateId : ''}
                            onChange={(event) => handleSelectCharacterTemplate(event.target.value)}
                          >
                            <option value="">Choisir une vue</option>
                            {views.map((view) => (
                              <option key={view.id} value={view.id}>
                                {view.name}
                              </option>
                            ))}
                          </select>
                        </article>
                      );
                    })}
                  </div>
                  <label>
                    <span>Vue de fiche personnage</span>
                    <select value={characterTemplateId} onChange={(event) => handleSelectCharacterTemplate(event.target.value)}>
                      <option value="">Choisir un modèle</option>
                      {characterSheetViews.map((view) => (
                        <option key={view.id} value={view.id}>
                          {view.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Attribuer à</span>
                    <select value={characterOwnerId} onChange={(event) => setCharacterOwnerId(event.target.value)}>
                      <option value="">Non attribué</option>
                      {(session.participants ?? []).filter((participant) => participant.role !== 'observer').map((participant) => (
                        <option key={participant.userId} value={participant.userId}>
                          {participantLabel(participant)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Nom du personnage</span>
                    <input value={characterName} onChange={(event) => setCharacterName(event.target.value)} placeholder="Optionnel" />
                  </label>
                  <div style={{ display: 'grid', alignContent: 'end' }}>
                    <Button type="button" onClick={() => void handleCreateCharacter()} disabled={isBusy || !characterTemplateId}>
                      Créer le personnage
                    </Button>
                  </div>
                </div>
              ) : canManage ? <p style={{ marginTop: '1rem', marginBottom: 0 }}>Aucune vue de fiche personnage n est encore marquée dans le Studio Système.</p> : null}
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === 'logs' ? (
        <div className="session-layout">
          <div className="session-stack">
            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Journal de table</h2>
                  <p>Fil rapide des principales actions de la partie pour aider le MJ a garder le contexte.</p>
                </div>
              </div>
              {(session.activityLog ?? []).length > 0 ? (
                <div className="session-activity-list">
                  {(session.activityLog ?? []).slice(0, 20).map((entry) => (
                    <article key={entry.id} className="session-activity-card">
                      <div className="session-inline-actions">
                        <strong>{formatSessionActivityLabel(entry)}</strong>
                        <span className="session-activity-date">
                          {new Date(entry.createdAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      {entry.message && entry.message !== formatSessionActivityLabel(entry) ? (
                        <small>{entry.message}</small>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p style={{ marginBottom: 0 }}>Aucune action importante n a encore ete enregistree dans cette partie.</p>
              )}
            </section>
          </div>

          <div className="session-stack">
            <section className="card session-section">
              <div className="session-section__header">
                <div>
                  <h2>Journal de synchronisation et conflits</h2>
                  <p>Suivi de la file locale de cette partie pour rester à l'aise en mode hors ligne.</p>
                </div>
                <Button type="button" variant="secondary" onClick={() => void handleRunSyncNow()} disabled={isRunningSync}>
                  {isRunningSync ? 'Synchronisation…' : 'Lancer une synchronisation'}
                </Button>
              </div>
              <div className="session-inline-actions" style={{ alignItems: 'start', marginBottom: '1rem', gap: '1rem' }}>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <strong>Cache hors ligne</strong>
                  <span>{formatOfflineBundleStatus(offlineBundle)}</span>
                  {offlineBundle?.lastHydratedAt ? (
                    <small>
                      Dernière préparation :{' '}
                      {new Date(offlineBundle.lastHydratedAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </small>
                  ) : null}
                </div>
                <div className="session-search-result-actions">
                  <Button type="button" variant="secondary" onClick={() => void handlePrepareOffline()} disabled={isPreparingOffline}>
                    {isPreparingOffline ? 'Préparation…' : offlineBundle ? 'Rafraîchir le cache hors ligne' : 'Préparer le cache hors ligne'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void handlePurgeOfflineCache()} disabled={isPurgingOfflineCache}>
                    {isPurgingOfflineCache ? 'Nettoyage…' : 'Nettoyer le cache'}
                  </Button>
                </div>
              </div>
              <div className="session-resource-summary">
                <article className="session-metric"><strong>{pendingActionCount}</strong><span>En attente</span></article>
                <article className="session-metric"><strong>{failedActionCount}</strong><span>En échec</span></article>
                <article className="session-metric"><strong>{conflictActions.length}</strong><span>Conflits</span></article>
                <article className="session-metric"><strong>{offlineBundle?.resources.filter((item) => item.downloadStatus === 'downloaded').length ?? 0}</strong><span>Téléchargées</span></article>
              </div>
              {lastSyncReport ? (
                <p style={{ margin: 0 }}>
                  Dernier cycle : {lastSyncReport.processed} traitée(s), {lastSyncReport.synced} synchronisée(s), {lastSyncReport.conflicts} conflit(s), {lastSyncReport.failed} échec(s).
                </p>
              ) : null}
              {conflictActions.length === 0 ? (
                <p style={{ marginBottom: 0 }}>Aucun conflit détecté pour cette partie pour le moment.</p>
              ) : (
                <div className="session-conflict-list">
                  {conflictActions.map((action) => (
                    <article key={action.id} className="session-conflict-card">
                      <div className="session-inline-actions">
                        <div>
                          <strong>{action.entityType} · {action.actionType}</strong>
                          <small>{action.syncError || 'Conflit de synchronisation.'}</small>
                        </div>
                        <div className="session-search-result-actions">
                          <Button type="button" variant="secondary" onClick={() => void handleRetryConflict(action.id)}>
                            Rejouer
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => void handleIgnoreConflict(action.id)}>
                            Ignorer
                          </Button>
                        </div>
                      </div>
                      {(action.conflictFields ?? []).length > 0 ? (
                        <div className="session-conflict-fields">
                          {(action.conflictFields ?? []).map((fieldName) => (
                            <div key={fieldName} className="session-conflict-field">
                              <span>{fieldName}</span>
                              <div className="session-search-result-actions">
                                <Button type="button" variant="secondary" onClick={() => void handleResolveConflictField(action.id, fieldName, 'keep_local')}>
                                  Garder local
                                </Button>
                                <Button type="button" variant="secondary" onClick={() => void handleResolveConflictField(action.id, fieldName, 'keep_server')}>
                                  Garder serveur
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
      {isCharacterCreationWizardOpen && session && sessionSystem && currentUser ? (
        <SessionCharacterCreationWizard
          open={isCharacterCreationWizardOpen}
          system={sessionSystem}
          session={session}
          view={playerCreationViews.find((item) => item.id === playerCharacterViewId) ?? playerCreationViews[0]}
          currentUser={currentUser}
          subjectUser={
            canManage
              ? (() => {
                  const participant = (session.participants ?? []).find((item) => item.userId === guidedCharacterOwnerId);
                  return participant
                    ? {
                        id: participant.userId,
                        displayName: participant.displayName || participant.userId,
                        nickname: participant.nickname || participant.userId
                      }
                    : null;
                })()
              : currentUser
          }
          initialCharacterName={playerCharacterName}
          onClose={() => setIsCharacterCreationWizardOpen(false)}
          onComplete={handleCompleteGuidedCharacterCreation}
        />
      ) : null}
      {pendingRuntimeLaunch && activeTemplate ? (
        <div className="resource-preview-modal" role="dialog" aria-modal="true" onClick={() => setPendingRuntimeLaunch(null)}>
          <div className="resource-preview-modal__dialog resource-action-modal resource-action-modal--compact" onClick={(event) => event.stopPropagation()}>
            <div className="resource-preview-modal__header">
              <div>
                <strong>Choisir un set d'écran</strong>
                <p style={{ margin: '0.35rem 0 0' }}>
                  Sélectionne le set à ouvrir pour le runtime de cette partie.
                </p>
              </div>
            </div>
            <div className="resource-preview-modal__body" style={{ display: 'grid', gap: '1rem' }}>
              <label className="session-launch-select">
                <span>Set à lancer</span>
                <select value={runtimeSetId} onChange={(event) => setRuntimeSetId(event.target.value)}>
                  {activeTemplate.sets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.name} · {devicePresetLabel(set.devicePreset)} · {set.screens.length} écran(s)
                    </option>
                  ))}
                </select>
              </label>
              <div className="session-search-result-actions" style={{ justifyContent: 'flex-end' }}>
                <Button type="button" variant="secondary" onClick={() => setPendingRuntimeLaunch(null)}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const launch = pendingRuntimeLaunch;
                    setPendingRuntimeLaunch(null);
                    if (launch) {
                      void openRuntimeNow(launch.markRunning);
                    }
                  }}
                >
                  Lancer ce set
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
