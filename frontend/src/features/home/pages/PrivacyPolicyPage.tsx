import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';

const SECTIONS = [
  {
    title: '1. Responsable du traitement',
    paragraphs: [
      'La plateforme Nexus Forge est accessible sur nexusforge.en-ligne.fr et via l application mobile Android Nexus Forge.',
      'Pour toute question relative a la confidentialite ou a la gestion de tes donnees, tu peux contacter : ironmanlm@en-ligne.fr.'
    ]
  },
  {
    title: '2. Donnees traitees',
    paragraphs: [
      'Nexus Forge peut traiter les donnees que tu fournis directement : pseudo, adresse e-mail, mot de passe chiffre, roles, profils, messages, documents, fiches de personnage, contenus de parties et parametres associes.',
      'L application mobile peut aussi stocker localement, sur ton appareil, une copie de certaines donnees utiles au mode hors ligne : fiches, ressources de partie, et file d actions en attente de resynchronisation.'
    ]
  },
  {
    title: '3. Finalites',
    paragraphs: [
      'Les donnees sont utilisees pour permettre la creation de compte, l authentification, la participation a des parties, l edition de fiches, le partage de documents, la synchronisation entre appareils, et le fonctionnement du mode hors ligne.',
      'Les donnees techniques strictement necessaires peuvent aussi etre utilisees pour la securite, la maintenance, et la resolution d incidents.'
    ]
  },
  {
    title: '4. Mode hors ligne et synchronisation',
    paragraphs: [
      'Quand tu prepares une partie pour un usage hors ligne, l application peut conserver localement des fiches, des documents et des metadonnees relies a cette partie.',
      'Quand la connexion revient, l application peut resynchroniser automatiquement les modifications locales avec le serveur. Les messages prives, chats de partie et partages immediats de nouveaux fichiers ne sont pas concus pour fonctionner en temps reel hors ligne.'
    ]
  },
  {
    title: '5. Partage des donnees',
    paragraphs: [
      'Les donnees de partie et les documents ne sont visibles que selon les droits definis dans la plateforme : proprietaire, MJ, joueur, observateur, partage explicite, ou regles de partie.',
      'Nexus Forge n a pas pour vocation de vendre les donnees personnelles a des tiers.'
    ]
  },
  {
    title: '6. Conservation',
    paragraphs: [
      'Les donnees sont conservees tant que ton compte et les contenus associes restent actifs dans la plateforme, sauf demande de suppression ou obligation legale contraire.',
      'Les donnees conservees localement sur ton appareil dependent aussi de tes actions de cache hors ligne, de nettoyage du cache et de desinstallation de l application.'
    ]
  },
  {
    title: '7. Tes droits',
    paragraphs: [
      'Tu peux demander l acces, la rectification ou la suppression de tes donnees dans la mesure compatible avec le fonctionnement de la plateforme et les obligations legales applicables.',
      'Tu peux egalement supprimer localement les donnees hors ligne en nettoyant le cache ou en desinstallant l application mobile.'
    ]
  },
  {
    title: '8. Securite',
    paragraphs: [
      'Nexus Forge met en oeuvre des mesures raisonnables de securite pour proteger l acces aux comptes et aux contenus, mais aucun service en ligne ne peut garantir un risque nul.',
      'Nous te recommandons d utiliser un mot de passe unique et de proteger l acces a tes appareils.'
    ]
  },
  {
    title: '9. Mise a jour de cette page',
    paragraphs: [
      'Cette politique peut evoluer avec les fonctionnalites de la plateforme, notamment pour les fonctions mobiles et hors ligne. La date de derniere mise a jour est indiquee ci-dessous.'
    ]
  }
];

export default function PrivacyPolicyPage() {
  return (
    <Layout wide>
      <section className="landing-hero card">
        <div className="landing-hero__content">
          <p className="home-hero__eyebrow">Information legale</p>
          <h1>Règles de confidentialité</h1>
          <p className="landing-hero__copy">
            Cette page explique quelles donnees peuvent etre traitees par Nexus Forge, pourquoi elles sont utilisees,
            et comment le mode hors ligne de l application mobile fonctionne.
          </p>
          <div className="landing-hero__actions">
            <Link className="button secondary" to="/">
              Retour a l accueil
            </Link>
            <a className="button" href="mailto:ironmanlm@en-ligne.fr">
              Contacter le responsable
            </a>
          </div>
          <div className="landing-hero__free">
            <strong>Derniere mise a jour</strong>
            <span>20 mars 2026</span>
          </div>
        </div>
      </section>

      <section className="landing-grid">
        <section className="card landing-section" style={{ gridColumn: '1 / -1' }}>
          <div className="landing-section__header">
            <div>
              <p className="home-section__eyebrow">Confidentialite</p>
              <h2>Politique applicable au site web et a l application mobile</h2>
            </div>
          </div>
          <div className="landing-note-list">
            {SECTIONS.map((section) => (
              <article key={section.title} className="landing-note-card">
                <strong>{section.title}</strong>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </article>
            ))}
          </div>
        </section>
      </section>
    </Layout>
  );
}
