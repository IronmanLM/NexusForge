import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';

const STEPS = [
  'Connecte-toi à Nexus Forge avec le compte à supprimer.',
  'Va dans Profil puis Paramètres ou contacte directement le responsable du traitement.',
  'Demande explicitement la suppression du compte et des données associées.',
  'La demande est traitée manuellement afin d’éviter la suppression accidentelle d’un compte partagé ou utilisé en partie.'
];

const DATA_REMOVAL = [
  'Le compte utilisateur et ses données de profil.',
  'Les données sociales directement liées au compte, dans la mesure compatible avec le fonctionnement de la plateforme.',
  'Les données locales hors ligne encore présentes sur l’appareil si l’utilisateur nettoie le cache ou désinstalle l’application.'
];

const DATA_MAY_REMAIN = [
  'Des traces techniques strictement nécessaires à la sécurité, à l’intégrité du service ou à une obligation légale.',
  'Des contenus de partie qui ne peuvent pas être supprimés immédiatement sans casser la cohérence d’une partie partagée ; ils peuvent alors être anonymisés, dissociés ou traités manuellement.'
];

export default function AccountDeletionPage() {
  return (
    <Layout wide>
      <section className="landing-hero card">
        <div className="landing-hero__content">
          <p className="home-hero__eyebrow">Information légale</p>
          <h1>Suppression de compte</h1>
          <p className="landing-hero__copy">
            Cette page explique comment demander la suppression d’un compte Nexus Forge et ce qu’il advient des données
            associées.
          </p>
          <div className="landing-hero__actions">
            <Link className="button secondary" to="/">
              Retour à l&apos;accueil
            </Link>
            <Link className="button secondary" to="/privacy">
              Règles de confidentialité
            </Link>
            <a className="button" href="mailto:ironmanlm@en-ligne.fr?subject=Demande%20de%20suppression%20de%20compte%20Nexus%20Forge">
              Demander la suppression
            </a>
          </div>
          <div className="landing-hero__free">
            <strong>Contact</strong>
            <span>ironmanlm@en-ligne.fr</span>
          </div>
        </div>
      </section>

      <section className="landing-grid">
        <section className="card landing-section">
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Procédure</p>
              <h2>Comment demander la suppression</h2>
            </div>
          </div>
          <ol className="landing-steps">
            {STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="card landing-section">
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Traitement</p>
              <h2>Données supprimées ou conservées</h2>
            </div>
          </div>
          <div className="landing-note-list">
            <article className="landing-note-card">
              <strong>Données généralement supprimées</strong>
              {DATA_REMOVAL.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
            <article className="landing-note-card">
              <strong>Données pouvant être conservées</strong>
              {DATA_MAY_REMAIN.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          </div>
        </section>
      </section>
    </Layout>
  );
}
