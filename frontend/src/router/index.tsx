import { Navigate, createBrowserRouter } from 'react-router-dom';
import LoginPage from '../features/auth/pages/LoginPage';
import RegisterPage from '../features/auth/pages/RegisterPage';
import ForgotPasswordPage from '../features/auth/pages/ForgotPasswordPage';
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage';
import VerifyEmailPage from '../features/auth/pages/VerifyEmailPage';
import DiscordCallbackPage from '../features/auth/pages/DiscordCallbackPage';
import AdminPendingUsersPage from '../features/auth/pages/AdminPendingUsersPage';
import AdminPersistenceHealthPage from '../features/auth/pages/AdminPersistenceHealthPage';
import SettingsPage from '../features/account/pages/SettingsPage';
import ProfilePage from '../features/account/pages/ProfilePage';
import HomePage from '../features/home/pages/HomePage';
import PublicLandingPage from '../features/home/pages/PublicLandingPage';
import PrivacyPolicyPage from '../features/home/pages/PrivacyPolicyPage';
import AccountDeletionPage from '../features/home/pages/AccountDeletionPage';
import AdminContentPage from '../features/home/pages/AdminContentPage';
import MessagesPage from '../features/social/pages/MessagesPage';
import AnnouncementsPage from '../features/social/pages/AnnouncementsPage';
import SocialPage from '../features/social/pages/SocialPage';
import SessionsListPage from '../features/sessions/pages/SessionsListPage';
import SessionViewPage from '../features/sessions/pages/SessionViewPage';
import SessionCharacterPage from '../features/sessions/pages/SessionCharacterPage';
import RulesStudioPage from '../features/systems/pages/RulesStudioPage';
import SystemStudioPage from '../features/systems/pages/SystemStudioPage';
import TranslationDictionaryPage from '../features/i18n/pages/TranslationDictionaryPage';
import ResourcesPage from '../features/resources/pages/ResourcesPage';
import ScreenTemplatesPage from '../features/screens/pages/ScreenTemplatesPage';
import ScreenStudioPage from '../features/screens/pages/ScreenStudioPage';
import ToolsPage from '../features/tools/pages/ToolsPage';
import { useAuth } from '../hooks/useAuth';

function RootRedirect() {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <div style={{ padding: '1rem' }}>Chargement...</div>;
  }
  return currentUser ? <Navigate to="/home" replace /> : <PublicLandingPage />;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <div style={{ padding: '1rem' }}>Chargement...</div>;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function RequireGmOrAdmin({ children }: { children: JSX.Element }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <div style={{ padding: '1rem' }}>Chargement...</div>;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (!currentUser.roles.includes('gm') && !currentUser.roles.includes('admin')) {
    return <Navigate to="/sessions" replace />;
  }
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <div style={{ padding: '1rem' }}>Chargement...</div>;
  }
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (!currentUser.roles.includes('admin')) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

export const router = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: '/privacy', element: <PrivacyPolicyPage /> },
  { path: '/account-deletion', element: <AccountDeletionPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/auth/discord/callback', element: <DiscordCallbackPage /> },
  {
    path: '/home',
    element: (
      <RequireAuth>
        <HomePage />
      </RequireAuth>
    )
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        <SettingsPage />
      </RequireAuth>
    )
  },
  {
    path: '/profile',
    element: (
      <RequireAuth>
        <ProfilePage />
      </RequireAuth>
    )
  },
  {
    path: '/account/security',
    element: (
      <RequireAuth>
        <Navigate to="/profile" replace />
      </RequireAuth>
    )
  },
  {
    path: '/messages',
    element: (
      <RequireAuth>
        <MessagesPage />
      </RequireAuth>
    )
  },
  {
    path: '/announcements',
    element: (
      <RequireAuth>
        <AnnouncementsPage />
      </RequireAuth>
    )
  },
  {
    path: '/network',
    element: (
      <RequireAuth>
        <SocialPage />
      </RequireAuth>
    )
  },
  {
    path: '/admin/users/pending',
    element: (
      <RequireAuth>
        <AdminPendingUsersPage />
      </RequireAuth>
    )
  },
  {
    path: '/admin/content',
    element: (
      <RequireAuth>
        <AdminContentPage />
      </RequireAuth>
    )
  },
  {
    path: '/admin/persistence',
    element: (
      <RequireAdmin>
        <AdminPersistenceHealthPage />
      </RequireAdmin>
    )
  },
  {
    path: '/systems',
    element: (
      <RequireGmOrAdmin>
        <RulesStudioPage />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/systems/:systemId/studio',
    element: (
      <RequireGmOrAdmin>
        <SystemStudioPage />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/i18n-dictionary',
    element: (
      <RequireGmOrAdmin>
        <TranslationDictionaryPage />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/resources',
    element: (
      <RequireAuth>
        <ResourcesPage />
      </RequireAuth>
    )
  },
  {
    path: '/tools',
    element: (
      <RequireGmOrAdmin>
        <ToolsPage />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/screen-templates',
    element: (
      <RequireAuth>
        <ScreenTemplatesPage />
      </RequireAuth>
    )
  },
  {
    path: '/screen-templates/:templateId/studio',
    element: (
      <RequireAuth>
        <ScreenStudioPage />
      </RequireAuth>
    )
  },
  {
    path: '/sessions',
    element: (
      <RequireAuth>
        <SessionsListPage />
      </RequireAuth>
    )
  },
  {
    path: '/sessions/:sessionId',
    element: (
      <RequireAuth>
        <SessionViewPage />
      </RequireAuth>
    )
  },
  {
    path: '/sessions/:sessionId/characters/:characterId',
    element: (
      <RequireAuth>
        <SessionCharacterPage />
      </RequireAuth>
    )
  }
]);
