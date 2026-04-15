import { PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link, NavLink, useLocation } from 'react-router-dom';
import AuthenticatedImage from './AuthenticatedImage';
import BrandLogo from './BrandLogo';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../hooks/useI18n';
import { listPendingUsersService } from '../services/authService';
import { sessionRepository } from '../data/repositories';
import { listDirectConversationsService, loadSocialRelationsService } from '../services/socialService';
import { applyTheme, getStoredTheme, THEME_CHANGED_EVENT, ThemeMode } from '../theme';

type LayoutProps = PropsWithChildren<{ wide?: boolean; hideNavigation?: boolean }>;

export default function Layout({ children, wide = false, hideNavigation = false }: LayoutProps) {
  const { currentUser, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const isAdmin = Boolean(currentUser?.roles.includes('admin'));
  const canUseRulesStudio = Boolean(currentUser && (currentUser.roles.includes('gm') || currentUser.roles.includes('admin')));
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingInvitationCount, setPendingInvitationCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isNativeChromeCollapsed, setIsNativeChromeCollapsed] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const nativeChromeTimerRef = useRef<number | null>(null);
  const totalUserNotifications = pendingInvitationCount + unreadMessageCount + pendingFriendRequestCount;
  const isNativeApp = Capacitor.isNativePlatform();

  const userInitials = useMemo(() => {
    const source = currentUser?.nickname?.trim() || currentUser?.displayName?.trim() || '?';
    return source.slice(0, 2).toUpperCase();
  }, [currentUser?.displayName, currentUser?.nickname]);

  useEffect(() => {
    if (!isAdmin) {
      setPendingCount(0);
      return;
    }

    let isMounted = true;
    const loadPending = async () => {
      try {
        const items = await listPendingUsersService();
        if (isMounted) {
          setPendingCount(items.length);
        }
      } catch {
        if (isMounted) {
          setPendingCount(0);
        }
      }
    };

    void loadPending();
    const interval = window.setInterval(() => {
      void loadPending();
    }, 30_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!currentUser) {
      setPendingInvitationCount(0);
      setUnreadMessageCount(0);
      setPendingFriendRequestCount(0);
      return;
    }

    let isMounted = true;
    const loadIndicators = async () => {
      try {
        const [sessions, conversations, relations] = await Promise.all([
          sessionRepository.list({ includeArchived: false }),
          listDirectConversationsService(),
          loadSocialRelationsService()
        ]);

        if (!isMounted) {
          return;
        }

        const invitationCount = sessions.flatMap((session) => session.invitations ?? []).filter(
          (invitation) => invitation.userId === currentUser.id && invitation.status === 'pending'
        ).length;
        const unreadCount = conversations.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0);
        const friendRequestCount = relations.incomingRequests.length;

        setPendingInvitationCount(invitationCount);
        setUnreadMessageCount(unreadCount);
        setPendingFriendRequestCount(friendRequestCount);
      } catch {
        if (isMounted) {
          setPendingInvitationCount(0);
          setUnreadMessageCount(0);
          setPendingFriendRequestCount(0);
        }
      }
    };

    void loadIndicators();
    const interval = window.setInterval(() => {
      void loadIndicators();
    }, 30_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [currentUser]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleThemeChanged = (event: Event) => {
      const nextTheme = (event as CustomEvent<ThemeMode>).detail;
      setTheme(nextTheme === 'light' ? 'light' : 'dark');
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    window.addEventListener(THEME_CHANGED_EVENT, handleThemeChanged as EventListener);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener(THEME_CHANGED_EVENT, handleThemeChanged as EventListener);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setIsMobileNavOpen(false);
    setIsUserMenuOpen(false);
    setIsNativeChromeCollapsed(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isNativeApp) {
      return;
    }

    const clearTimer = () => {
      if (nativeChromeTimerRef.current !== null) {
        window.clearTimeout(nativeChromeTimerRef.current);
        nativeChromeTimerRef.current = null;
      }
    };

    const scheduleCollapse = () => {
      clearTimer();
      if (isMobileNavOpen || isUserMenuOpen) {
        setIsNativeChromeCollapsed(false);
        return;
      }
      nativeChromeTimerRef.current = window.setTimeout(() => {
        setIsNativeChromeCollapsed(true);
      }, 2500);
    };

    const handleActivity = () => {
      setIsNativeChromeCollapsed(false);
      scheduleCollapse();
    };

    scheduleCollapse();
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    return () => {
      clearTimer();
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [isMobileNavOpen, isNativeApp, isUserMenuOpen]);

  if (hideNavigation) {
    return <main className={`page ${wide ? 'page--wide' : ''}`.trim()}>{children}</main>;
  }

  return (
    <>
      <header className={`top-nav ${isNativeApp ? 'top-nav--native' : ''} ${isNativeApp && isNativeChromeCollapsed ? 'top-nav--native-collapsed' : ''}`.trim()}>
        <div className={`top-nav__inner ${isNativeApp ? 'top-nav__inner--native' : ''}`.trim()}>
          {!isNativeApp ? (
            <Link to="/" className="top-nav__brand">
              <BrandLogo variant="wordmark" className="top-nav__brand-logo" alt={t('nav.brand')} />
            </Link>
          ) : <div className="top-nav__brand-spacer" aria-hidden="true" />}
          <button
            type="button"
            className={`top-nav__menu-toggle ${isMobileNavOpen ? 'is-open' : ''}`.trim()}
            aria-label="Ouvrir le menu"
            aria-expanded={isMobileNavOpen}
            aria-controls="top-nav-links"
            onClick={() => {
              setIsNativeChromeCollapsed(false);
              setIsMobileNavOpen((value) => !value);
            }}
          >
            <span />
            <span />
            <span />
          </button>
          <nav
            id="top-nav-links"
            className={`top-nav__links ${isMobileNavOpen ? 'is-open' : ''} ${isNativeApp ? 'top-nav__links--native' : ''}`.trim()}
            aria-label="Navigation principale"
          >
            {currentUser ? (
              <>
                <NavLink to="/home" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {t('nav.home')}
                </NavLink>
                <NavLink to="/sessions" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  <span className="top-nav__link-label">
                    {t('nav.parties')}
                    {pendingInvitationCount > 0 ? <span className="home-pill home-pill--success">{pendingInvitationCount}</span> : null}
                  </span>
                </NavLink>
                <NavLink to="/resources" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {t('nav.resources')}
                </NavLink>
                {canUseRulesStudio ? (
                  <NavLink to="/tools" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                    {t('nav.tools')}
                  </NavLink>
                ) : null}
                <NavLink to="/screen-templates" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {t('nav.screens')}
                </NavLink>
                {canUseRulesStudio ? (
                  <NavLink to="/systems" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                    {t('nav.rules')}
                  </NavLink>
                ) : null}
                <div className="top-nav__mobile-user-links">
                  <Link to="/messages">
                    <span className="top-nav__link-label">
                      Messagerie
                      {unreadMessageCount > 0 ? <span className="home-pill home-pill--accent">{unreadMessageCount}</span> : null}
                    </span>
                  </Link>
                  <Link to="/network">
                    <span className="top-nav__link-label">
                      Mes contacts
                      {pendingFriendRequestCount > 0 ? <span className="home-pill home-pill--success">{pendingFriendRequestCount}</span> : null}
                    </span>
                  </Link>
                  <Link to="/profile">Profil</Link>
                  <Link to="/settings">Paramètres</Link>
                  <Link to="/announcements">Annonces</Link>
                  {isAdmin ? <Link to="/admin/users/pending">Admin comptes</Link> : null}
                  {isAdmin ? <Link to="/admin/content">Admin contenu</Link> : null}
                  <button type="button" className="top-nav__mobile-logout" onClick={() => logout()}>
                    {t('nav.logout')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <NavLink to="/" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {t('nav.home')}
                </NavLink>
                <NavLink to="/login" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {t('nav.login')}
                </NavLink>
                <NavLink to="/register" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
                  {t('nav.register')}
                </NavLink>
              </>
            )}
          </nav>
          <div className="top-nav__right">
            {currentUser ? (
              <div className="top-nav__user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className="top-nav__avatar-button"
                  onClick={() => {
                    setIsNativeChromeCollapsed(false);
                    setIsUserMenuOpen((value) => !value);
                  }}
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                >
                  {currentUser.avatarUrl ? (
                    <AuthenticatedImage src={currentUser.avatarUrl} alt={currentUser.displayName} className="top-nav__avatar-image" />
                  ) : (
                    <span className="top-nav__avatar-fallback">{userInitials}</span>
                  )}
                  {totalUserNotifications > 0 ? <span className="top-nav__avatar-badge">{totalUserNotifications}</span> : null}
                </button>
                {isUserMenuOpen ? (
                  <div className="top-nav__user-dropdown" role="menu">
                    <div className="top-nav__user-dropdown-header">
                      <strong>{currentUser.displayName}</strong>
                      <small>{theme === 'dark' ? 'Dark' : 'Light'}</small>
                    </div>
                    <Link to="/settings" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                      Paramètres
                    </Link>
                    <Link to="/profile" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                      Profil
                    </Link>
                    <Link to="/messages" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                      <span className="top-nav__menu-item-label">
                        Messagerie
                        {unreadMessageCount > 0 ? <span className="home-pill home-pill--accent">{unreadMessageCount}</span> : null}
                      </span>
                    </Link>
                    <Link to="/network" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                      <span className="top-nav__menu-item-label">
                        Mes contacts
                        {pendingFriendRequestCount > 0 ? <span className="home-pill home-pill--success">{pendingFriendRequestCount}</span> : null}
                      </span>
                    </Link>
                    <Link to="/announcements" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                      Annonces
                    </Link>
                    {isAdmin ? (
                      <>
                        <Link to="/admin/users/pending" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                          Admin comptes
                        </Link>
                        <Link to="/admin/content" onClick={() => setIsUserMenuOpen(false)} role="menuitem">
                          Admin contenu
                        </Link>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="top-nav__user-dropdown-action"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                    >
                      {t('nav.logout')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {!isNativeApp && isAdmin && pendingCount > 0 ? (
          <div className="admin-pending-banner">
            <Link to="/admin/users/pending">{pendingCount} compte(s) en attente de validation admin</Link>
          </div>
        ) : null}
        {!isNativeApp && currentUser && pendingInvitationCount > 0 ? (
          <div className="invitation-pending-banner">
            <Link to="/sessions">
              {pendingInvitationCount} invitation(s) de partie en attente. Ouvre `Parties` pour accepter ou refuser.
            </Link>
          </div>
        ) : null}
      </header>
      <main className={`page ${wide ? 'page--wide' : ''}`.trim()}>{children}</main>
    </>
  );
}
