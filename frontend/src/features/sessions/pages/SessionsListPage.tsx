import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { useAuth } from '../../../hooks/useAuth';
import { Session } from '../../../types/session';
import { screenTemplateRepository, sessionRepository, systemRepository } from '../../../data/repositories';
import { GameSystem } from '../../../types/system';
import { canUseSystemForSession } from '../../../data/repositories/systemRepository';
import { useI18n } from '../../../hooks/useI18n';

const DEFAULT_TEMPLATE: NonNullable<Session['settings']> = {
  allowPlayerToEditCharacterOffline: true,
  allowPlayerToPlayerChat: true,
  allowPlayerToPlayerDocuments: true,
  silenceMode: 'off',
  alertBannerSystemMessageTypes: ['combat_start', 'turn', 'combat_end', 'roll']
};

function canDeleteSession(session: Session, userId: string | undefined, isAdmin: boolean): boolean {
  if (!userId) {
    return false;
  }
  if (isAdmin) {
    return true;
  }

  return session.ownerUserId === userId || session.gmUserId === userId;
}

function canManageSession(session: Session, userId: string | undefined, isAdmin: boolean): boolean {
  if (!userId) {
    return false;
  }
  if (isAdmin) {
    return true;
  }
  return session.ownerUserId === userId || session.gmUserId === userId || (session.gmUserIds || []).includes(userId);
}

function participantLabel(session: Session, userId: string | undefined | null, unknownLabel: string): string {
  if (!userId) {
    return unknownLabel;
  }
  const participant = (session.participants ?? []).find((item) => item.userId === userId);
  return participant?.nickname || participant?.displayName || userId;
}

function gmLabels(session: Session, unknownLabel: string): string {
  return (session.gmUserIds || [session.gmUserId]).map((userId) => participantLabel(session, userId, unknownLabel)).join(', ');
}

const ALERT_BANNER_SYSTEM_TYPE_OPTIONS: Array<{
  value: NonNullable<NonNullable<Session['settings']>['alertBannerSystemMessageTypes']>[number];
}> = [
  { value: 'combat_start' },
  { value: 'turn' },
  { value: 'combat_end' },
  { value: 'roll' },
  { value: 'round' }
];

export default function SessionsListPage() {
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [systemIdDraft, setSystemIdDraft] = useState('');
  const [settingsDraft, setSettingsDraft] = useState<NonNullable<Session['settings']>>(DEFAULT_TEMPLATE);
  const [systemScreenTemplates, setSystemScreenTemplates] = useState<{ gm: string | null; player: string | null }>({ gm: null, player: null });

  const isAdmin = Boolean(currentUser?.roles.includes('admin'));
  const canCreateSessions = Boolean(currentUser?.roles.includes('gm') || currentUser?.roles.includes('admin'));

  const systemsById = useMemo(() => {
    return new Map(systems.map((system) => [system.id, system]));
  }, [systems]);

  const selectedSystemName = (systemId: string) => systemsById.get(systemId)?.name ?? systemId;
  const selectedSystemDraft = systemsById.get(systemIdDraft);
  const stateLabel = (state: Session['state']) => t(`parties.state.${state}`);
  const roleLabel = (role: string) =>
    role === 'gm' ? t('parties.role.gm') : role === 'player' ? t('parties.role.player') : role;
  const discordInviteStatus = searchParams.get('discordInvite');
  const pendingInvitations = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return sessions.flatMap((session) =>
      (session.invitations ?? [])
        .filter((invitation) => invitation.userId === currentUser.id && invitation.status === 'pending')
        .map((invitation) => ({ session, invitation }))
    );
  }, [currentUser, sessions]);

  const visibleSessions = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    const stateWeight: Record<Session['state'], number> = {
      running: 0,
      planned: 1,
      paused: 2,
      finished: 3
    };

    return sessions
      .filter((session) => (session.participants || []).some((participant) => participant.userId === currentUser.id))
      .sort((left, right) => {
        if (Boolean(left.archivedAt) !== Boolean(right.archivedAt)) {
          return left.archivedAt ? 1 : -1;
        }
        const stateDelta = (stateWeight[left.state] ?? 99) - (stateWeight[right.state] ?? 99);
        if (stateDelta !== 0) {
          return stateDelta;
        }
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [currentUser, sessions]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [localSessions, availableSystems] = await Promise.all([
          sessionRepository.list({ includeArchived }),
          currentUser ? systemRepository.listAvailableForUser(currentUser) : Promise.resolve([])
        ]);

        if (!isMounted) {
          return;
        }

        setSessions(localSessions);
        const playableSystems = currentUser ? availableSystems.filter((system) => canUseSystemForSession(system, currentUser)) : [];
        setSystems(playableSystems);
        setSystemIdDraft((current) => current || playableSystems[0]?.id || '');
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les parties.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [currentUser, includeArchived]);

  useEffect(() => {
    let mounted = true;
    async function loadSystemTemplates() {
      if (!systemIdDraft) {
        if (mounted) {
          setSystemScreenTemplates({ gm: null, player: null });
        }
        return;
      }
      try {
        const templates = await screenTemplateRepository.listForSystem(systemIdDraft);
        if (!mounted) {
          return;
        }
        const sorted = [...templates].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        setSystemScreenTemplates({
          gm: sorted.find((template) => template.roleTarget === 'gm' || template.roleTarget === 'both')?.name ?? null,
          player: sorted.find((template) => template.roleTarget === 'player' || template.roleTarget === 'both')?.name ?? null
        });
      } catch {
        if (mounted) {
          setSystemScreenTemplates({ gm: null, player: null });
        }
      }
    }
    void loadSystemTemplates();
    return () => {
      mounted = false;
    };
  }, [systemIdDraft]);

  useEffect(() => {
    if (!discordInviteStatus) {
      return;
    }

    if (discordInviteStatus === 'expired') {
      setErrorMessage(t('parties.discord.expired'));
      setStatusMessage(null);
    } else if (discordInviteStatus === 'invalid') {
      setErrorMessage(t('parties.discord.invalid'));
      setStatusMessage(null);
    } else if (discordInviteStatus === 'accepted') {
      setStatusMessage(t('parties.discord.accepted'));
      setErrorMessage(null);
    } else if (discordInviteStatus === 'declined') {
      setStatusMessage(t('parties.discord.declined'));
      setErrorMessage(null);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('discordInvite');
    navigate(
      {
        pathname: '/sessions',
        search: nextParams.toString() ? `?${nextParams.toString()}` : ''
      },
      { replace: true }
    );
  }, [discordInviteStatus, navigate, searchParams]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !systemIdDraft) {
      return;
    }

    setErrorMessage(null);
    setIsCreating(true);

    try {
      const created = await sessionRepository.create({
        name: nameDraft,
        description: descriptionDraft,
        systemId: systemIdDraft,
        ownerUserId: currentUser.id,
        settings: settingsDraft
      });
      setSessions((previous) => [created, ...previous]);
      setNameDraft('');
      setDescriptionDraft('');
      setSettingsDraft(DEFAULT_TEMPLATE);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de créer la partie.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleArchive = async (session: Session) => {
    try {
      const updated = await sessionRepository.archive(session.id);
      if (!updated) {
        return;
      }
      setSessions((previous) => previous.map((item) => (item.id === updated.id ? updated : item)).filter((item) => includeArchived || !item.archivedAt));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Archivage impossible.');
    }
  };

  const handleRestore = async (session: Session) => {
    try {
      const updated = await sessionRepository.restore(session.id);
      if (!updated) {
        return;
      }
      setSessions((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Restauration impossible.');
    }
  };

  const handleDelete = async (session: Session) => {
    if (!currentUser) {
      return;
    }

    const confirmed = window.confirm(`${t('parties.deleteConfirm')} « ${session.name} » ?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);

    try {
      await sessionRepository.remove(session);
      setSessions((previous) => previous.filter((item) => item.id !== session.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de supprimer la partie.');
    }
  };

  const handleInvitationResponse = async (session: Session, invitationId: string, response: 'accept' | 'decline') => {
    try {
      const updated = await sessionRepository.respondToInvitation({
        sessionId: session.id,
        invitationId,
        response
      });
      if (!updated) {
        return;
      }
      setSessions((previous) => previous.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de répondre à l’invitation.');
    }
  };

  return (
    <Layout>
      <header>
        <h1>{t('parties.title')}</h1>
        <p style={{ marginTop: 0 }}>
          {t('parties.connectedAs')} {currentUser?.displayName}
        </p>
      </header>

      {pendingInvitations.length > 0 ? (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>{t('parties.invite.title')}</h2>
          <div className="session-participants-list">
            {pendingInvitations.map(({ session, invitation }) => (
              <article key={invitation.id} className="session-participant-row">
                <div>
                  <strong>{session.name}</strong>
                  <small>
                    {selectedSystemName(session.systemId)} · {t('parties.invite.role')} {roleLabel(invitation.role)}
                  </small>
                </div>
                <div>
                  <span>{t('parties.invite.by')} </span>
                  <strong>@{invitation.invitedByNickname || invitation.invitedByUserId}</strong>
                </div>
                <div className="session-inline-actions">
                  <Button type="button" variant="secondary" onClick={() => void handleInvitationResponse(session, invitation.id, 'decline')}>
                    {t('parties.invite.decline')}
                  </Button>
                  <Button type="button" onClick={() => void handleInvitationResponse(session, invitation.id, 'accept')}>
                    {t('parties.invite.accept')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{t('parties.mine.title')}</h2>
          <label style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center' }}>
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            {t('parties.showArchived')}
          </label>
        </div>
      </section>

      <section className="grid">
        {isLoading ? <article className="card">{t('parties.loading')}</article> : null}
        {statusMessage ? (
          <article className="card" style={{ color: '#067647' }}>
            {statusMessage}
          </article>
        ) : null}
        {errorMessage ? (
          <article className="card" style={{ color: '#b42318' }}>
            {errorMessage}
          </article>
        ) : null}
        {!isLoading && !errorMessage && visibleSessions.length === 0 && pendingInvitations.length === 0 ? <article className="card">{t('parties.empty')}</article> : null}
        {!isLoading && !errorMessage
          ? visibleSessions.map((session) => (
              <article key={session.id} className="card" style={{ opacity: session.archivedAt ? 0.78 : 1 }}>
                <h2 style={{ marginTop: 0 }}>{session.name}</h2>
                <p>{session.description || t('parties.noDescription')}</p>
                <p>
                  {t('parties.stateLabel')} <strong>{stateLabel(session.state)}</strong>
                </p>
                <p style={{ marginTop: 0 }}>{t('parties.systemLabel')} {selectedSystemName(session.systemId)}</p>
                <p style={{ marginTop: 0 }}>
                  {t('parties.ownerLabel')} <strong>{participantLabel(session, session.ownerUserId ?? session.gmUserId, t('parties.unknown'))}</strong> | {t('parties.role.gm')}: {gmLabels(session, t('parties.unknown'))}
                </p>
                {session.archivedAt ? <p style={{ color: '#475467' }}>{t('parties.archived')} {new Date(session.archivedAt).toLocaleString()}</p> : null}
                <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link to={`/sessions/${session.id}`}>{t('parties.open')}</Link>
                  {canManageSession(session, currentUser?.id, isAdmin) && !session.archivedAt ? (
                    <button className="button secondary" type="button" onClick={() => void handleArchive(session)}>
                      {t('parties.archive')}
                    </button>
                  ) : null}
                  {canManageSession(session, currentUser?.id, isAdmin) && session.archivedAt ? (
                    <button className="button secondary" type="button" onClick={() => void handleRestore(session)}>
                      {t('parties.restore')}
                    </button>
                  ) : null}
                  {canDeleteSession(session, currentUser?.id, isAdmin) ? (
                    <button className="button secondary" type="button" onClick={() => void handleDelete(session)}>
                      {t('parties.deleteFull')}
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          : null}
      </section>

      <section className="card" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>{t('parties.create.title')}</h2>
        <p style={{ marginTop: 0 }}>{t('parties.create.audience')}</p>
        {canCreateSessions ? (
          <form className="form" onSubmit={handleCreate}>
            <label htmlFor="party-name">{t('parties.create.name')}</label>
            <input
              id="party-name"
              type="text"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              placeholder={t('parties.create.namePh')}
              required
            />

            <label htmlFor="party-description">{t('parties.create.description')}</label>
            <input
              id="party-description"
              type="text"
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              placeholder={t('parties.create.descriptionPh')}
            />

            <label htmlFor="party-system">{t('parties.create.system')}</label>
            <select
              id="party-system"
              value={systemIdDraft}
              onChange={(event) => setSystemIdDraft(event.target.value)}
              disabled={systems.length === 0}
            >
              {systems.length === 0 ? <option value="">{t('parties.noSystemPublished')}</option> : null}
              {systems.map((system) => (
                <option
                  key={system.id}
                  value={system.id}
                  title={system.forkedFromSystemName ? `${t('parties.create.forked')} « ${system.forkedFromSystemName} »` : t('parties.create.original')}
                >
                  {system.name}
                  {system.forkedFromSystemName ? ` (${t('parties.create.forked')} ${system.forkedFromSystemName})` : ''}
                </option>
              ))}
            </select>
            {systemIdDraft ? (
              <p style={{ marginTop: '0.35rem', marginBottom: 0, fontSize: '0.95rem', opacity: 0.85 }}>
                {t('parties.create.templatesAuto')}
                {' '}
                {t('parties.role.gm')} <strong>{systemScreenTemplates.gm ?? t('parties.none')}</strong>
                {' '}| {t('parties.role.player')} <strong>{systemScreenTemplates.player ?? t('parties.none')}</strong>
              </p>
            ) : null}
            {selectedSystemDraft?.forkedFromSystemName ? (
              <p style={{ marginTop: '0.45rem', marginBottom: 0 }}>
                <span
                  title={`${t('parties.create.forked')} « ${selectedSystemDraft.forkedFromSystemName} »`}
                  style={{ borderBottom: '1px dotted currentColor', cursor: 'help' }}
                >
                  {t('parties.create.forked')} « {selectedSystemDraft.forkedFromSystemName} ».
                </span>
              </p>
            ) : null}

            <strong>{t('parties.settings.title')}</strong>
            <label>
              <input
                type="checkbox"
                checked={Boolean(settingsDraft.allowPlayerToEditCharacterOffline)}
                onChange={(event) =>
                  setSettingsDraft((previous) => ({
                    ...previous,
                    allowPlayerToEditCharacterOffline: event.target.checked
                  }))
                }
              />{' '}
              {t('parties.settings.allowOffline')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(settingsDraft.allowPlayerToPlayerChat)}
                onChange={(event) =>
                  setSettingsDraft((previous) => ({
                    ...previous,
                    allowPlayerToPlayerChat: event.target.checked
                  }))
                }
              />{' '}
              {t('parties.settings.allowChat')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={Boolean(settingsDraft.allowPlayerToPlayerDocuments)}
                onChange={(event) =>
                  setSettingsDraft((previous) => ({
                    ...previous,
                    allowPlayerToPlayerDocuments: event.target.checked
                  }))
                }
              />{' '}
              {t('parties.settings.allowDocs')}
            </label>
            <label htmlFor="silenceMode">{t('parties.settings.silence')}</label>
            <select
              id="silenceMode"
              value={settingsDraft.silenceMode || 'off'}
              onChange={(event) =>
                setSettingsDraft((previous) => ({
                  ...previous,
                  silenceMode: event.target.value as NonNullable<Session['settings']>['silenceMode']
                }))
              }
            >
              <option value="off">{t('parties.settings.silence.off')}</option>
              <option value="noGlobal">{t('parties.settings.silence.noGlobal')}</option>
              <option value="playersToPlayersBlocked">{t('parties.settings.silence.playersToPlayersBlocked')}</option>
              <option value="full">{t('parties.settings.silence.full')}</option>
            </select>
            <strong>{t('parties.settings.alertTitle')}</strong>
            {ALERT_BANNER_SYSTEM_TYPE_OPTIONS.map((option) => {
              const selectedTypes = settingsDraft.alertBannerSystemMessageTypes ?? DEFAULT_TEMPLATE.alertBannerSystemMessageTypes ?? [];
              return (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(option.value)}
                    onChange={(event) =>
                      setSettingsDraft((previous) => {
                        const currentTypes = previous.alertBannerSystemMessageTypes ?? DEFAULT_TEMPLATE.alertBannerSystemMessageTypes ?? [];
                        const nextTypes = event.target.checked
                          ? Array.from(new Set([...currentTypes, option.value]))
                          : currentTypes.filter((item) => item !== option.value);
                        return {
                          ...previous,
                          alertBannerSystemMessageTypes: nextTypes
                        };
                      })
                    }
                  />{' '}
                  {t(`parties.settings.alert.${option.value}`)}
                </label>
              );
            })}

            <Button type="submit" disabled={isCreating || !systemIdDraft}>
              {isCreating ? '...' : t('parties.create.cta')}
            </Button>
          </form>
        ) : (
          <p style={{ marginBottom: 0 }}>
            {t('parties.create.gmOnly')}
          </p>
        )}
      </section>
    </Layout>
  );
}
