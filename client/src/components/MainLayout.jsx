import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import styles from './MainLayout.module.css';
import { cn } from '../lib/classNames';

const navItems = [
  { path: '/platform/organizations', label: 'Organizations', roles: ['superadmin'] },
  { path: '/dashboard', label: 'Dashboard', roles: ['admin', 'researcher'] },
  { path: '/tasks', label: 'Tasks', roles: ['admin', 'researcher', 'staff'] },
  { path: '/studies', label: 'Studies', roles: ['admin', 'researcher'] },
  { path: '/population', label: 'Population', roles: ['admin', 'researcher', 'staff'] },
  { path: '/users', label: 'Users', roles: ['admin'] },
];

const roleLabels = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  researcher: 'Researcher',
  staff: 'Staff',
};

export const MainLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const visibleNav = navItems.filter((item) => item.roles.includes(user.role));
  const homePath =
    visibleNav.length > 0 ? visibleNav[0].path : user.role === 'staff' ? '/tasks' : '/dashboard';

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
        <div className={styles.brand} onClick={() => navigate(homePath)}>
        <div className={styles.logo}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="Research"
          >
            <circle cx="11" cy="11" r="5" />
            <line x1="14.8" y1="14.8" x2="19.2" y2="19.2" />
          </svg>
        </div>




            <div className={styles.brandTitle}>Hospital Research</div>
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
              <span className={styles.userRole}>{roleLabels[user.role] || user.role}</span>
              {user.role !== 'superadmin' && user.category ? (
                <Badge variant="neutral">{user.category}</Badge>
              ) : null}
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
            <div className={styles.logo}></div>
            <span>Hospital Research</span>
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

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
};
