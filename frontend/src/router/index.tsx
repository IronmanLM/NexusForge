import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const LoginPage = lazy(() => import('../features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('../features/auth/pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../features/auth/pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('../features/auth/pages/VerifyEmailPage'));
const DiscordCallbackPage = lazy(() => import('../features/auth/pages/DiscordCallbackPage'));
const AdminPendingUsersPage = lazy(() => import('../features/auth/pages/AdminPendingUsersPage'));
const AdminPersistenceHealthPage = lazy(() => import('../features/auth/pages/AdminPersistenceHealthPage'));
const SettingsPage = lazy(() => import('../features/account/pages/SettingsPage'));
const ProfilePage = lazy(() => import('../features/account/pages/ProfilePage'));
const HomePage = lazy(() => import('../features/home/pages/HomePage'));
const PublicLandingPage = lazy(() => import('../features/home/pages/PublicLandingPage'));
const PrivacyPolicyPage = lazy(() => import('../features/home/pages/PrivacyPolicyPage'));
const AccountDeletionPage = lazy(() => import('../features/home/pages/AccountDeletionPage'));
const AdminContentPage = lazy(() => import('../features/home/pages/AdminContentPage'));
const MessagesPage = lazy(() => import('../features/social/pages/MessagesPage'));
const AnnouncementsPage = lazy(() => import('../features/social/pages/AnnouncementsPage'));
const SocialPage = lazy(() => import('../features/social/pages/SocialPage'));
const SessionsListPage = lazy(() => import('../features/sessions/pages/SessionsListPage'));
const SessionViewPage = lazy(() => import('../features/sessions/pages/SessionViewPage'));
const SessionCharacterPage = lazy(() => import('../features/sessions/pages/SessionCharacterPage'));
const SessionVttFullscreenPage = lazy(() => import('../features/vtt/pages/SessionVttFullscreenPage'));
const RulesStudioPage = lazy(() => import('../features/systems/pages/RulesStudioPage'));
const SystemStudioPage = lazy(() => import('../features/systems/pages/SystemStudioPage'));
const TranslationDictionaryPage = lazy(() => import('../features/i18n/pages/TranslationDictionaryPage'));
const ResourcesPage = lazy(() => import('../features/resources/pages/ResourcesPage'));
const ScreenTemplatesPage = lazy(() => import('../features/screens/pages/ScreenTemplatesPage'));
const ScreenStudioPage = lazy(() => import('../features/screens/pages/ScreenStudioPage'));
const ToolsPage = lazy(() => import('../features/tools/pages/ToolsPage'));

function LazyPage({ component: Component }: { component: LazyExoticComponent<ComponentType> }) {
  return (
    <Suspense fallback={<div role="status" style={{ padding: '1rem' }}>Chargement...</div>}>
      <Component />
    </Suspense>
  );
}

function RootRedirect() {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) {
    return <div style={{ padding: '1rem' }}>Chargement...</div>;
  }
  return currentUser ? <Navigate to="/home" replace /> : <LazyPage component={PublicLandingPage} />;
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
  { path: '/privacy', element: <LazyPage component={PrivacyPolicyPage} /> },
  { path: '/account-deletion', element: <LazyPage component={AccountDeletionPage} /> },
  { path: '/login', element: <LazyPage component={LoginPage} /> },
  { path: '/register', element: <LazyPage component={RegisterPage} /> },
  { path: '/forgot-password', element: <LazyPage component={ForgotPasswordPage} /> },
  { path: '/reset-password', element: <LazyPage component={ResetPasswordPage} /> },
  { path: '/verify-email', element: <LazyPage component={VerifyEmailPage} /> },
  { path: '/auth/discord/callback', element: <LazyPage component={DiscordCallbackPage} /> },
  {
    path: '/home',
    element: (
      <RequireAuth>
        <LazyPage component={HomePage} />
      </RequireAuth>
    )
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        <LazyPage component={SettingsPage} />
      </RequireAuth>
    )
  },
  {
    path: '/profile',
    element: (
      <RequireAuth>
        <LazyPage component={ProfilePage} />
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
        <LazyPage component={MessagesPage} />
      </RequireAuth>
    )
  },
  {
    path: '/announcements',
    element: (
      <RequireAuth>
        <LazyPage component={AnnouncementsPage} />
      </RequireAuth>
    )
  },
  {
    path: '/network',
    element: (
      <RequireAuth>
        <LazyPage component={SocialPage} />
      </RequireAuth>
    )
  },
  {
    path: '/admin/users/pending',
    element: (
      <RequireAuth>
        <LazyPage component={AdminPendingUsersPage} />
      </RequireAuth>
    )
  },
  {
    path: '/admin/content',
    element: (
      <RequireAuth>
        <LazyPage component={AdminContentPage} />
      </RequireAuth>
    )
  },
  {
    path: '/admin/persistence',
    element: (
      <RequireAdmin>
        <LazyPage component={AdminPersistenceHealthPage} />
      </RequireAdmin>
    )
  },
  {
    path: '/systems',
    element: (
      <RequireGmOrAdmin>
        <LazyPage component={RulesStudioPage} />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/systems/:systemId/studio',
    element: (
      <RequireGmOrAdmin>
        <LazyPage component={SystemStudioPage} />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/i18n-dictionary',
    element: (
      <RequireGmOrAdmin>
        <LazyPage component={TranslationDictionaryPage} />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/resources',
    element: (
      <RequireAuth>
        <LazyPage component={ResourcesPage} />
      </RequireAuth>
    )
  },
  {
    path: '/tools',
    element: (
      <RequireGmOrAdmin>
        <LazyPage component={ToolsPage} />
      </RequireGmOrAdmin>
    )
  },
  {
    path: '/screen-templates',
    element: (
      <RequireAuth>
        <LazyPage component={ScreenTemplatesPage} />
      </RequireAuth>
    )
  },
  {
    path: '/screen-templates/:templateId/studio',
    element: (
      <RequireAuth>
        <LazyPage component={ScreenStudioPage} />
      </RequireAuth>
    )
  },
  {
    path: '/sessions',
    element: (
      <RequireAuth>
        <LazyPage component={SessionsListPage} />
      </RequireAuth>
    )
  },
  {
    path: '/sessions/:sessionId',
    element: (
      <RequireAuth>
        <LazyPage component={SessionViewPage} />
      </RequireAuth>
    )
  },
  {
    path: '/sessions/:sessionId/vtt/fullscreen',
    element: (
      <RequireAuth>
        <LazyPage component={SessionVttFullscreenPage} />
      </RequireAuth>
    )
  },
  {
    path: '/sessions/:sessionId/characters/:characterId',
    element: (
      <RequireAuth>
        <LazyPage component={SessionCharacterPage} />
      </RequireAuth>
    )
  }
]);
