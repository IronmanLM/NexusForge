import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import { useAuth } from '../../../hooks/useAuth';
import { requestJson } from '../../../services/apiClient';

type HealthPayload = {
  ok: boolean;
  service: string;
  time: string;
  persistence?: {
    pending: boolean;
    lastPersistAt: string | null;
    lastPersistReason: string | null;
    lastPersistHash: string | null;
    persistLogFile: string | null;
  };
  startupIntegrity?: {
    status: 'ok' | 'warning' | 'error' | string;
    checkedAt: string;
    loaded?: {
      file?: string | null;
      hash?: string | null;
      stats?: Record<string, number> | null;
    } | null;
    references?: {
      lastPersistLog?: {
        at?: string | null;
        reason?: string | null;
        hash?: string | null;
        stats?: Record<string, number> | null;
      } | null;
      latestHistorySnapshot?: {
        file?: string | null;
        fileName?: string | null;
        hash?: string | null;
        stats?: Record<string, number> | null;
      } | null;
    } | null;
    warnings?: Array<{
      kind?: string;
      label?: string;
      regressedKeys?: string[];
      delta?: Record<string, number>;
      expectedHash?: string;
      loadedHash?: string;
      message?: string;
    }>;
  };
};

function formatDate(value?: string | null) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function renderStats(stats?: Record<string, number> | null) {
  if (!stats || Object.keys(stats).length === 0) {
    return <p style={{ margin: 0 }}>Aucune statistique.</p>;
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
      {Object.entries(stats).map(([key, value]) => (
        <div key={key} className="card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>{key}</div>
          <strong style={{ fontSize: '1.1rem' }}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function AdminPersistenceHealthPage() {
  const { currentUser } = useAuth();
  const isAdmin = Boolean(currentUser?.roles.includes('admin'));
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const payload = await requestJson<HealthPayload>({
        path: '/health',
        method: 'GET',
        withAuth: false
      });
      setHealth(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impossible de charger la santé backend.');
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

  const startupStatus = health?.startupIntegrity?.status || 'unknown';
  const startupColor =
    startupStatus === 'ok' ? '#12b76a' : startupStatus === 'warning' ? '#f79009' : startupStatus === 'error' ? '#f04438' : '#98a2b3';

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: '0.35rem' }}>Santé persistance</h1>
            <p style={{ marginBottom: 0 }}>
              Contrôle rapide de l’état disque, du dernier persist connu et de l’audit d’intégrité au démarrage.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/admin/content" className="button secondary">
              Admin contenu
            </Link>
            <Button onClick={() => void reload()} disabled={isLoading}>
              Rafraîchir
            </Button>
          </div>
        </div>
      </section>

      {errorMessage ? <p className="home-alert home-alert--error">{errorMessage}</p> : null}

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>État backend</h2>
        {isLoading && !health ? <p>Chargement…</p> : null}
        {health ? (
          <div className="grid" style={{ gap: '0.75rem' }}>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Service : <strong>{health.service}</strong></span>
              <span>Heure serveur : <strong>{formatDate(health.time)}</strong></span>
              <span>Persist en attente : <strong>{health.persistence?.pending ? 'Oui' : 'Non'}</strong></span>
              <span>Dernier persist : <strong>{formatDate(health.persistence?.lastPersistAt || null)}</strong></span>
              <span>Raison : <strong>{health.persistence?.lastPersistReason || '—'}</strong></span>
              <span>Hash : <strong>{health.persistence?.lastPersistHash || '—'}</strong></span>
              <span>Journal : <code>{health.persistence?.persistLogFile || '—'}</code></span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Audit de démarrage</h2>
        {health?.startupIntegrity ? (
          <div className="grid" style={{ gap: '1rem' }}>
            <p style={{ margin: 0 }}>
              Statut : <strong style={{ color: startupColor }}>{startupStatus}</strong>
            </p>
            <p style={{ margin: 0 }}>Vérifié le : <strong>{formatDate(health.startupIntegrity.checkedAt)}</strong></p>
            <div>
              <h3 style={{ marginTop: 0 }}>État chargé</h3>
              <p><code>{health.startupIntegrity.loaded?.file || '—'}</code></p>
              <p>Hash chargé : <strong>{health.startupIntegrity.loaded?.hash || '—'}</strong></p>
              {renderStats(health.startupIntegrity.loaded?.stats || null)}
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Références</h3>
              <div className="grid" style={{ gap: '0.75rem' }}>
                <div className="card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)' }}>
                  <strong>Dernier persist connu</strong>
                  <p style={{ marginBottom: '0.35rem' }}>Date : {formatDate(health.startupIntegrity.references?.lastPersistLog?.at || null)}</p>
                  <p style={{ marginBottom: '0.35rem' }}>Raison : {health.startupIntegrity.references?.lastPersistLog?.reason || '—'}</p>
                  <p style={{ marginBottom: '0.35rem' }}>Hash : {health.startupIntegrity.references?.lastPersistLog?.hash || '—'}</p>
                  {renderStats(health.startupIntegrity.references?.lastPersistLog?.stats || null)}
                </div>
                <div className="card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)' }}>
                  <strong>Dernier snapshot historique</strong>
                  <p style={{ marginBottom: '0.35rem' }}>
                    Fichier : <code>{health.startupIntegrity.references?.latestHistorySnapshot?.fileName || '—'}</code>
                  </p>
                  <p style={{ marginBottom: '0.35rem' }}>Hash : {health.startupIntegrity.references?.latestHistorySnapshot?.hash || '—'}</p>
                  {renderStats(health.startupIntegrity.references?.latestHistorySnapshot?.stats || null)}
                </div>
              </div>
            </div>
            <div>
              <h3 style={{ marginTop: 0 }}>Warnings</h3>
              {health.startupIntegrity.warnings && health.startupIntegrity.warnings.length > 0 ? (
                <div className="grid" style={{ gap: '0.75rem' }}>
                  {health.startupIntegrity.warnings.map((warning, index) => (
                    <div key={`${warning.kind || 'warning'}-${index}`} className="card" style={{ padding: '0.75rem', borderColor: 'rgba(247, 144, 9, 0.6)' }}>
                      <p style={{ marginTop: 0 }}><strong>{warning.kind || 'warning'}</strong>{warning.label ? ` · ${warning.label}` : ''}</p>
                      {warning.message ? <p>{warning.message}</p> : null}
                      {warning.expectedHash || warning.loadedHash ? (
                        <p>
                          attendu : <code>{warning.expectedHash || '—'}</code><br />
                          chargé : <code>{warning.loadedHash || '—'}</code>
                        </p>
                      ) : null}
                      {warning.delta ? (
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                          {Object.entries(warning.delta)
                            .filter(([, value]) => Number(value) < 0)
                            .map(([key, value]) => (
                              <li key={key}>
                                {key}: {value}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0 }}>Aucun warning sur le dernier démarrage.</p>
              )}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0 }}>Aucun rapport de démarrage disponible.</p>
        )}
      </section>
    </Layout>
  );
}
