import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import Layout from '../../../components/Layout';

const FEATURES = [
  {
    title: 'Parties en ligne et hors ligne',
    description:
      'Prépare une partie, synchronise les fiches et les documents, puis continue sur téléphone ou tablette même sans réseau.'
  },
  {
    title: 'Studio système',
    description:
      'Construis des fiches de personnage visuelles, avec vues, onglets, variables, répétitions et rendu utilisable directement en partie.'
  },
  {
    title: 'Studio Ecrans',
    description:
      'Compose des écrans MJ, joueur, tablette ou mobile avec des widgets sur grille, y compris plusieurs écrans PC en même temps pour piloter la table.'
  },
  {
    title: 'Documents et ressources',
    description:
      'Centralise PDF, images, médias et notes de partie, avec partage contrôlé et cache local pour garder l’essentiel sous la main.'
  }
];

const STEPS = [
  'Créer un compte gratuitement',
  'Construire ou dupliquer un système',
  'Créer une partie et inviter les joueurs',
  'Préparer le cache mobile pour jouer partout'
];

const AUDIENCES = [
  {
    eyebrow: 'Pour les MJ',
    title: 'Préparer et piloter la table',
    description:
      'Crée tes systèmes, compose tes écrans, organise les documents de partie et utilise plusieurs écrans PC en même temps pour garder la maîtrise de la séance.'
  },
  {
    eyebrow: 'Pour les joueurs',
    title: 'Retrouver sa fiche et jouer simplement',
    description:
      'Accède à tes personnages, remplis ta fiche, consulte les documents partagés et retrouve une interface claire, pensée pour jouer sans surcharge.'
  },
  {
    eyebrow: 'Mobile et tablette',
    title: 'Continuer même sans réseau',
    description:
      'Prépare le cache local, emporte les fiches et les ressources nécessaires, puis laisse l’application resynchroniser automatiquement au retour en ligne.'
  }
];

const SHOWCASE = [
  {
    title: 'Accueil connecté',
    description: 'Vue d’ensemble de la plateforme une fois connecté, avec actualités, annonces et indicateurs utiles.',
    image: '/showcase/home.png',
    alt: 'Capture réelle de l’accueil connecté Nexus Forge'
  },
  {
    title: 'Mes fichiers',
    description: 'Gestion des documents, dossiers, partage et état de synchronisation dans une vue pensée pour le jeu.',
    image: '/showcase/resources.png',
    alt: 'Capture réelle du gestionnaire Mes fichiers Nexus Forge'
  },
  {
    title: 'Studio Ecrans',
    description: 'Construction visuelle d’écrans sur grille avec widgets pour MJ, joueurs, tablette ou mobile.',
    image: '/showcase/screen-studio.png',
    alt: 'Capture réelle du Studio Ecrans Nexus Forge'
  }
];

export default function PublicLandingPage() {
  const [mobileQrCode, setMobileQrCode] = useState<string | null>(null);
  const mobileAppAbsoluteUrl = useMemo(() => 'https://play.google.com/apps/testing/fr.enligne.nexusforge', []);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(mobileAppAbsoluteUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: '#0f172a',
        light: '#f8fafc'
      }
    })
      .then((dataUrl: string) => {
        if (active) {
          setMobileQrCode(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setMobileQrCode(null);
        }
      });

    return () => {
      active = false;
    };
  }, [mobileAppAbsoluteUrl]);

  return (
    <Layout wide>
      <section className="landing-hero card">
        <div className="landing-hero__content">
          <p className="home-hero__eyebrow">JDR en ligne, tablette et mobile</p>
          <h1>Nexus Forge est une plateforme gratuite pour créer, organiser et jouer.</h1>
          <p className="landing-hero__copy">
            Nexus Forge permet aux MJ et aux joueurs de construire leurs systèmes, préparer leurs écrans, gérer leurs personnages,
            partager leurs documents et continuer à jouer même sans connexion.
          </p>
          <div className="landing-hero__actions">
            <Link className="button" to="/register">
              Créer un compte gratuitement
            </Link>
            <Link className="button secondary" to="/login">
              Se connecter
            </Link>
            <a className="button secondary" href={mobileAppAbsoluteUrl} target="_blank" rel="noreferrer">
              Rejoindre le test Android
            </a>
            <Link className="button secondary" to="/privacy">
              Règles de confidentialité
            </Link>
          </div>
          <div className="landing-hero__free">
            <strong>Gratuit</strong>
            <span>Pas de compte premium requis pour créer, tester et jouer.</span>
          </div>
        </div>
      </section>

      <section className="landing-grid">
        <section className="card landing-section">
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Fonctionnalités</p>
              <h2>Ce que tu peux faire avec Nexus Forge</h2>
            </div>
          </div>
          <div className="landing-feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="landing-feature-card">
                <strong>{feature.title}</strong>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card landing-section">
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Démarrage</p>
              <h2>Prise en main en quelques étapes</h2>
            </div>
          </div>
          <ol className="landing-steps">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </section>

      <section className="card landing-section">
        <div className="landing-section__header">
          <div>
            <p className="home-section__eyebrow">Pour qui</p>
            <h2>Une plateforme pensée pour chaque rôle à la table</h2>
          </div>
        </div>
        <div className="landing-audience-grid">
          {AUDIENCES.map((audience) => (
            <article key={audience.title} className="landing-audience-card">
              <p className="landing-audience-card__eyebrow">{audience.eyebrow}</p>
              <strong>{audience.title}</strong>
              <p>{audience.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card landing-section">
        <div className="landing-section__header">
          <div>
            <p className="home-section__eyebrow">En images</p>
            <h2>Quelques vues réelles de la plateforme</h2>
          </div>
        </div>
        <div className="landing-showcase-grid">
          {SHOWCASE.map((item) => (
            <article key={item.title} className="landing-showcase-card">
              <div className="landing-showcase-card__image-wrap">
                <img src={item.image} alt={item.alt} className="landing-showcase-card__image" loading="lazy" />
              </div>
              <div className="landing-showcase-card__body">
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-grid">
        <section className="card landing-section">
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Mobilité</p>
              <h2>Application mobile Android</h2>
            </div>
          </div>
          <div className="landing-mobile">
            <div className="landing-mobile__copy">
              <p>
                L&apos;application mobile permet déjà de consulter les ressources, préparer des parties hors ligne, modifier les fiches
                et resynchroniser automatiquement au retour en ligne.
              </p>
              <p>
                L&apos;application Android est maintenant disponible via le programme de test Google Play.
              </p>
              <div className="landing-hero__actions">
                <a className="button" href={mobileAppAbsoluteUrl} target="_blank" rel="noreferrer">
                  Rejoindre le test Android
                </a>
                <Link className="button secondary" to="/privacy">
                  Règles de confidentialité
                </Link>
              </div>
            </div>
            {mobileQrCode ? (
              <div className="landing-mobile__qr">
                <img
                  src={mobileQrCode}
                  alt="QR code de téléchargement de l'application Android Nexus Forge"
                />
                <small>Scanner pour rejoindre le test Android</small>
              </div>
            ) : null}
          </div>
        </section>

        <section className="card landing-section">
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Pourquoi Nexus Forge</p>
              <h2>Une plateforme pensée pour la table</h2>
            </div>
          </div>
          <div className="landing-note-list">
            <article className="landing-note-card">
              <strong>Créer sans coder</strong>
              <p>Les studios te permettent de construire des fiches et des écrans visuellement, puis de les utiliser directement en partie.</p>
            </article>
            <article className="landing-note-card">
              <strong>Jouer avec plusieurs supports</strong>
              <p>Desktop, tablette et téléphone peuvent servir des rôles différents à la même table, et sur PC plusieurs écrans peuvent être utilisés en parallèle.</p>
            </article>
            <article className="landing-note-card">
              <strong>Continuer hors ligne</strong>
              <p>Les documents de partie et les fiches du joueur peuvent être préparés localement, puis resynchronisés automatiquement plus tard.</p>
            </article>
          </div>
        </section>
      </section>
    </Layout>
  );
}
