import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../../components/Layout';
import { useAuth } from '../../../hooks/useAuth';
import { completeDiscordLinkService, mapAuthErrorMessage } from '../../../services/authService';

export default function DiscordCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, isLoading, reloadCurrentUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Connexion à Discord en cours...');
  const hasStartedRef = useRef(false);

  const code = useMemo(() => searchParams.get('code') || '', [searchParams]);
  const state = useMemo(() => searchParams.get('state') || '', [searchParams]);
  const remoteError = useMemo(() => searchParams.get('error') || '', [searchParams]);

  useEffect(() => {
    if (isLoading || hasStartedRef.current) {
      return;
    }

    if (!currentUser) {
      setStatus('error');
      setMessage('La liaison Discord nécessite une session Nexus Forge active.');
      return;
    }

    if (remoteError) {
      setStatus('error');
      setMessage(`Discord a refusé l’autorisation: ${remoteError}`);
      return;
    }

    if (!code || !state) {
      setStatus('error');
      setMessage('Le retour OAuth2 Discord est incomplet.');
      return;
    }

    hasStartedRef.current = true;
    void completeDiscordLinkService({ code, state })
      .then(async () => {
        await reloadCurrentUser();
        setStatus('success');
        setMessage('Compte Discord lié avec succès.');
        window.setTimeout(() => {
          navigate('/profile', { replace: true });
        }, 1200);
      })
      .catch((error) => {
        setStatus('error');
        setMessage(mapAuthErrorMessage(error));
      });
  }, [code, currentUser, isLoading, navigate, reloadCurrentUser, remoteError, state]);

  if (!isLoading && !currentUser && !code && !state && !remoteError) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <section className="card">
        <h1 style={{ marginTop: 0 }}>Connexion Discord</h1>
        <p style={{ marginBottom: 0 }}>
          {message}
        </p>
        {status === 'success' ? <p style={{ color: '#067647', marginBottom: 0 }}>Redirection vers le profil…</p> : null}
        {status === 'error' ? <p style={{ color: '#b42318', marginBottom: 0 }}>Tu peux revenir au profil et relancer la liaison.</p> : null}
      </section>
    </Layout>
  );
}
