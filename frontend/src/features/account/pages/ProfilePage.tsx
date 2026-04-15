import { FormEvent, useEffect, useState } from 'react';
import Layout from '../../../components/Layout';
import Button from '../../../components/Button';
import ResourcePickerField from '../../../components/ResourcePickerField';
import { useAuth } from '../../../hooks/useAuth';
import {
  changePasswordService,
  startDiscordLinkService,
  disableTotpService,
  enableTotpService,
  unlinkDiscordService,
  mapAuthErrorMessage,
  setupTotpService,
  updateProfileService
} from '../../../services/authService';

export default function ProfilePage() {
  const { currentUser, reloadCurrentUser } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarResourceId, setAvatarResourceId] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [totpSetupSecret, setTotpSetupSecret] = useState<string | null>(null);
  const [totpSetupUrl, setTotpSetupUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [discordMessage, setDiscordMessage] = useState<string | null>(null);
  const [discordLoading, setDiscordLoading] = useState(false);

  useEffect(() => {
    setFirstName(currentUser?.firstName ?? '');
    setLastName(currentUser?.lastName ?? '');
    setNickname(currentUser?.nickname ?? '');
    setAvatarResourceId(currentUser?.avatarResourceId ?? '');
    setAvatarUrl(currentUser?.avatarUrl ?? '');
  }, [currentUser]);

  useEffect(() => {
    void reloadCurrentUser();
  }, [reloadCurrentUser]);

  const effectiveAvatar = avatarUrl || currentUser?.avatarUrl || null;

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setProfileMessage(null);
    setDiscordMessage(null);

    try {
      await updateProfileService({
        firstName,
        lastName,
        nickname,
        avatarResourceId: avatarResourceId || null,
        avatarUrl: avatarResourceId ? null : avatarUrl || null
      });
      await reloadCurrentUser();
      setProfileMessage('Profil mis à jour.');
    } catch (submitError) {
      setError(mapAuthErrorMessage(submitError));
    }
  };

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPasswordMessage(null);

    try {
      await changePasswordService(currentPassword, newPassword);
      setPasswordMessage('Mot de passe mis à jour.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (submitError) {
      setError(mapAuthErrorMessage(submitError));
    }
  };

  const handleStartTotpSetup = async () => {
    setError(null);
    setDiscordMessage(null);
    try {
      const response = await setupTotpService();
      setTotpSetupSecret(response.secret);
      setTotpSetupUrl(response.otpauthUrl);
    } catch (setupError) {
      setError(mapAuthErrorMessage(setupError));
    }
  };

  const handleEnableTotp = async () => {
    setError(null);
    setDiscordMessage(null);
    try {
      await enableTotpService(totpCode);
      await reloadCurrentUser();
      setTotpCode('');
      setTotpSetupSecret(null);
      setTotpSetupUrl(null);
    } catch (enableError) {
      setError(mapAuthErrorMessage(enableError));
    }
  };

  const handleDisableTotp = async () => {
    setError(null);
    setDiscordMessage(null);
    try {
      await disableTotpService(totpDisableCode);
      await reloadCurrentUser();
      setTotpDisableCode('');
    } catch (disableError) {
      setError(mapAuthErrorMessage(disableError));
    }
  };

  const handleStartDiscordLink = async () => {
    setError(null);
    setDiscordMessage(null);
    setDiscordLoading(true);
    try {
      const payload = await startDiscordLinkService();
      window.location.assign(payload.authorizationUrl);
    } catch (submitError) {
      setError(mapAuthErrorMessage(submitError));
      setDiscordLoading(false);
    }
  };

  const handleUnlinkDiscord = async () => {
    setError(null);
    setDiscordMessage(null);
    setDiscordLoading(true);
    try {
      await unlinkDiscordService();
      await reloadCurrentUser();
      setDiscordMessage('Compte Discord délié.');
    } catch (submitError) {
      setError(mapAuthErrorMessage(submitError));
    } finally {
      setDiscordLoading(false);
    }
  };

  return (
    <Layout>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h1 style={{ marginTop: 0 }}>Profil</h1>
        <p style={{ marginBottom: 0 }}>
          Gère ici ton avatar, ton identité dans l’application et toute la partie sécurité du compte.
        </p>
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Identité</h2>
        <form onSubmit={handleProfileSubmit} className="grid">
          <div className="profile-avatar-editor">
            <ResourcePickerField
              label="Avatar"
              value={{ resourceId: avatarResourceId || undefined, url: effectiveAvatar || '' }}
              onChange={(next) => {
                setAvatarResourceId(next.resourceId ?? '');
                setAvatarUrl(next.url ?? '');
              }}
              kinds={['image']}
              scopeTypes={['account']}
              allowManualUrl
              allowUpload
              uploadScopeType="account"
              uploadVisibility="private"
              previewAlt={nickname || currentUser?.displayName || 'Avatar'}
              emptyOptionLabel="Aucune image"
            />
          </div>

          <div className="grid">
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Prénom</span>
              <input type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Nom</span>
              <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Surnom unique</span>
              <input type="text" value={nickname} onChange={(event) => setNickname(event.target.value)} required />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem' }}>
              <span>Email</span>
              <input type="text" value={currentUser?.email ?? ''} disabled />
            </label>
          </div>

          <div>
            <Button type="submit">Enregistrer le profil</Button>
          </div>
        </form>

        {profileMessage ? <p style={{ color: '#067647', marginBottom: 0 }}>{profileMessage}</p> : null}
      </section>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Sécurité</h2>
        <form className="form" onSubmit={handleChangePassword}>
          <label htmlFor="currentPassword">Mot de passe actuel</label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />

          <label htmlFor="newPassword">Nouveau mot de passe</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={10}
            required
          />

          {passwordMessage ? <p style={{ color: '#027a48', margin: 0 }}>{passwordMessage}</p> : null}
          <Button type="submit">Mettre à jour le mot de passe</Button>
        </form>

        <div style={{ marginTop: '1rem' }}>
          <h3>Authentification à 2 facteurs (TOTP)</h3>
          <p style={{ marginTop: 0 }}>
            Statut: <strong>{currentUser?.hasTotpEnabled ? 'activée' : 'désactivée'}</strong>
          </p>

          {!currentUser?.hasTotpEnabled ? (
            <div className="grid">
              <Button onClick={handleStartTotpSetup}>Générer une clé TOTP</Button>
              {totpSetupSecret ? (
                <div className="card" style={{ background: 'rgba(21, 94, 239, 0.08)' }}>
                  <p style={{ marginTop: 0 }}>
                    Clé manuelle: <code>{totpSetupSecret}</code>
                  </p>
                  <p style={{ marginTop: 0 }}>
                    URI: <code>{totpSetupUrl}</code>
                  </p>
                  <label htmlFor="totpCode">Code TOTP</label>
                  <input
                    id="totpCode"
                    type="text"
                    placeholder="123456"
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                  />
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button onClick={handleEnableTotp}>Activer TOTP</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="form">
              <label htmlFor="totpDisableCode">Code TOTP pour désactiver</label>
              <input
                id="totpDisableCode"
                type="text"
                value={totpDisableCode}
                onChange={(event) => setTotpDisableCode(event.target.value)}
              />
              <Button variant="secondary" onClick={handleDisableTotp}>
                Désactiver TOTP
              </Button>
            </div>
          )}
        </div>

        <div style={{ marginTop: '1rem' }}>
          <h3>Compte Discord</h3>
          {currentUser?.discordAccount ? (
            <div className="card" style={{ background: 'rgba(88, 101, 242, 0.08)' }}>
              <p style={{ marginTop: 0 }}>
                Lié à{' '}
                <strong>
                  {currentUser.discordAccount.globalName || currentUser.discordAccount.username || currentUser.discordAccount.id}
                </strong>
              </p>
              <p>
                Identifiant Discord: <code>{currentUser.discordAccount.id}</code>
              </p>
              {currentUser.discordAccount.linkedAt ? <p>Lié le: {new Date(currentUser.discordAccount.linkedAt).toLocaleString()}</p> : null}
              <Button variant="secondary" onClick={handleUnlinkDiscord} disabled={discordLoading}>
                Délier Discord
              </Button>
            </div>
          ) : (
            <div className="card" style={{ background: 'rgba(88, 101, 242, 0.08)' }}>
              <p style={{ marginTop: 0 }}>
                Lie ton compte Discord à Nexus Forge pour préparer les futures interactions privées et les notifications ciblées.
              </p>
              <Button onClick={handleStartDiscordLink} disabled={discordLoading}>
                Lier mon compte Discord
              </Button>
            </div>
          )}

          {discordMessage ? <p style={{ color: '#067647', marginBottom: 0 }}>{discordMessage}</p> : null}
        </div>
      </section>

      {error ? (
        <section className="card" style={{ color: '#b42318' }}>
          {error}
        </section>
      ) : null}
    </Layout>
  );
}
