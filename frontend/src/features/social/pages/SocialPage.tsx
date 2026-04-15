import { FormEvent, useEffect, useState } from 'react';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import SocialUserAutocomplete from '../../../components/SocialUserAutocomplete';
import { SocialRelationSummary, SocialReport, SocialUser } from '../../../types/social';
import {
  acceptFriendRequestService,
  createSocialReportService,
  deleteFriendRequestService,
  ignoreUserService,
  listAdminSocialReportsService,
  loadSocialRelationsService,
  sendFriendRequestService,
  unignoreUserService,
  updateAdminSocialReportStatusService
} from '../../../services/socialService';
import { useAuth } from '../../../hooks/useAuth';

const EMPTY_RELATIONS: SocialRelationSummary = {
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  ignored: []
};

export default function SocialPage() {
  const { currentUser } = useAuth();
  const isAdmin = Boolean(currentUser?.roles.includes('admin'));
  const [relations, setRelations] = useState<SocialRelationSummary>(EMPTY_RELATIONS);
  const [reports, setReports] = useState<SocialReport[]>([]);
  const [query, setQuery] = useState('');
  const [selectedSearchUser, setSelectedSearchUser] = useState<SocialUser | null>(null);
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = async () => {
    const [nextRelations, nextReports] = await Promise.all([
      loadSocialRelationsService(),
      isAdmin ? listAdminSocialReportsService() : Promise.resolve([])
    ]);
    setRelations(nextRelations);
    setReports(nextReports);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await reload();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le réseau.');
      }
    };
    void run();
  }, []);

  const handleAction = async (callback: () => Promise<void>, successMessage: string) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await callback();
      setStatusMessage(successMessage);
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Action impossible.');
    }
  };

  const handleReportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleAction(
      async () => {
        await createSocialReportService({
          targetUserId: reportTargetId,
          reason: reportReason,
          details: reportDetails
        });
        setReportTargetId('');
        setReportReason('');
        setReportDetails('');
      },
      'Signalement envoyé.'
    );
  };

  return (
    <Layout wide>
      <section className="grid social-page-grid">
        <section className="card home-section">
          <div className="home-section__header">
            <div>
              <p className="home-section__eyebrow">Réseau</p>
              <h1>Amis, ignorés et signalements</h1>
            </div>
          </div>
          {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
          {statusMessage ? <p className="home-alert home-alert--success">{statusMessage}</p> : null}

          <div className="card social-search-card">
            <label htmlFor="socialSearch">Trouver un utilisateur</label>
            <SocialUserAutocomplete
              value={query}
              onChange={(nextValue) => {
                setQuery(nextValue);
                if (!nextValue.trim()) {
                  setSelectedSearchUser(null);
                }
              }}
              onSelect={(user) => {
                setSelectedSearchUser(user);
                setQuery(user.nickname || user.displayName);
              }}
              placeholder="Pseudo, nom, prénom..."
              filterResults={(items) => items.filter((user) => user.id !== currentUser?.id)}
            />
            <div className="social-search-results">
              {selectedSearchUser ? (
                <article className="social-user-card">
                  <div>
                    <strong>{selectedSearchUser.displayName}</strong>
                    <p>@{selectedSearchUser.nickname || selectedSearchUser.id}</p>
                  </div>
                  <div className="social-user-card__actions">
                    {!selectedSearchUser.isFriend && !selectedSearchUser.hasOutgoingFriendRequest ? (
                      <Button type="button" onClick={() => void handleAction(() => sendFriendRequestService(selectedSearchUser.id), 'Demande d’ami envoyée.')}>
                        Ajouter en ami
                      </Button>
                    ) : null}
                    {!selectedSearchUser.isIgnored ? (
                      <Button type="button" variant="secondary" onClick={() => void handleAction(() => ignoreUserService(selectedSearchUser.id), 'Utilisateur ignoré.')}>
                        Ignorer
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        setReportTargetId(selectedSearchUser.id);
                        setReportReason(`Signalement de ${selectedSearchUser.displayName}`);
                      }}
                    >
                      Signaler
                    </Button>
                  </div>
                </article>
              ) : null}
            </div>
          </div>

          <div className="social-relations-grid">
            <section className="card">
              <h2>Amis</h2>
              {relations.friends.length === 0 ? <p>Aucun ami pour le moment.</p> : null}
              {relations.friends.map((user) => (
                <article key={user.id} className="social-user-card">
                  <div>
                    <strong>{user.displayName}</strong>
                    <p>@{user.nickname || user.id}</p>
                  </div>
                  <div className="social-user-card__actions">
                    <Button type="button" variant="secondary" onClick={() => void handleAction(() => ignoreUserService(user.id), 'Utilisateur ignoré.')}>
                      Ignorer
                    </Button>
                  </div>
                </article>
              ))}
            </section>

            <section className="card">
              <h2>Demandes reçues</h2>
              {relations.incomingRequests.length === 0 ? <p>Aucune demande reçue.</p> : null}
              {relations.incomingRequests.map((request) => (
                <article key={request.id} className="social-user-card">
                  <div>
                    <strong>{request.user?.displayName || 'Utilisateur inconnu'}</strong>
                    <p>{new Date(request.createdAt).toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="social-user-card__actions">
                    <Button type="button" onClick={() => void handleAction(() => acceptFriendRequestService(request.id), 'Demande acceptée.')}>
                      Accepter
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void handleAction(() => deleteFriendRequestService(request.id), 'Demande refusée.')}>
                      Refuser
                    </Button>
                  </div>
                </article>
              ))}
            </section>

            <section className="card">
              <h2>Demandes envoyées</h2>
              {relations.outgoingRequests.length === 0 ? <p>Aucune demande en attente.</p> : null}
              {relations.outgoingRequests.map((request) => (
                <article key={request.id} className="social-user-card">
                  <div>
                    <strong>{request.user?.displayName || 'Utilisateur inconnu'}</strong>
                    <p>{new Date(request.createdAt).toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="social-user-card__actions">
                    <Button type="button" variant="secondary" onClick={() => void handleAction(() => deleteFriendRequestService(request.id), 'Demande annulée.')}>
                      Annuler
                    </Button>
                  </div>
                </article>
              ))}
            </section>

            <section className="card">
              <h2>Ignorés</h2>
              {relations.ignored.length === 0 ? <p>Aucun utilisateur ignoré.</p> : null}
              {relations.ignored.map((entry) => (
                <article key={entry.id} className="social-user-card">
                  <div>
                    <strong>{entry.user?.displayName || 'Utilisateur inconnu'}</strong>
                    <p>@{entry.user?.nickname || entry.user?.id || '?'}</p>
                  </div>
                  <div className="social-user-card__actions">
                    {entry.user ? (
                      <Button type="button" variant="secondary" onClick={() => void handleAction(() => unignoreUserService(entry.user!.id), 'Utilisateur retiré des ignorés.')}>
                        Retirer
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          </div>

          <form className="card home-announcement-form" onSubmit={handleReportSubmit}>
            <h2>Signaler un utilisateur</h2>
            <label htmlFor="reportTargetId">Utilisateur ciblé</label>
            <input id="reportTargetId" value={reportTargetId} onChange={(event) => setReportTargetId(event.target.value)} required />
            <label htmlFor="reportReason">Motif</label>
            <input id="reportReason" value={reportReason} onChange={(event) => setReportReason(event.target.value)} required />
            <label htmlFor="reportDetails">Détails</label>
            <textarea id="reportDetails" rows={4} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} />
            <Button type="submit">Envoyer le signalement</Button>
          </form>

          {isAdmin ? (
            <section className="card">
              <h2>Signalements admin</h2>
              <div className="home-feed-list">
                {reports.map((report) => (
                  <article key={report.id} className="home-feed-item">
                    <div className="home-feed-item__meta">
                      <strong>{report.reason}</strong>
                      <span className="home-pill">{report.status}</span>
                    </div>
                    <p>
                      Cible : {report.targetDisplayName} · Signalé par {report.reportedByDisplayName}
                    </p>
                    {report.details ? <p>{report.details}</p> : null}
                    <div className="home-feed-item__actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          void handleAction(async () => {
                            await updateAdminSocialReportStatusService(report.id, 'reviewing');
                          }, 'Signalement passé en revue.')
                        }
                      >
                        Passer en revue
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          void handleAction(async () => {
                            await updateAdminSocialReportStatusService(report.id, 'closed');
                          }, 'Signalement clôturé.')
                        }
                      >
                        Clôturer
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </section>
    </Layout>
  );
}
