import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { useI18n } from '../../../hooks/useI18n';
import { getStoredTheme, persistTheme, ThemeMode } from '../../../theme';

export default function SettingsPage() {
  const { locale, setLocale, supportedLocales } = useI18n();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [status, setStatus] = useState<string | null>(null);
  const [mobileQrCode, setMobileQrCode] = useState<string | null>(null);
  const mobileAppAbsoluteDownloadUrl = useMemo(() => 'https://play.google.com/apps/testing/fr.enligne.nexusforge', []);

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(mobileAppAbsoluteDownloadUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: '#0f172a',
        light: '#f8fafc'
      }
    }).then((dataUrl: string) => {
      if (active) {
        setMobileQrCode(dataUrl);
      }
    }).catch(() => {
      if (active) {
        setMobileQrCode(null);
      }
    });
    return () => {
      active = false;
    };
  }, [mobileAppAbsoluteDownloadUrl]);

  const handleSave = () => {
    persistTheme(theme);
    setStatus('Paramètres enregistrés.');
  };

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Paramètres</h1>
        <p style={{ marginBottom: 0 }}>
          Ici on regroupe les préférences de l’application côté utilisateur: langue, thème et outils de personnalisation.
        </p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Application</h2>
        <div className="grid">
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Langue</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as (typeof supportedLocales)[number])}>
              {supportedLocales.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Thème</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value === 'light' ? 'light' : 'dark')}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: '0.9rem' }}>
          <Button type="button" onClick={handleSave}>
            Enregistrer les paramètres
          </Button>
        </div>

        {status ? <p style={{ color: '#067647', marginBottom: 0 }}>{status}</p> : null}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Application mobile</h2>
        <p>
          L&apos;application Android est maintenant distribuée via le programme de test Google Play. Rejoins le test
          pour installer les nouvelles versions plus simplement.
        </p>
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <a href={mobileAppAbsoluteDownloadUrl} target="_blank" rel="noreferrer">
              Rejoindre le test Android sur Google Play
            </a>
            <small>Le QR code ci-contre pointe vers la page officielle de test Google Play.</small>
          </div>
          {mobileQrCode ? (
            <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'center' }}>
              <img
                src={mobileQrCode}
                alt="QR code de téléchargement de l'application mobile Nexus Forge"
                style={{ width: '180px', height: '180px', borderRadius: '16px', background: '#f8fafc', padding: '0.5rem', border: '1px solid #d0d5dd' }}
              />
              <small>Scanner depuis le téléphone</small>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Outils</h2>
        <p>
          Le dictionnaire permet de surcharger les traductions visibles dans l’application, sans toucher au code. Les
          convertisseurs et outils auteurs sont regroupés dans la section dédiée `Outils`.
        </p>
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <Link to="/tools">Ouvrir les outils</Link>
          <Link to="/i18n-dictionary">Ouvrir le dictionnaire</Link>
        </div>
      </section>
    </Layout>
  );
}
