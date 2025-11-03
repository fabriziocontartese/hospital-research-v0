import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import styles from './MainLayout.module.css';
import { cn } from '../lib/classNames';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', roles: ['admin', 'researcher', 'staff'] },
  { path: '/users', label: 'Users', roles: ['admin'] },
  { path: '/studies', label: 'Studies', roles: ['admin', 'researcher'] },
  { path: '/population', label: 'Population', roles: ['admin', 'researcher'] },
  { path: '/tasks', label: 'Tasks', roles: ['admin', 'researcher', 'staff'] },
];

export const MainLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));

  const handleSignOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className={styles.shell}>
      {isMobileMenuOpen ? (
        <div
          className={styles.mobileBackdrop}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      ) : null}

      <aside className={cn(styles.sidebar, isMobileMenuOpen && styles.sidebarOpen)}>
        <div className={styles.brand} onClick={() => navigate('/dashboard')}>
          <div className={styles.logo}>HR</div>
          <div>
            <div className={styles.brandTitle}>Research Console</div>
            <div className={styles.brandSubtitle}>Hospital Research</div>
          </div>
        </div>

        <nav className={styles.nav}>
          {visibleNav.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                type="button"
                className={cn(styles.navItem, isActive && styles.navItemActive)}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
              >
                <span className={styles.navMarker} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <div className={styles.userInitial}>
              {user.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user.displayName || user.email}</span>
              <span className={styles.userRole}>{user.role}</span>
              {user.category ? <Badge variant="neutral">{user.category}</Badge> : null}
            </div>
          </div>
          <Button variant="ghost" className={styles.signOut} onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className={styles.mainRegion}>
        <header className={styles.mobileHeader}>
          <div className={styles.mobileBrand}>
            <div className={styles.logo}>HR</div>
            <span>Research Console</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className={styles.mobileMenuButton}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? 'Close' : 'Menu'}
          </Button>
        </header>

        <div className={styles.banner}>
          <span className={styles.bannerDot} />
          <span>
            <strong>Important:</strong> do not use real patient names. Use pseudonymized IDs only.
          </span>
        </div>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
};
