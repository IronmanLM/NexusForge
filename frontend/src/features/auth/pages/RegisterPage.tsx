import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import BrandLogo from '../../../components/BrandLogo';
import { registerService } from '../../../services/authService';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await registerService({ firstName, lastName, nickname, email, password });
      setSuccess(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Inscription impossible.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <section className="card auth-card auth-card--brand">
        <BrandLogo variant="auth" className="auth-card__logo" alt="Nexus Forge" />
        <h1>Créer un compte</h1>
        <p className="auth-card__lead">Le compte doit valider l’email puis être approuvé par un administrateur.</p>
        <div className="auth-benefits">
          <article className="auth-benefit">
            <strong>Validation email</strong>
            <span>L’adresse doit être confirmée avant toute activation côté admin.</span>
          </article>
          <article className="auth-benefit">
            <strong>Approbation manuelle</strong>
            <span>Chaque compte est relu avant accès à l’application.</span>
          </article>
          <article className="auth-benefit">
            <strong>Sécurité renforcée</strong>
            <span>TOTP disponible ensuite dans le profil pour sécuriser le compte.</span>
          </article>
        </div>
        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="firstName">Prénom</label>
          <input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />

          <label htmlFor="lastName">Nom</label>
          <input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} required />

          <label htmlFor="nickname">Nickname</label>
          <input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} required />

          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={10}
            required
          />

          {error ? <p style={{ color: '#b42318', margin: 0 }}>{error}</p> : null}
          {success ? <p style={{ color: '#027a48', margin: 0 }}>{success}</p> : null}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Inscription...' : "S'inscrire"}
          </Button>
          <Link to="/login">Retour connexion</Link>
        </form>
      </section>
    </Layout>
  );
}
