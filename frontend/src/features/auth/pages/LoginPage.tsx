import { Navigate, useNavigate } from 'react-router-dom';
import Layout from '../../../components/Layout';
import BrandLogo from '../../../components/BrandLogo';
import LoginForm from '../components/LoginForm';
import { useAuth } from '../../../hooks/useAuth';
import { mapAuthErrorMessage } from '../../../services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const { currentUser, login } = useAuth();

  if (currentUser) {
    return <Navigate to="/home" replace />;
  }

  const handleLogin = async (params: {
    email: string;
    password: string;
    totpCode?: string;
    challengeToken?: string;
  }): Promise<{ status: 'authenticated' } | { status: 'requires_2fa'; challengeToken: string } | { status: 'error'; message: string }> => {
    try {
      const result = await login(params);

      if (result.status === 'requires_2fa') {
        return {
          status: 'requires_2fa',
          challengeToken: result.challengeToken
        };
      }

      navigate('/home');
      return { status: 'authenticated' };
    } catch (error) {
      return {
        status: 'error',
        message: mapAuthErrorMessage(error)
      };
    }
  };

  return (
    <Layout>
      <section className="card auth-card auth-card--brand">
        <BrandLogo variant="auth" className="auth-card__logo" alt="Nexus Forge" />
        <h1>Connexion Nexus Forge</h1>
        <p>Connexion sécurisée avec validation email, approbation admin et 2FA TOTP optionnel.</p>
        <LoginForm onSubmit={handleLogin} />
      </section>
    </Layout>
  );
}
