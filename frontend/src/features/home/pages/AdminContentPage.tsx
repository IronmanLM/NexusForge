import { FormEvent, useEffect, useState } from 'react';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import DiscordMarkdown from '../../../components/DiscordMarkdown';
import {
  createHomeNewsService,
  deleteAnnouncementService,
  deleteHomeNewsService,
  listAnnouncementsService,
  listHomeNewsService,
  publishDiscordReleaseService,
  updateAnnouncementService,
  updateHomeNewsService
} from '../../../services/homeService';
import { AnnouncementStatus, HomeAnnouncement, HomeNewsItem } from '../../../types/home';
import { useAuth } from '../../../hooks/useAuth';
import { Link, Navigate } from 'react-router-dom';

const statusLabels: Record<AnnouncementStatus, string> = {
  open: 'Ouverte',
  closed: 'Clôturée'
};

export default function AdminContentPage() {
  const { currentUser } = useAuth();
  const isAdmin = Boolean(currentUser?.roles.includes('admin'));
  const [news, setNews] = useState<HomeNewsItem[]>([]);
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([]);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsPinned, setNewsPinned] = useState(false);
  const [releaseTitle, setReleaseTitle] = useState('');
  const [releaseSummary, setReleaseSummary] = useState('');
  const [releasePlatform, setReleasePlatform] = useState('android');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseLink, setReleaseLink] = useState('https://play.google.com/apps/testing/fr.enligne.nexusforge');
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [editingNewsTitle, setEditingNewsTitle] = useState('');
  const [editingNewsContent, setEditingNewsContent] = useState('');
  const [editingNewsPinned, setEditingNewsPinned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const reload = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nextNews, nextAnnouncements] = await Promise.all([listHomeNewsService(), listAnnouncementsService()]);
      setNews(nextNews);
      setAnnouncements(nextAnnouncements);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger le contenu.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void reload();
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  const handleNewsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await createHomeNewsService({
        title: newsTitle,
        content: newsContent,
        isPinned: newsPinned,
        isPublished: true
      });
      setNewsTitle('');
      setNewsContent('');
      setNewsPinned(false);
      setStatusMessage('News publiée.');
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Publication impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEditNews = async () => {
    if (!editingNewsId) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await updateHomeNewsService(editingNewsId, {
        title: editingNewsTitle,
        content: editingNewsContent,
        isPinned: editingNewsPinned
      });
      setEditingNewsId(null);
      setEditingNewsTitle('');
      setEditingNewsContent('');
      setEditingNewsPinned(false);
      setStatusMessage('News mise à jour.');
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mise à jour impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNews = async (item: HomeNewsItem) => {
    if (!window.confirm(`Supprimer la news "${item.title}" ?`)) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await deleteHomeNewsService(item.id);
      setStatusMessage('News supprimée.');
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAnnouncementStatus = async (item: HomeAnnouncement) => {
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await updateAnnouncementService(item.id, {
        status: item.status === 'open' ? 'closed' : 'open'
      });
      setStatusMessage(item.status === 'open' ? 'Annonce clôturée.' : 'Annonce réouverte.');
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Mise à jour impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (item: HomeAnnouncement) => {
    if (!window.confirm('Supprimer cette annonce ?')) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await deleteAnnouncementService(item.id);
      setStatusMessage('Annonce supprimée.');
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishDiscordRelease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await publishDiscordReleaseService({
        title: releaseTitle,
        summary: releaseSummary,
        platform: releasePlatform,
        version: releaseVersion,
        link: releaseLink
      });
      setStatusMessage('Annonce Discord de release publiée.');
      setReleaseTitle('');
      setReleaseSummary('');
      setReleaseVersion('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Publication Discord impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Admin contenu</h1>
        <p style={{ marginBottom: 0 }}>
          Gère ici les actualités visibles sur l’accueil et modère les annonces publiées par les utilisateurs.
        </p>
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/admin/persistence" className="button secondary">
            Santé persistance
          </Link>
        </div>
      </section>

      {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
      {statusMessage ? <p className="home-alert home-alert--success">{statusMessage}</p> : null}

      <section className="card home-section" style={{ marginBottom: '1rem' }}>
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Discord</p>
            <h2>Publier une release vers le bot</h2>
          </div>
        </div>
        <form className="home-news-form" onSubmit={handlePublishDiscordRelease}>
          <label htmlFor="discordReleaseTitle">Titre</label>
          <input id="discordReleaseTitle" value={releaseTitle} onChange={(event) => setReleaseTitle(event.target.value)} required />
          <div className="home-form-row">
            <div>
              <label htmlFor="discordReleasePlatform">Plateforme</label>
              <select id="discordReleasePlatform" value={releasePlatform} onChange={(event) => setReleasePlatform(event.target.value)}>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="web">Web</option>
                <option value="general">Général</option>
              </select>
            </div>
            <div>
              <label htmlFor="discordReleaseVersion">Version</label>
              <input id="discordReleaseVersion" value={releaseVersion} onChange={(event) => setReleaseVersion(event.target.value)} placeholder="1.0.1" />
            </div>
          </div>
          <label htmlFor="discordReleaseSummary">Résumé</label>
          <textarea
            id="discordReleaseSummary"
            rows={5}
            value={releaseSummary}
            onChange={(event) => setReleaseSummary(event.target.value)}
            required
          />
          <small className="home-field-help">
            Même syntaxe Markdown que pour les news. Le bot Discord recevra la version texte structurée.
          </small>
          {releaseSummary.trim() ? (
            <div className="home-news-preview">
              <strong>Aperçu</strong>
              <DiscordMarkdown content={releaseSummary} className="home-news-markdown" />
            </div>
          ) : null}
          <label htmlFor="discordReleaseLink">Lien</label>
          <input id="discordReleaseLink" value={releaseLink} onChange={(event) => setReleaseLink(event.target.value)} placeholder="https://..." />
          <Button type="submit" disabled={isSaving}>
            Publier vers Discord
          </Button>
        </form>
      </section>

      <section className="card home-section" style={{ marginBottom: '1rem' }}>
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Actualités</p>
            <h2>Publier une news</h2>
          </div>
        </div>
        <form className="home-news-form" onSubmit={handleNewsSubmit}>
          <label htmlFor="homeNewsTitle">Titre</label>
          <input id="homeNewsTitle" value={newsTitle} onChange={(event) => setNewsTitle(event.target.value)} required />
          <label htmlFor="homeNewsContent">Contenu</label>
          <textarea id="homeNewsContent" rows={5} value={newsContent} onChange={(event) => setNewsContent(event.target.value)} required />
          <small className="home-field-help">
            Mise en forme supportée : titres `#`, listes `-`, gras `**texte**`, italique `*texte*`, souligné `__texte__`,
            barré `~~texte~~`, code `` `code` ``, liens `[label](https://...)`.
          </small>
          {newsContent.trim() ? (
            <div className="home-news-preview">
              <strong>Aperçu</strong>
              <DiscordMarkdown content={newsContent} className="home-news-markdown" />
            </div>
          ) : null}
          <label className="home-inline-checkbox">
            <input type="checkbox" checked={newsPinned} onChange={(event) => setNewsPinned(event.target.checked)} />
            <span>Epingler la news</span>
          </label>
          <Button type="submit" disabled={isSaving}>
            Publier la news
          </Button>
        </form>
        <div className="home-feed-list">
          {isLoading ? <p>Chargement...</p> : null}
          {!isLoading && news.length === 0 ? <p>Aucune news publiée pour le moment.</p> : null}
          {news.map((item) => (
            <article key={item.id} className="home-feed-item">
              {editingNewsId === item.id ? (
                <div className="home-news-form">
                  <label htmlFor={`editNewsTitle-${item.id}`}>Titre</label>
                  <input id={`editNewsTitle-${item.id}`} value={editingNewsTitle} onChange={(event) => setEditingNewsTitle(event.target.value)} />
                  <label htmlFor={`editNewsContent-${item.id}`}>Contenu</label>
                  <textarea id={`editNewsContent-${item.id}`} rows={5} value={editingNewsContent} onChange={(event) => setEditingNewsContent(event.target.value)} />
                  <small className="home-field-help">
                    Mise en forme Discord/Markdown supportée sur le site et dans le bot.
                  </small>
                  {editingNewsContent.trim() ? (
                    <div className="home-news-preview">
                      <strong>Aperçu</strong>
                      <DiscordMarkdown content={editingNewsContent} className="home-news-markdown" />
                    </div>
                  ) : null}
                  <label className="home-inline-checkbox">
                    <input type="checkbox" checked={editingNewsPinned} onChange={(event) => setEditingNewsPinned(event.target.checked)} />
                    <span>Epingler la news</span>
                  </label>
                </div>
              ) : (
                <>
                  <div className="home-feed-item__meta">
                    <strong>{item.title}</strong>
                    {item.isPinned ? <span className="home-pill home-pill--accent">Epinglée</span> : null}
                  </div>
                  <DiscordMarkdown content={item.content} className="home-news-markdown" />
                  <small>
                    Par {item.createdByDisplayName} · {new Date(item.publishedAt || item.updatedAt).toLocaleString('fr-FR')}
                  </small>
                </>
              )}
              <div className="home-feed-item__actions">
                {editingNewsId === item.id ? (
                  <>
                    <Button type="button" onClick={() => void handleSaveEditNews()} disabled={isSaving}>
                      Enregistrer
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEditingNewsId(null);
                        setEditingNewsTitle('');
                        setEditingNewsContent('');
                        setEditingNewsPinned(false);
                      }}
                      disabled={isSaving}
                    >
                      Annuler
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingNewsId(item.id);
                      setEditingNewsTitle(item.title);
                      setEditingNewsContent(item.content);
                      setEditingNewsPinned(item.isPinned);
                    }}
                    disabled={isSaving}
                  >
                    Editer
                  </Button>
                )}
                <Button type="button" variant="danger" onClick={() => void handleDeleteNews(item)} disabled={isSaving}>
                  Supprimer
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card home-section">
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Modération</p>
            <h2>Annonces publiées</h2>
          </div>
        </div>
        <div className="home-feed-list">
          {isLoading ? <p>Chargement...</p> : null}
          {!isLoading && announcements.length === 0 ? <p>Aucune annonce publiée.</p> : null}
          {announcements.map((item) => (
            <article key={item.id} className="home-feed-item">
              <div className="home-feed-item__meta">
                <strong><DiscordMarkdown content={item.summary} inline className="home-announcement-markdown" /></strong>
                <span className={`home-pill ${item.status === 'open' ? 'home-pill--success' : ''}`}>{statusLabels[item.status]}</span>
              </div>
              <p>Par @{item.authorNickname || item.authorDisplayName}</p>
              <small>Mis à jour le {new Date(item.updatedAt).toLocaleString('fr-FR')}</small>
              <div className="home-feed-item__actions">
                <Button type="button" variant="secondary" onClick={() => void handleToggleAnnouncementStatus(item)} disabled={isSaving}>
                  {item.status === 'open' ? 'Clôturer' : 'Réouvrir'}
                </Button>
                <Button type="button" variant="danger" onClick={() => void handleDeleteAnnouncement(item)} disabled={isSaving}>
                  Supprimer
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
