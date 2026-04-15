import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';
import DiscordMarkdown from '../../../components/DiscordMarkdown';
import { useAuth } from '../../../hooks/useAuth';
import { listAnnouncementsService, listHomeNewsService, loadHomeStatsService } from '../../../services/homeService';
import {
  AnnouncementPlayMode,
  AnnouncementStatus,
  AnnouncementPeriodicity,
  HomeAnnouncement,
  HomeNewsItem,
  HomeStats
} from '../../../types/home';

const DEFAULT_STATS: HomeStats = {
  runningSessions: 0,
  activePlayers: 0,
  activeGms: 0,
  playersLookingForGame: 0,
  systemsCount: 0,
  approvedUsers: 0
};

const playModeLabels: Record<AnnouncementPlayMode, string> = {
  online: 'En ligne',
  onsite: 'Présentiel',
  hybrid: 'Hybride'
};

const statusLabels: Record<AnnouncementStatus, string> = {
  open: 'Ouverte',
  closed: 'Clôturée'
};

const periodicityLabels: Record<AnnouncementPeriodicity, string> = {
  one_shot: 'Ponctuel',
  weekly: 'Hebdomadaire',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Mensuel',
  irregular: 'Irrégulier'
};

export default function HomePage() {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<HomeStats>(DEFAULT_STATS);
  const [news, setNews] = useState<HomeNewsItem[]>([]);
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reloadHome = async () => {
    if (!currentUser) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nextStats, nextNews, nextAnnouncements] = await Promise.all([
        loadHomeStatsService(),
        listHomeNewsService(),
        listAnnouncementsService({ status: 'open', limit: 5 })
      ]);
      setStats(nextStats);
      setNews(nextNews);
      setAnnouncements(nextAnnouncements);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de charger l'accueil.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reloadHome();
  }, [currentUser?.id]);

  return (
    <Layout>
      <section className="home-hero card">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">Accueil</p>
          <h1>Bienvenue sur Nexus Forge</h1>
          <p className="home-hero__copy">
            Retrouve ici les nouvelles du site, les annonces de mise en relation MJ / joueurs et les chiffres clés de l’application.
          </p>
        </div>
        <div className="home-stats-grid">
          <article className="home-stat-tile">
            <strong>{stats.runningSessions}</strong>
            <span>Parties en cours</span>
          </article>
          <article className="home-stat-tile">
            <strong>{stats.activePlayers}</strong>
            <span>Joueurs actifs</span>
          </article>
          <article className="home-stat-tile">
            <strong>{stats.activeGms}</strong>
            <span>MJ actifs</span>
          </article>
          <article className="home-stat-tile home-stat-tile--accent">
            <strong>{stats.playersLookingForGame}</strong>
            <span>Joueurs en recherche</span>
          </article>
          <article className="home-stat-tile">
            <strong>{stats.systemsCount}</strong>
            <span>Systèmes</span>
          </article>
        </div>
      </section>

      {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
      <section className="home-grid">
        <div className="home-column">
          <section className="card home-section home-section--news">
            <div className="home-section__header">
              <div>
                <p className="home-section__eyebrow">Nexus Forge</p>
                <h2>Dernières news</h2>
              </div>
              <Link className="button secondary" to="/admin/content">
                Gérer les actualités
              </Link>
            </div>
            <div className="home-feed-list">
              {news.length === 0 && !isLoading ? <p>Aucune news publiée pour le moment.</p> : null}
              {news.map((item) => (
                <article key={item.id} className="home-feed-item home-feed-item--news">
                  <div className="home-feed-item__meta">
                    <strong>{item.title}</strong>
                    {item.isPinned ? <span className="home-pill home-pill--accent">Epinglée</span> : null}
                  </div>
                  <DiscordMarkdown content={item.content} className="home-news-markdown" />
                  <small>
                    Par {item.createdByNickname || item.createdByDisplayName} · {new Date(item.publishedAt || item.updatedAt).toLocaleString('fr-FR')}
                  </small>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className="home-column">
          <section className="card home-section home-section--announcements">
            <div className="home-section__header">
              <div>
                <p className="home-section__eyebrow">Mise en relation</p>
                <h2>Annonces</h2>
              </div>
              <Link className="button secondary" to="/announcements">
                Voir / gérer les annonces
              </Link>
            </div>
            <div className="home-feed-list">
              {announcements.length === 0 && !isLoading ? <p>Aucune annonce ouverte pour le moment.</p> : null}
              {announcements.map((item) => {
                return (
                  <article key={item.id} className="home-feed-item home-feed-item--announcement home-feed-item--announcement-compact">
                    <div className="home-feed-item__meta">
                      <strong><DiscordMarkdown content={item.summary} inline className="home-announcement-markdown" /></strong>
                      <span className={`home-pill ${item.status === 'open' ? 'home-pill--success' : ''}`}>{statusLabels[item.status]}</span>
                    </div>
                    <p className="home-feed-item__inline-meta">
                      {currentUser?.id === item.authorUserId ? (
                        <span className="home-author-link is-self">@{item.authorNickname || item.authorDisplayName}</span>
                      ) : (
                        <Link className="home-author-link" to={`/messages?user=${encodeURIComponent(item.authorUserId)}`}>
                          @{item.authorNickname || item.authorDisplayName}
                        </Link>
                      )}
                      <span>{playModeLabels[item.playMode]}</span>
                      <span>Langue : {item.language.toUpperCase()}</span>
                      {item.periodicity ? <span>{periodicityLabels[item.periodicity]}</span> : null}
                      {item.playerSlotsWanted ? <span>{item.playerSlotsWanted} joueur(s)</span> : null}
                    </p>
                    <small>Mis à jour le {new Date(item.updatedAt).toLocaleString('fr-FR')}</small>
                    <div className="home-feed-item__actions">
                      {currentUser?.id !== item.authorUserId ? (
                        <Link className="button secondary" to={`/messages?user=${encodeURIComponent(item.authorUserId)}`}>
                          Contacter
                        </Link>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </Layout>
  );
}
