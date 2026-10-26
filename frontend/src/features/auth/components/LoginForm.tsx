import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../../components/Button';

type LoginSubmitParams = {
  email: string;
  password: string;
  totpCode?: string;
  challengeToken?: string;
};

type LoginFormResult =
  | { status: 'authenticated' }
  | { status: 'requires_2fa'; challengeToken: string }
  | { status: 'error'; message: string };

type LoginFormProps = {
  onSubmit: (params: LoginSubmitParams) => Promise<LoginFormResult>;
};

export default function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit({
        email,
        password,
        ...(totpCode ? { totpCode } : {}),
        ...(challengeToken ? { challengeToken } : {})
      });

      if (result.status === 'requires_2fa') {
        setChallengeToken(result.challengeToken);
        return;
      }

      if (result.status === 'error') {
        setError(result.message);
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Connexion impossible.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        placeholder="mj@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        disabled={Boolean(challengeToken)}
      />

      <label htmlFor="password">Mot de passe</label>
      <input
        id="password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        disabled={Boolean(challengeToken)}
      />

      {challengeToken ? (
        <>
          <label htmlFor="totp">Code 2FA (TOTP)</label>
          <input
            id="totp"
            type="text"
            placeholder="123456"
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value)}
            inputMode="numeric"
            required
          />
          <p style={{ margin: 0, color: '#475467' }}>Saisis le code de ton application d&apos;authentification.</p>
        </>
      ) : null}

      {error ? <p style={{ color: '#b42318', margin: 0 }}>{error}</p> : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Connexion...' : challengeToken ? 'Valider le code 2FA' : 'Se connecter'}
      </Button>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Link to="/register">Créer un compte</Link>
        <Link to="/forgot-password">Mot de passe oublié</Link>
      </div>
    </form>
  );
}
