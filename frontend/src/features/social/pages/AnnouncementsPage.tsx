import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { useAuth } from '../../../hooks/useAuth';
import {
  createAnnouncementService,
  deleteAnnouncementService,
  listAnnouncementsService,
  updateAnnouncementService
} from '../../../services/homeService';
import {
  AnnouncementDay,
  AnnouncementPeriodicity,
  AnnouncementPlayMode,
  AnnouncementStatus,
  AnnouncementTimeSlot,
  AnnouncementType,
  HomeAnnouncement
} from '../../../types/home';
import { GameSystem } from '../../../types/system';
import { systemRepository } from '../../../data/repositories';

const playModeLabels: Record<AnnouncementPlayMode, string> = {
  online: 'En ligne',
  onsite: 'Présentiel',
  hybrid: 'Hybride'
};

const statusLabels: Record<AnnouncementStatus, string> = {
  open: 'Ouverte',
  closed: 'Clôturée'
};

const typeLabels: Record<AnnouncementType, string> = {
  player_looking_for_game: 'Joueur cherche partie',
  gm_looking_for_players: 'MJ cherche joueurs'
};

const dayOptions: Array<{ value: AnnouncementDay; label: string }> = [
  { value: 'monday', label: 'Lundi' },
  { value: 'tuesday', label: 'Mardi' },
  { value: 'wednesday', label: 'Mercredi' },
  { value: 'thursday', label: 'Jeudi' },
  { value: 'friday', label: 'Vendredi' },
  { value: 'saturday', label: 'Samedi' },
  { value: 'sunday', label: 'Dimanche' }
];

const timeSlotOptions: Array<{ value: AnnouncementTimeSlot; label: string }> = [
  { value: 'morning', label: 'Matin' },
  { value: 'midday', label: 'Midi' },
  { value: 'afternoon', label: 'Après-midi' },
  { value: 'late_afternoon', label: 'Fin d’après-midi' },
  { value: 'evening', label: 'Soirée' }
];

const periodicityOptions: Array<{ value: AnnouncementPeriodicity; label: string }> = [
  { value: 'one_shot', label: 'Ponctuel' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'biweekly', label: 'Toutes les 2 semaines' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'irregular', label: 'Irrégulier' }
];

function toggleListValue<T extends string>(current: T[], value: T) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export default function AnnouncementsPage() {
  const { currentUser } = useAuth();
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([]);
  const [systems, setSystems] = useState<GameSystem[]>([]);
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>('player_looking_for_game');
  const [announcementSystemId, setAnnouncementSystemId] = useState('');
  const [announcementSystemName, setAnnouncementSystemName] = useState('');
  const [announcementLanguage, setAnnouncementLanguage] = useState('fr');
  const [announcementPlayMode, setAnnouncementPlayMode] = useState<AnnouncementPlayMode>('online');
  const [announcementSlots, setAnnouncementSlots] = useState(3);
  const [announcementDays, setAnnouncementDays] = useState<AnnouncementDay[]>([]);
  const [announcementTimeSlots, setAnnouncementTimeSlots] = useState<AnnouncementTimeSlot[]>([]);
  const [announcementPeriodicity, setAnnouncementPeriodicity] = useState<AnnouncementPeriodicity | ''>('');

  const [filterType, setFilterType] = useState<AnnouncementType | ''>('');
  const [filterSystemId, setFilterSystemId] = useState('');
  const [filterLanguage, setFilterLanguage] = useState('');
  const [filterPlayMode, setFilterPlayMode] = useState<AnnouncementPlayMode | ''>('');
  const [filterPeriodicity, setFilterPeriodicity] = useState<AnnouncementPeriodicity | ''>('');
  const [filterDays, setFilterDays] = useState<AnnouncementDay[]>([]);
  const [filterTimeSlots, setFilterTimeSlots] = useState<AnnouncementTimeSlot[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const availableSystems = useMemo(() => systems.filter((system) => system.visibility === 'public' || system.visibility === 'friends'), [systems]);
  const normalizedAnnouncements = useMemo(
    () =>
      announcements.map((item) => ({
        ...item,
        daysOfWeek: Array.isArray(item.daysOfWeek) ? item.daysOfWeek : [],
        timeSlots: Array.isArray(item.timeSlots) ? item.timeSlots : [],
        periodicity: item.periodicity || null
      })),
    [announcements]
  );
  const ownAnnouncements = useMemo(
    () => normalizedAnnouncements.filter((item) => item.authorUserId === currentUser?.id),
    [normalizedAnnouncements, currentUser?.id]
  );
  const visibleAnnouncements = useMemo(
    () => normalizedAnnouncements.filter((item) => item.status === 'open' && item.authorUserId !== currentUser?.id),
    [normalizedAnnouncements, currentUser?.id]
  );

  const reload = async () => {
    if (!currentUser) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nextAnnouncements, nextSystems] = await Promise.all([
        listAnnouncementsService({
          type: filterType || undefined,
          systemId: filterSystemId || undefined,
          language: filterLanguage || undefined,
          playMode: filterPlayMode || undefined,
          periodicity: filterPeriodicity || undefined,
          daysOfWeek: filterDays,
          timeSlots: filterTimeSlots
        }),
        systemRepository.listAvailableForUser(currentUser)
      ]);
      setAnnouncements(nextAnnouncements);
      setSystems(nextSystems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger les annonces.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [currentUser?.id, filterType, filterSystemId, filterLanguage, filterPlayMode, filterPeriodicity, filterDays.join(','), filterTimeSlots.join(',')]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await createAnnouncementService({
        type: announcementType,
        systemId: announcementSystemId || null,
        systemName: announcementSystemName,
        language: announcementLanguage,
        playMode: announcementPlayMode,
        playerSlotsWanted: announcementType === 'gm_looking_for_players' ? announcementSlots : null,
        daysOfWeek: announcementDays,
        timeSlots: announcementTimeSlots,
        periodicity: announcementPeriodicity || null,
        status: 'open'
      });
      setAnnouncementSystemId('');
      setAnnouncementSystemName('');
      setAnnouncementLanguage('fr');
      setAnnouncementPlayMode('online');
      setAnnouncementSlots(3);
      setAnnouncementDays([]);
      setAnnouncementTimeSlots([]);
      setAnnouncementPeriodicity('');
      setStatusMessage('Annonce publiée.');
      await reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Annonce impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (item: HomeAnnouncement) => {
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

  const handleDelete = async (item: HomeAnnouncement) => {
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

  const resetFilters = () => {
    setFilterType('');
    setFilterSystemId('');
    setFilterLanguage('');
    setFilterPlayMode('');
    setFilterPeriodicity('');
    setFilterDays([]);
    setFilterTimeSlots([]);
  };

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Annonces</h1>
        <p style={{ marginBottom: 0 }}>
          Cette page centralise la recherche de parties et de joueurs. Les annonces sont entièrement structurées pour éviter toute publication libre à risque.
        </p>
      </section>

      {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}
      {statusMessage ? <p className="home-alert home-alert--success">{statusMessage}</p> : null}

      <section className="card home-section" style={{ marginBottom: '1rem' }}>
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Filtres</p>
            <h2>Explorer les annonces</h2>
          </div>
          <Button type="button" variant="secondary" onClick={resetFilters}>Réinitialiser</Button>
        </div>
        <div className="home-announcement-form">
          <div className="home-form-row">
            <label>
              <span>Type</span>
              <select value={filterType} onChange={(event) => setFilterType(event.target.value as AnnouncementType | '')}>
                <option value="">Tous</option>
                <option value="player_looking_for_game">Joueur cherche partie</option>
                <option value="gm_looking_for_players">MJ cherche joueurs</option>
              </select>
            </label>
            <label>
              <span>Système</span>
              <select value={filterSystemId} onChange={(event) => setFilterSystemId(event.target.value)}>
                <option value="">Tous</option>
                {availableSystems.map((system) => (
                  <option key={system.id} value={system.id}>{system.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="home-form-row">
            <label>
              <span>Langue</span>
              <select value={filterLanguage} onChange={(event) => setFilterLanguage(event.target.value)}>
                <option value="">Toutes</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="es">Español</option>
              </select>
            </label>
            <label>
              <span>Format</span>
              <select value={filterPlayMode} onChange={(event) => setFilterPlayMode(event.target.value as AnnouncementPlayMode | '')}>
                <option value="">Tous</option>
                <option value="online">En ligne</option>
                <option value="onsite">Présentiel</option>
                <option value="hybrid">Hybride</option>
              </select>
            </label>
          </div>
          <label>
            <span>Périodicité</span>
            <select value={filterPeriodicity} onChange={(event) => setFilterPeriodicity(event.target.value as AnnouncementPeriodicity | '')}>
              <option value="">Toutes</option>
              {periodicityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div>
            <span>Jours disponibles</span>
            <div className="announcement-chip-grid">
              {dayOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`announcement-chip ${filterDays.includes(option.value) ? 'is-active' : ''}`.trim()}
                  onClick={() => setFilterDays((current) => toggleListValue(current, option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span>Créneaux</span>
            <div className="announcement-chip-grid">
              {timeSlotOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`announcement-chip ${filterTimeSlots.includes(option.value) ? 'is-active' : ''}`.trim()}
                  onClick={() => setFilterTimeSlots((current) => toggleListValue(current, option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card home-section" style={{ marginBottom: '1rem' }}>
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Publier</p>
            <h2>Nouvelle annonce</h2>
          </div>
        </div>
        <form className="home-announcement-form" onSubmit={handleSubmit}>
          <label htmlFor="announcementType">Type d’annonce</label>
          <select id="announcementType" value={announcementType} onChange={(event) => setAnnouncementType(event.target.value as AnnouncementType)}>
            <option value="player_looking_for_game">Je suis joueur, je cherche une partie</option>
            <option value="gm_looking_for_players">Je suis MJ, je cherche des joueurs</option>
          </select>

          <label htmlFor="announcementSystemId">Système de jeu</label>
          <select id="announcementSystemId" value={announcementSystemId} onChange={(event) => setAnnouncementSystemId(event.target.value)}>
            <option value="">Système libre / autre</option>
            {availableSystems.map((system) => (
              <option key={system.id} value={system.id}>{system.name}</option>
            ))}
          </select>

          {!announcementSystemId ? (
            <label htmlFor="announcementSystemName">
              <span>Nom du système si absent de la liste</span>
              <input
                id="announcementSystemName"
                value={announcementSystemName}
                onChange={(event) => setAnnouncementSystemName(event.target.value)}
                placeholder="SteamShadows, Cthulhu, système maison..."
              />
            </label>
          ) : null}

          <div className="home-form-row">
            <div>
              <label htmlFor="announcementLanguage">Langue</label>
              <select id="announcementLanguage" value={announcementLanguage} onChange={(event) => setAnnouncementLanguage(event.target.value)}>
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div>
              <label htmlFor="announcementPlayMode">Format</label>
              <select id="announcementPlayMode" value={announcementPlayMode} onChange={(event) => setAnnouncementPlayMode(event.target.value as AnnouncementPlayMode)}>
                <option value="online">En ligne</option>
                <option value="onsite">Présentiel</option>
                <option value="hybrid">Hybride</option>
              </select>
            </div>
          </div>

          {announcementType === 'gm_looking_for_players' ? (
            <label htmlFor="announcementSlots">
              <span>Nombre de joueurs recherchés</span>
              <input id="announcementSlots" type="number" min={1} max={12} value={announcementSlots} onChange={(event) => setAnnouncementSlots(Number(event.target.value || 1))} />
            </label>
          ) : null}

          <div>
            <span>Jours disponibles</span>
            <div className="announcement-chip-grid">
              {dayOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`announcement-chip ${announcementDays.includes(option.value) ? 'is-active' : ''}`.trim()}
                  onClick={() => setAnnouncementDays((current) => toggleListValue(current, option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span>Créneaux</span>
            <div className="announcement-chip-grid">
              {timeSlotOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`announcement-chip ${announcementTimeSlots.includes(option.value) ? 'is-active' : ''}`.trim()}
                  onClick={() => setAnnouncementTimeSlots((current) => toggleListValue(current, option.value))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label htmlFor="announcementPeriodicity">Périodicité</label>
          <select id="announcementPeriodicity" value={announcementPeriodicity} onChange={(event) => setAnnouncementPeriodicity(event.target.value as AnnouncementPeriodicity | '')}>
            <option value="">Non précisée</option>
            {periodicityOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <Button type="submit" disabled={isSaving}>Publier l’annonce</Button>
        </form>
      </section>

      <section className="card home-section" style={{ marginBottom: '1rem' }}>
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Annonces ouvertes</p>
            <h2>Résultats</h2>
          </div>
        </div>
        <div className="home-feed-list">
          {isLoading ? <p>Chargement...</p> : null}
          {!isLoading && visibleAnnouncements.length === 0 ? <p>Aucune annonce ne correspond aux filtres.</p> : null}
          {visibleAnnouncements.map((item) => (
            <article key={item.id} className="home-feed-item home-feed-item--announcement">
              <div className="home-feed-item__meta">
                <strong>{item.summary}</strong>
                <span className={`home-pill ${item.status === 'open' ? 'home-pill--success' : ''}`}>{statusLabels[item.status]}</span>
              </div>
              <p className="home-feed-item__inline-meta">
                <Link className="home-author-link" to={`/messages?user=${encodeURIComponent(item.authorUserId)}`}>@{item.authorNickname || item.authorDisplayName}</Link>
                <span>{typeLabels[item.type]}</span>
                <span>{playModeLabels[item.playMode]}</span>
                <span>Langue : {item.language.toUpperCase()}</span>
                {item.periodicity ? <span>{periodicityOptions.find((option) => option.value === item.periodicity)?.label}</span> : null}
                {item.playerSlotsWanted ? <span>{item.playerSlotsWanted} joueur(s)</span> : null}
              </p>
              {(item.daysOfWeek.length || item.timeSlots.length) ? (
                <div className="home-feed-item__inline-meta">
                  {item.daysOfWeek.map((day) => (
                    <span key={`${item.id}-${day}`}>{dayOptions.find((option) => option.value === day)?.label}</span>
                  ))}
                  {item.timeSlots.map((slot) => (
                    <span key={`${item.id}-${slot}`}>{timeSlotOptions.find((option) => option.value === slot)?.label}</span>
                  ))}
                </div>
              ) : null}
              <small>Mis à jour le {new Date(item.updatedAt).toLocaleString('fr-FR')}</small>
              <div className="home-feed-item__actions">
                <Link className="button secondary" to={`/messages?user=${encodeURIComponent(item.authorUserId)}`}>Contacter</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card home-section">
        <div className="home-section__header">
          <div>
            <p className="home-section__eyebrow">Mes annonces</p>
            <h2>Suivi</h2>
          </div>
        </div>
        <div className="home-feed-list">
          {!isLoading && ownAnnouncements.length === 0 ? <p>Aucune annonce publiée pour le moment.</p> : null}
          {ownAnnouncements.map((item) => (
            <article key={item.id} className="home-feed-item home-feed-item--announcement">
              <div className="home-feed-item__meta">
                <strong>{item.summary}</strong>
                <span className={`home-pill ${item.status === 'open' ? 'home-pill--success' : ''}`}>{statusLabels[item.status]}</span>
              </div>
              <p className="home-feed-item__inline-meta">
                <span>@{item.authorNickname || item.authorDisplayName}</span>
                <span>{typeLabels[item.type]}</span>
                <span>{playModeLabels[item.playMode]}</span>
                <span>Langue : {item.language.toUpperCase()}</span>
                {item.periodicity ? <span>{periodicityOptions.find((option) => option.value === item.periodicity)?.label}</span> : null}
                {item.playerSlotsWanted ? <span>{item.playerSlotsWanted} joueur(s)</span> : null}
              </p>
              {(item.daysOfWeek.length || item.timeSlots.length) ? (
                <div className="home-feed-item__inline-meta">
                  {item.daysOfWeek.map((day) => (
                    <span key={`${item.id}-own-${day}`}>{dayOptions.find((option) => option.value === day)?.label}</span>
                  ))}
                  {item.timeSlots.map((slot) => (
                    <span key={`${item.id}-own-${slot}`}>{timeSlotOptions.find((option) => option.value === slot)?.label}</span>
                  ))}
                </div>
              ) : null}
              <small>Mis à jour le {new Date(item.updatedAt).toLocaleString('fr-FR')}</small>
              <div className="home-feed-item__actions">
                <Button type="button" variant="secondary" onClick={() => void handleToggleStatus(item)} disabled={isSaving}>
                  {item.status === 'open' ? 'Clôturer' : 'Réouvrir'}
                </Button>
                <Button type="button" variant="danger" onClick={() => void handleDelete(item)} disabled={isSaving}>
                  Supprimer
                </Button>
                <Link className="button secondary" to="/home">Voir l’accueil</Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </Layout>
  );
}
