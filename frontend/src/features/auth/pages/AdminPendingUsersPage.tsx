import { useEffect, useMemo, useState } from 'react';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import {
  AdminAuditEvent,
  approveUserService,
  deleteAdminUserService,
  listAdminAuditEventsService,
  listAdminUsersService,
  listPendingUsersService,
  resetAdminUserPasswordService,
  unlockAdminUserService,
  updateAdminUserService
} from '../../../services/authService';
import { User } from '../../../types/user';
import { useAuth } from '../../../hooks/useAuth';
import { systemRepository } from '../../../data/repositories';
import { GameSystem } from '../../../types/system';

type AdminSystemUsage = GameSystem & {
  usage: {
    usersUsingNow: number;
    activeSessionsCount: number;
    archivedSessionsCount: number;
    totalSessionsCount: number;
    lastUsedAt: string | null;
  };
};

type EditableSystemAdminState = {
  visibility: 'public' | 'private' | 'friends';
  viewerUserIds: string;
  editorUserIds: string;
};

type AccountEditState = {
  roleLevel: 'player' | 'gm' | 'admin';
  isActive: boolean;
  replacementUserId: string;
  temporaryPassword: string;
};

const ACCOUNT_PAGE_SIZE = 12;
const SYSTEM_PAGE_SIZE = 8;

function parseIds(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function looksLikeTestSystem(system: GameSystem): boolean {
  const haystack = `${system.name} ${system.description ?? ''} ${system.id}`.toLowerCase();
  return ['test', 'demo', 'tmp', 'draft', 'copie', 'copy', 'nouveau'].some((token) => haystack.includes(token));
}

function roleLevelFromUser(user: User): AccountEditState['roleLevel'] {
  if (user.roles.includes('admin')) {
    return 'admin';
  }
  if (user.roles.includes('gm')) {
    return 'gm';
  }
  return 'player';
}

function rolesFromLevel(level: AccountEditState['roleLevel']): string[] {
  if (level === 'admin') {
    return ['admin', 'gm', 'player'];
  }
  if (level === 'gm') {
    return ['gm', 'player'];
  }
  return ['player'];
}

export default function AdminPendingUsersPage() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'accounts' | 'systems' | 'audit'>('accounts');
  const [users, setUsers] = useState<User[]>([]);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [accountEdits, setAccountEdits] = useState<Record<string, AccountEditState>>({});
  const [accountSearch, setAccountSearch] = useState('');
  const [accountRoleFilter, setAccountRoleFilter] = useState<'all' | 'player' | 'gm' | 'admin'>('all');
  const [accountActiveFilter, setAccountActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [accountVerificationFilter, setAccountVerificationFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [accountsPage, setAccountsPage] = useState(1);
  const [auditSearch, setAuditSearch] = useState('');
  const [usage, setUsage] = useState<AdminSystemUsage[]>([]);
  const [replacementBySystemId, setReplacementBySystemId] = useState<Record<string, string>>({});
  const [editableBySystemId, setEditableBySystemId] = useState<Record<string, EditableSystemAdminState>>({});
  const [selectedSystemIds, setSelectedSystemIds] = useState<string[]>([]);
  const [systemSearch, setSystemSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [systemUsageFilter, setSystemUsageFilter] = useState<'all' | 'used' | 'unused' | 'active_sessions'>('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [systemsPage, setSystemsPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingSystem, setIsSavingSystem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadData = async () => {
    const [pendingUsers, systemsUsage, allUsers, events] = await Promise.all([
      listPendingUsersService(),
      systemRepository.listUsageForAdmin(),
      listAdminUsersService(),
      listAdminAuditEventsService(300)
    ]);
    const typed = systemsUsage as AdminSystemUsage[];
    setUsers(pendingUsers);
    setAdminUsers(allUsers);
    setAuditEvents(events);
    setAccountsPage(1);
    setSystemsPage(1);
    setAccountEdits(
      allUsers.reduce<Record<string, AccountEditState>>((acc, user) => {
        acc[user.id] = {
          roleLevel: roleLevelFromUser(user),
          isActive: user.isActive !== false,
          replacementUserId: currentUser?.id || '',
          temporaryPassword: ''
        };
        return acc;
      }, {})
    );
    setUsage(typed);
    setSelectedSystemIds((previous) => previous.filter((id) => typed.some((item) => item.id === id)));
    setEditableBySystemId(
      typed.reduce<Record<string, EditableSystemAdminState>>((acc, system) => {
        acc[system.id] = {
          visibility: system.visibility,
          viewerUserIds: (system.viewerUserIds ?? []).join(', '),
          editorUserIds: (system.editorUserIds ?? []).join(', ')
        };
        return acc;
      }, {})
    );
  };

  const deleteAccount = async (userId: string) => {
    const user = adminUsers.find((item) => item.id === userId);
    if (!user) {
      return;
    }
    const edited = accountEdits[userId];
    const replacementUserId =
      edited?.replacementUserId && edited.replacementUserId !== userId
        ? edited.replacementUserId
        : adminUsers.find((item) => item.id !== userId)?.id || '';
    if (!replacementUserId) {
      setError('Aucun compte de remplacement disponible.');
      return;
    }

    const replacementName = adminUsers.find((item) => item.id === replacementUserId)?.displayName || replacementUserId;
    const confirmed = window.confirm(
      `Supprimer "${user.displayName}" ? Les données seront réassignées à "${replacementName}".`
    );
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      setStatus(null);
      const result = await deleteAdminUserService(userId, { replacementUserId });
      await loadData();
      setStatus(
        `Compte supprimé. Réassignations: ${result.migratedSystemsCount} système(s), ${result.migratedSessionsCount} partie(s), ${result.migratedCharactersCount} fiche(s).`
      );
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Suppression compte impossible.');
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        await loadData();
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : 'Chargement impossible.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const ownerOptions = useMemo(() => {
    const owners = Array.from(new Set(usage.map((item) => item.ownerUserId))).sort((a, b) => a.localeCompare(b));
    return owners;
  }, [usage]);

  const filteredAdminUsers = useMemo(() => {
    const search = accountSearch.trim().toLowerCase();
    return adminUsers.filter((user) => {
      const roleLevel = roleLevelFromUser(user);
      const isActive = user.isActive !== false;
      const isVerified = Boolean(user.isEmailVerified);

      if (accountRoleFilter !== 'all' && roleLevel !== accountRoleFilter) {
        return false;
      }
      if (accountActiveFilter === 'active' && !isActive) {
        return false;
      }
      if (accountActiveFilter === 'inactive' && isActive) {
        return false;
      }
      if (accountVerificationFilter === 'verified' && !isVerified) {
        return false;
      }
      if (accountVerificationFilter === 'unverified' && isVerified) {
        return false;
      }
      if (!search) {
        return true;
      }

      return (
        user.displayName.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search) ||
        user.id.toLowerCase().includes(search)
      );
    });
  }, [adminUsers, accountSearch, accountRoleFilter, accountActiveFilter, accountVerificationFilter]);

  const totalAccountsPages = Math.max(1, Math.ceil(filteredAdminUsers.length / ACCOUNT_PAGE_SIZE));
  const paginatedAdminUsers = useMemo(() => {
    const page = Math.min(accountsPage, totalAccountsPages);
    const start = (page - 1) * ACCOUNT_PAGE_SIZE;
    return filteredAdminUsers.slice(start, start + ACCOUNT_PAGE_SIZE);
  }, [filteredAdminUsers, accountsPage, totalAccountsPages]);

  const filteredAuditEvents = useMemo(() => {
    const search = auditSearch.trim().toLowerCase();
    if (!search) {
      return auditEvents;
    }
    return auditEvents.filter((event) => {
      const metadata = JSON.stringify(event.metadata || {}).toLowerCase();
      return (
        String(event.summary || '').toLowerCase().includes(search) ||
        String(event.action || '').toLowerCase().includes(search) ||
        String(event.actorUserId || '').toLowerCase().includes(search) ||
        String(event.targetUserId || '').toLowerCase().includes(search) ||
        metadata.includes(search)
      );
    });
  }, [auditEvents, auditSearch]);

  useEffect(() => {
    if (accountsPage > totalAccountsPages) {
      setAccountsPage(totalAccountsPages);
    }
  }, [accountsPage, totalAccountsPages]);

  const filteredUsage = useMemo(() => {
    const search = systemSearch.trim().toLowerCase();
    return usage.filter((item) => {
      if (visibilityFilter !== 'all' && item.visibility !== visibilityFilter) {
        return false;
      }
      if (systemUsageFilter === 'used' && item.usage.totalSessionsCount <= 0) {
        return false;
      }
      if (systemUsageFilter === 'unused' && item.usage.totalSessionsCount > 0) {
        return false;
      }
      if (systemUsageFilter === 'active_sessions' && item.usage.activeSessionsCount <= 0) {
        return false;
      }
      if (ownerFilter !== 'all' && item.ownerUserId !== ownerFilter) {
        return false;
      }
      if (!search) {
        return true;
      }
      return (
        item.name.toLowerCase().includes(search) ||
        item.id.toLowerCase().includes(search) ||
        (item.description ?? '').toLowerCase().includes(search) ||
        item.ownerUserId.toLowerCase().includes(search)
      );
    });
  }, [usage, systemSearch, visibilityFilter, systemUsageFilter, ownerFilter]);

  const totalSystemsPages = Math.max(1, Math.ceil(filteredUsage.length / SYSTEM_PAGE_SIZE));
  const paginatedSystems = useMemo(() => {
    const page = Math.min(systemsPage, totalSystemsPages);
    const start = (page - 1) * SYSTEM_PAGE_SIZE;
    return filteredUsage.slice(start, start + SYSTEM_PAGE_SIZE);
  }, [filteredUsage, systemsPage, totalSystemsPages]);

  useEffect(() => {
    if (systemsPage > totalSystemsPages) {
      setSystemsPage(totalSystemsPages);
    }
  }, [systemsPage, totalSystemsPages]);

  const approveAs = async (userId: string, roles: string[]) => {
    try {
      setError(null);
      await approveUserService(userId, roles);
      setUsers((prev) => prev.filter((user) => user.id !== userId));
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : 'Validation impossible.');
    }
  };

  const saveAccount = async (userId: string) => {
    const edited = accountEdits[userId];
    if (!edited) {
      return;
    }

    try {
      setError(null);
      setStatus(null);
      await updateAdminUserService(userId, {
        roles: rolesFromLevel(edited.roleLevel),
        isActive: edited.isActive
      });
      await loadData();
      setStatus('Compte mis à jour.');
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Mise à jour compte impossible.');
    }
  };

  const unlockAccount = async (userId: string) => {
    try {
      setError(null);
      setStatus(null);
      await unlockAdminUserService(userId);
      await loadData();
      setStatus('Compte déverrouillé.');
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Déverrouillage impossible.');
    }
  };

  const resetAccountPassword = async (userId: string) => {
    const edited = accountEdits[userId];
    const nextPassword = edited?.temporaryPassword?.trim() || '';
    if (nextPassword.length < 8) {
      setError('Le mot de passe temporaire doit contenir au moins 8 caractères.');
      return;
    }

    const confirmed = window.confirm('Réinitialiser le mot de passe de ce compte avec la valeur saisie ?');
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      setStatus(null);
      await resetAdminUserPasswordService(userId, nextPassword);
      await loadData();
      setAccountEdits((previous) => ({
        ...previous,
        [userId]: {
          ...(previous[userId] ?? {
            roleLevel: 'player',
            isActive: true,
            replacementUserId: currentUser?.id || '',
            temporaryPassword: ''
          }),
          temporaryPassword: ''
        }
      }));
      setStatus('Mot de passe réinitialisé et verrouillage effacé.');
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Réinitialisation mot de passe impossible.');
    }
  };

  const saveSystemAdmin = async (systemId: string) => {
    if (!currentUser) {
      return;
    }
    const target = usage.find((item) => item.id === systemId);
    const edited = editableBySystemId[systemId];
    if (!target || !edited) {
      return;
    }

    setError(null);
    setStatus(null);
    setIsSavingSystem(true);

    try {
      await systemRepository.upsert(
        {
          ...target,
          visibility: edited.visibility,
          viewerUserIds: parseIds(edited.viewerUserIds),
          editorUserIds: parseIds(edited.editorUserIds)
        },
        currentUser
      );
      await loadData();
      setStatus(`Système mis à jour: ${target.name}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Mise à jour système impossible.');
    } finally {
      setIsSavingSystem(false);
    }
  };

  const deleteSystem = async (systemId: string) => {
    const target = usage.find((item) => item.id === systemId);
    if (!target) {
      return;
    }

    const replacementSystemId =
      replacementBySystemId[systemId] || usage.find((candidate) => candidate.id !== systemId)?.id || '';

    if (!replacementSystemId) {
      setError('Aucun système de remplacement disponible.');
      return;
    }

    const replacementName = usage.find((candidate) => candidate.id === replacementSystemId)?.name || replacementSystemId;
    const confirmed = window.confirm(
      `Supprimer le système "${target.name}" ? Les parties liées seront migrées vers "${replacementName}".`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus(null);
    setIsDeleting(true);

    try {
      const result = await systemRepository.deleteAsAdmin({
        systemId,
        replacementSystemId
      });
      await loadData();
      setStatus(`Système supprimé. Parties migrées: ${result.migratedSessionsCount}.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Suppression impossible.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSystemSelection = (systemId: string) => {
    setSelectedSystemIds((previous) => (previous.includes(systemId) ? previous.filter((id) => id !== systemId) : [...previous, systemId]));
  };

  const selectAllFiltered = () => {
    setSelectedSystemIds(filteredUsage.map((item) => item.id));
  };

  const selectLikelyTests = () => {
    setSelectedSystemIds(filteredUsage.filter((item) => looksLikeTestSystem(item)).map((item) => item.id));
  };

  const clearSelection = () => {
    setSelectedSystemIds([]);
  };

  const deleteSelectedSystems = async () => {
    const unique = Array.from(new Set(selectedSystemIds));
    if (unique.length === 0) {
      setError('Aucun système sélectionné.');
      return;
    }
    if (usage.length <= 1) {
      setError('Impossible de supprimer: il faut au moins un système restant.');
      return;
    }

    const replacementFallback = usage.find((item) => !unique.includes(item.id))?.id;
    if (!replacementFallback) {
      setError('Aucun système de remplacement valide.');
      return;
    }

    const confirmed = window.confirm(
      `Supprimer ${unique.length} système(s) sélectionné(s) ? Les parties seront migrées vers un système de remplacement.`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus(null);
    setIsDeleting(true);
    let migratedTotal = 0;
    let deletedCount = 0;

    try {
      for (const systemId of unique) {
        const replacementSystemId =
          replacementBySystemId[systemId] || usage.find((candidate) => candidate.id !== systemId && !unique.includes(candidate.id))?.id || replacementFallback;
        if (!replacementSystemId || replacementSystemId === systemId) {
          continue;
        }
        const result = await systemRepository.deleteAsAdmin({ systemId, replacementSystemId });
        migratedTotal += result.migratedSessionsCount;
        deletedCount += 1;
      }
      await loadData();
      setSelectedSystemIds([]);
      setStatus(`Suppression en masse terminée: ${deletedCount} système(s), ${migratedTotal} partie(s) migrée(s).`);
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : 'Suppression en masse impossible.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!currentUser?.roles.includes('admin')) {
    return (
      <Layout>
        <section className="card">Accès admin requis.</section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Administration</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button type="button" variant={activeTab === 'accounts' ? 'primary' : 'secondary'} onClick={() => setActiveTab('accounts')}>
            Gestion des comptes
          </Button>
          <Button type="button" variant={activeTab === 'systems' ? 'primary' : 'secondary'} onClick={() => setActiveTab('systems')}>
            Gestion des systèmes
          </Button>
          <Button type="button" variant={activeTab === 'audit' ? 'primary' : 'secondary'} onClick={() => setActiveTab('audit')}>
            Journal admin
          </Button>
        </div>
      </section>

      {isLoading ? <p>Chargement...</p> : null}
      {error ? <p style={{ color: '#b42318' }}>{error}</p> : null}
      {status ? <p style={{ color: '#067647' }}>{status}</p> : null}

      {activeTab === 'accounts' ? (
        <>
          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Comptes en attente</h2>
            <p>Seuls les comptes avec email validé apparaissent ici.</p>
            {!isLoading && users.length === 0 ? <p>Aucun compte à valider.</p> : null}

            <div className="grid">
              {users.map((user) => (
                <article key={user.id} className="card">
                  <h3 style={{ marginTop: 0 }}>{user.displayName}</h3>
                  <p style={{ margin: 0 }}>{user.email}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                    <Button onClick={() => approveAs(user.id, ['player'])}>Valider Joueur</Button>
                    <Button variant="secondary" onClick={() => approveAs(user.id, ['gm', 'player'])}>
                      Valider MJ
                    </Button>
                    <Button variant="secondary" onClick={() => approveAs(user.id, ['admin', 'gm', 'player'])}>
                      Valider Admin
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ marginTop: 0 }}>Gestion des comptes</h2>
            <p style={{ marginTop: 0 }}>
              Voir tous les inscrits, activer/désactiver, définir le niveau et supprimer un utilisateur.
            </p>

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.8rem' }}>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Recherche</span>
                <input
                  value={accountSearch}
                  onChange={(event) => {
                    setAccountSearch(event.target.value);
                    setAccountsPage(1);
                  }}
                  placeholder="nom, email, id..."
                />
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Rôle</span>
                <select
                  value={accountRoleFilter}
                  onChange={(event) => {
                    setAccountRoleFilter(event.target.value as 'all' | 'player' | 'gm' | 'admin');
                    setAccountsPage(1);
                  }}
                >
                  <option value="all">Tous</option>
                  <option value="player">Joueur</option>
                  <option value="gm">MJ</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Statut actif</span>
                <select
                  value={accountActiveFilter}
                  onChange={(event) => {
                    setAccountActiveFilter(event.target.value as 'all' | 'active' | 'inactive');
                    setAccountsPage(1);
                  }}
                >
                  <option value="all">Tous</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: '0.35rem' }}>
                <span>Email</span>
                <select
                  value={accountVerificationFilter}
                  onChange={(event) => {
                    setAccountVerificationFilter(event.target.value as 'all' | 'verified' | 'unverified');
                    setAccountsPage(1);
                  }}
                >
                  <option value="all">Tous</option>
                  <option value="verified">Validé</option>
                  <option value="unverified">Non validé</option>
                </select>
              </label>
            </div>

            <p style={{ marginTop: 0, opacity: 0.85 }}>
              Total: {adminUsers.length} | Filtrés: {filteredAdminUsers.length} | Page: {accountsPage}/{totalAccountsPages}
            </p>

            {!isLoading && filteredAdminUsers.length === 0 ? <p>Aucun compte.</p> : null}
            <div className="grid">
              {paginatedAdminUsers.map((user) => {
                const edited = accountEdits[user.id] ?? {
                  roleLevel: roleLevelFromUser(user),
                  isActive: user.isActive !== false,
                  replacementUserId: currentUser?.id || '',
                  temporaryPassword: ''
                };
                const isRootProtected = Boolean(user.isProtectedRootAdmin);
                const replacementOptions = adminUsers.filter((candidate) => candidate.id !== user.id);
                const isLocked = Boolean(user.lockedUntil && user.lockedUntil > Date.now());
                return (
                  <article key={user.id} className="card">
                    <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>{user.displayName}</h3>
                    <p style={{ margin: 0 }}>{user.email}</p>
                    <p style={{ margin: 0 }}>
                      Email: {user.isEmailVerified ? 'validé' : 'non validé'} | Validation admin: {user.approvalStatus ?? 'pending'}
                    </p>
                    <p style={{ margin: 0 }}>2FA: {user.hasTotpEnabled ? 'activé' : 'désactivé'}</p>
                    <p style={{ margin: 0 }}>
                      Verrouillage: {isLocked ? `oui jusqu au ${new Date(Number(user.lockedUntil)).toLocaleString('fr-FR')}` : 'non'}
                      {' '}| Echecs en cours: {user.failedLoginCount ?? 0}
                    </p>
                    <p style={{ margin: 0 }}>ID: {user.id}</p>
                    {isRootProtected ? (
                      <p style={{ margin: 0, color: '#ca8504' }}>Compte root protégé (non désactivable / non rétrogradable / non supprimable).</p>
                    ) : null}

                    <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span>Niveau</span>
                        <select
                          value={edited.roleLevel}
                          onChange={(event) =>
                            setAccountEdits((previous) => ({
                              ...previous,
                              [user.id]: {
                                ...edited,
                                roleLevel: event.target.value as AccountEditState['roleLevel']
                              }
                            }))
                          }
                          disabled={isRootProtected}
                        >
                          <option value="player">Joueur</option>
                          <option value="gm">MJ</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>

                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                        <input
                          type="checkbox"
                          checked={edited.isActive}
                          onChange={(event) =>
                            setAccountEdits((previous) => ({
                              ...previous,
                              [user.id]: {
                                ...edited,
                                isActive: event.target.checked
                              }
                            }))
                          }
                          disabled={isRootProtected}
                        />
                        <span>Compte actif</span>
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span>Compte de réattribution (suppression)</span>
                        <select
                          value={edited.replacementUserId}
                          onChange={(event) =>
                            setAccountEdits((previous) => ({
                              ...previous,
                              [user.id]: {
                                ...edited,
                                replacementUserId: event.target.value
                              }
                            }))
                          }
                          disabled={isRootProtected}
                        >
                          <option value="">Auto</option>
                          {replacementOptions.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.displayName}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: 'grid', gap: '0.25rem' }}>
                        <span>Mot de passe temporaire</span>
                        <input
                          type="text"
                          value={edited.temporaryPassword}
                          onChange={(event) =>
                            setAccountEdits((previous) => ({
                              ...previous,
                              [user.id]: {
                                ...edited,
                                temporaryPassword: event.target.value
                              }
                            }))
                          }
                          placeholder="Saisir un nouveau mot de passe"
                          disabled={isRootProtected}
                        />
                      </label>
                    </div>

                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Button type="button" variant="secondary" onClick={() => void saveAccount(user.id)} disabled={isRootProtected}>
                        Enregistrer ce compte
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void unlockAccount(user.id)} disabled={isRootProtected || !isLocked}>
                        Débloquer
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void resetAccountPassword(user.id)}
                        disabled={isRootProtected || !edited.temporaryPassword.trim()}
                      >
                        Réinitialiser le mot de passe
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => void deleteAccount(user.id)} disabled={isRootProtected}>
                        Supprimer utilisateur
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
              <Button type="button" variant="secondary" onClick={() => setAccountsPage(1)} disabled={accountsPage === 1}>
                Première page
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAccountsPage((previous) => Math.max(1, previous - 1))} disabled={accountsPage === 1}>
                Précédente
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAccountsPage((previous) => Math.min(totalAccountsPages, previous + 1))}
                disabled={accountsPage >= totalAccountsPages}
              >
                Suivante
              </Button>
              <Button type="button" variant="secondary" onClick={() => setAccountsPage(totalAccountsPages)} disabled={accountsPage >= totalAccountsPages}>
                Dernière page
              </Button>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === 'systems' ? (
        <section className="card">
        <h2 style={{ marginTop: 0 }}>Gestion des systèmes (admin)</h2>
        <p style={{ marginTop: 0 }}>
          Modifier visibilité, lecteurs, co-éditeurs, consulter usage et supprimer avec migration.
        </p>
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          Total: {usage.length} | Filtrés: {filteredUsage.length} | Sélection: {selectedSystemIds.length} | Page: {systemsPage}/{totalSystemsPages}
        </p>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '0.8rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Recherche</span>
            <input
              value={systemSearch}
              onChange={(event) => {
                setSystemSearch(event.target.value);
                setSystemsPage(1);
              }}
              placeholder="nom, id, owner..."
            />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Visibilité</span>
            <select
              value={visibilityFilter}
              onChange={(event) => {
                setVisibilityFilter(event.target.value as 'all' | 'public' | 'private');
                setSystemsPage(1);
              }}
            >
              <option value="all">Toutes</option>
              <option value="public">Public</option>
              <option value="private">Privé</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Usage</span>
            <select
              value={systemUsageFilter}
              onChange={(event) => {
                setSystemUsageFilter(event.target.value as 'all' | 'used' | 'unused' | 'active_sessions');
                setSystemsPage(1);
              }}
            >
              <option value="all">Tous</option>
              <option value="used">Utilisés</option>
              <option value="unused">Jamais utilisés</option>
              <option value="active_sessions">Avec parties actives</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Propriétaire</span>
            <select
              value={ownerFilter}
              onChange={(event) => {
                setOwnerFilter(event.target.value);
                setSystemsPage(1);
              }}
            >
              <option value="all">Tous</option>
              {ownerOptions.map((ownerId) => (
                <option key={ownerId} value={ownerId}>
                  {ownerId}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <Button type="button" variant="secondary" onClick={selectAllFiltered}>
            Tout sélectionner (filtre)
          </Button>
          <Button type="button" variant="secondary" onClick={selectLikelyTests}>
            Sélectionner systèmes test probables
          </Button>
          <Button type="button" variant="secondary" onClick={clearSelection}>
            Vider sélection
          </Button>
          <Button type="button" variant="secondary" onClick={() => void deleteSelectedSystems()} disabled={isDeleting || selectedSystemIds.length === 0}>
            Supprimer sélection
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void loadData();
            }}
          >
            Rafraîchir
          </Button>
        </div>

        {!isLoading && filteredUsage.length === 0 ? <p>Aucun système.</p> : null}
        <div className="grid">
          {paginatedSystems.map((item) => {
            const edited = editableBySystemId[item.id] ?? {
              visibility: item.visibility,
              viewerUserIds: (item.viewerUserIds ?? []).join(', '),
              editorUserIds: (item.editorUserIds ?? []).join(', ')
            };

            return (
              <article key={item.id} className="card">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.45rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedSystemIds.includes(item.id)}
                    onChange={() => toggleSystemSelection(item.id)}
                  />
                  <span>Sélectionner</span>
                </label>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{item.name}</h3>
                <p style={{ marginTop: 0, marginBottom: '0.45rem' }}>{item.description || 'Aucune description'}</p>
                <p style={{ margin: 0 }}>ID: {item.id}</p>
                <p style={{ margin: 0 }}>Owner: {item.ownerUserId}</p>
                <p style={{ margin: 0 }}>Utilisateurs actifs actuellement: {item.usage.usersUsingNow}</p>
                <p style={{ margin: 0 }}>Parties actives: {item.usage.activeSessionsCount}</p>
                <p style={{ margin: 0 }}>Parties archivées: {item.usage.archivedSessionsCount}</p>
                <p style={{ margin: 0 }}>Total parties: {item.usage.totalSessionsCount}</p>
                <p style={{ margin: 0 }}>
                  Dernière utilisation: {item.usage.lastUsedAt ? new Date(item.usage.lastUsedAt).toLocaleString() : 'Jamais'}
                </p>

                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.45rem' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span>Visibilité</span>
                    <select
                      value={edited.visibility}
                      onChange={(event) =>
                        setEditableBySystemId((previous) => ({
                          ...previous,
                          [item.id]: {
                            ...edited,
                            visibility:
                              event.target.value === 'public'
                                ? 'public'
                                : event.target.value === 'friends'
                                ? 'friends'
                                : 'private'
                          }
                        }))
                      }
                    >
                      <option value="private">Privé</option>
                      <option value="friends">Amis</option>
                      <option value="public">Public</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span>Lecteurs (IDs comptes, virgule)</span>
                    <input
                      value={edited.viewerUserIds}
                      onChange={(event) =>
                        setEditableBySystemId((previous) => ({
                          ...previous,
                          [item.id]: {
                            ...edited,
                            viewerUserIds: event.target.value
                          }
                        }))
                      }
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span>Co-éditeurs (IDs comptes, virgule)</span>
                    <input
                      value={edited.editorUserIds}
                      onChange={(event) =>
                        setEditableBySystemId((previous) => ({
                          ...previous,
                          [item.id]: {
                            ...edited,
                            editorUserIds: event.target.value
                          }
                        }))
                      }
                    />
                  </label>
                </div>

                <label style={{ display: 'grid', gap: '0.35rem', marginTop: '0.6rem' }}>
                  <span>Système de remplacement (si suppression)</span>
                  <select
                    value={replacementBySystemId[item.id] ?? ''}
                    onChange={(event) =>
                      setReplacementBySystemId((previous) => ({
                        ...previous,
                        [item.id]: event.target.value
                      }))
                    }
                  >
                    <option value="">Auto</option>
                    {usage
                      .filter((candidate) => candidate.id !== item.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </label>

                <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button type="button" variant="secondary" onClick={() => void saveSystemAdmin(item.id)} disabled={isSavingSystem}>
                    Enregistrer droits
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void deleteSystem(item.id)} disabled={isDeleting}>
                    Supprimer ce système
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <Button type="button" variant="secondary" onClick={() => setSystemsPage(1)} disabled={systemsPage === 1}>
            Première page
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSystemsPage((previous) => Math.max(1, previous - 1))} disabled={systemsPage === 1}>
            Précédente
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSystemsPage((previous) => Math.min(totalSystemsPages, previous + 1))}
            disabled={systemsPage >= totalSystemsPages}
          >
            Suivante
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSystemsPage(totalSystemsPages)} disabled={systemsPage >= totalSystemsPages}>
            Dernière page
          </Button>
        </div>
        </section>
      ) : null}

      {activeTab === 'audit' ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Journal admin</h2>
          <p style={{ marginTop: 0 }}>Trace les actions de modération des comptes (validation, changement, suppression).</p>
          <label style={{ display: 'grid', gap: '0.35rem', maxWidth: 460, marginBottom: '0.8rem' }}>
            <span>Recherche</span>
            <input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="action, compte, id..." />
          </label>
          {filteredAuditEvents.length === 0 ? <p>Aucun événement.</p> : null}
          <div className="grid">
            {filteredAuditEvents.map((event) => (
              <article key={event.id} className="card">
                <p style={{ margin: 0 }}>
                  <strong>{new Date(event.at).toLocaleString()}</strong>
                </p>
                <p style={{ margin: 0 }}>Action: {event.action}</p>
                <p style={{ margin: 0 }}>Admin: {event.actorUserId}</p>
                <p style={{ margin: 0 }}>Cible: {event.targetUserId || '-'}</p>
                <p style={{ margin: 0 }}>{event.summary}</p>
                <details>
                  <summary>Détails</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(event.metadata, null, 2)}</pre>
                </details>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </Layout>
  );
}
