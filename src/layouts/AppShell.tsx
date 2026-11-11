import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Factory,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { RouteProgress } from '../components/loader/RouteProgress';
import { OfflineBanner, PWAInstallButton } from '../components/shared/OfflineBanner';
import { useAuth } from '../features/auth/AuthContext';
import { getActiveLogoUrl } from '../lib/brand';
import {
  prefersReducedMotion,
  usePageEnter,
} from '../lib/motion';
import { cn } from '../lib/utils';

export interface NavItem {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const SIDEBAR_STORAGE_KEY = 'mk_sidebar_collapsed_v1';
const SIDEBAR_EXPANDED_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 76;

/**
 * Exact 11 menu items per D3:
 * Top 10: Dashboard, Purchases, Stock, Production, Dispatch, Bills, Customers, Expenses, Employees, Reports
 * Bottom: Settings (sits at the bottom, above the user block)
 */
export const MAIN_NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/purchases', label: 'Purchases', Icon: ShoppingCart },
  { to: '/stock', label: 'Stock', Icon: Boxes },
  { to: '/production', label: 'Production', Icon: Factory },
  { to: '/dispatch', label: 'Dispatch', Icon: Truck },
  { to: '/bills', label: 'Bills', Icon: FileText },
  { to: '/customers', label: 'Customers', Icon: Users },
  { to: '/expenses', label: 'Expenses', Icon: Receipt },
  { to: '/employees', label: 'Employees', Icon: UserCheck },
  { to: '/reports', label: 'Reports', Icon: BarChart3 },
];

export const SETTINGS_NAV_ITEM: NavItem = {
  to: '/settings',
  label: 'Settings',
  Icon: Settings,
};

export const NAV_ITEMS: NavItem[] = [...MAIN_NAV_ITEMS, SETTINGS_NAV_ITEM];

/**
 * D3 Mobile Bottom Bar items:
 * Dashboard, Dispatch, Stock, Bills, More
 */
const MOBILE_PRIMARY_PATHS = ['/', '/dispatch', '/stock', '/bills'] as const;

const MOBILE_PRIMARY_NAV: NavItem[] = MOBILE_PRIMARY_PATHS.map(
  (path) => NAV_ITEMS.find((item) => item.to === path)!
);

const MOBILE_MORE_NAV: NavItem[] = NAV_ITEMS.filter(
  (item) => !MOBILE_PRIMARY_PATHS.includes(item.to as (typeof MOBILE_PRIMARY_PATHS)[number])
);

function getInitials(name?: string): string {
  if (!name || !name.trim()) return 'MK';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatTodayKarachi(): string {
  try {
    return new Intl.DateTimeFormat('en-PK', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString('en-PK');
  }
}

export const AppShell: React.FC = () => {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarSpacerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const userMenuWrapRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const moreBackdropRef = useRef<HTMLDivElement>(null);
  const moreSheetRef = useRef<HTMLDivElement>(null);

  usePageEnter(pageContentRef, location.pathname);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  // Current active navigation item for Top Bar title & breadcrumb
  const activeNavItem = useMemo(() => {
    return (
      NAV_ITEMS.find((item) =>
        item.to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.to)
      ) ?? MAIN_NAV_ITEMS[0]
    );
  }, [location.pathname]);

  const isMoreSectionActive = useMemo(() => {
    return MOBILE_MORE_NAV.some((item) => location.pathname.startsWith(item.to));
  }, [location.pathname]);

  const userInitials = useMemo(
    () => getInitials(session?.fullName || session?.companyName),
    [session?.fullName, session?.companyName]
  );

  const todayLabel = useMemo(() => formatTodayKarachi(), []);

  // Animate sidebar width (264px <-> 76px) and label fade/slide while keeping icons fixed
  useGSAP(
    () => {
      const sb = sidebarRef.current;
      const spacer = sidebarSpacerRef.current;
      if (!sb) return;

      const targetWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
      const labels = sb.querySelectorAll<HTMLElement>('[data-sidebar-label]');
      const widthTargets = spacer ? [sb, spacer] : [sb];

      if (prefersReducedMotion()) {
        gsap.set(widthTargets, { width: targetWidth });
        gsap.set(labels, {
          opacity: collapsed ? 0 : 1,
          x: 0,
          pointerEvents: collapsed ? 'none' : 'auto',
        });
        return;
      }

      gsap.to(widthTargets, {
        width: targetWidth,
        duration: 0.34,
        ease: 'power3.out',
      });

      gsap.to(labels, {
        opacity: collapsed ? 0 : 1,
        x: collapsed ? -8 : 0,
        duration: collapsed ? 0.18 : 0.26,
        ease: 'power3.out',
        pointerEvents: collapsed ? 'none' : 'auto',
      });
    },
    { dependencies: [collapsed] }
  );

  // Slide single shared active pill + left white indicator between items (and keep synced on resize)
  useGSAP(
    () => {
      const listEl = navListRef.current;
      const indEl = indicatorRef.current;
      if (!listEl || !indEl) return;

      const updateIndicator = (immediate = false) => {
        const activeLink = listEl.querySelector<HTMLElement>('[data-active="true"]');
        if (!activeLink) {
          gsap.set(indEl, { opacity: 0 });
          return;
        }

        const top = activeLink.offsetTop;
        const height = activeLink.offsetHeight;

        if (immediate || prefersReducedMotion()) {
          gsap.set(indEl, { y: top, height, opacity: 1 });
        } else {
          gsap.to(indEl, {
            y: top,
            height,
            opacity: 1,
            duration: 0.28,
            ease: 'power3.out',
          });
        }

        activeLink.scrollIntoView({ block: 'nearest' });
      };

      updateIndicator(false);

      const onResize = () => updateIndicator(true);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    },
    { dependencies: [location.pathname, collapsed] }
  );

  // Animate top-bar user dropdown when opened
  useEffect(() => {
    if (!userMenuOpen || !userDropdownRef.current) return;
    if (prefersReducedMotion()) {
      gsap.set(userDropdownRef.current, { opacity: 1, y: 0, scale: 1 });
      return;
    }
    gsap.fromTo(
      userDropdownRef.current,
      { opacity: 0, y: -6, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: 'power3.out' }
    );
  }, [userMenuOpen]);

  // Close top-bar user dropdown on outside click or Escape
  useEffect(() => {
    if (!userMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        userMenuWrapRef.current &&
        !userMenuWrapRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [userMenuOpen]);

  // Animate mobile More bottom sheet when opened
  useEffect(() => {
    if (!mobileMoreOpen) return;
    if (prefersReducedMotion()) {
      if (moreBackdropRef.current) gsap.set(moreBackdropRef.current, { opacity: 1 });
      if (moreSheetRef.current) gsap.set(moreSheetRef.current, { y: 0 });
      return;
    }
    if (moreBackdropRef.current) {
      gsap.fromTo(
        moreBackdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.22, ease: 'power2.out' }
      );
    }
    if (moreSheetRef.current) {
      gsap.fromTo(
        moreSheetRef.current,
        { y: '100%' },
        { y: '0%', duration: 0.32, ease: 'power3.out' }
      );
    }
  }, [mobileMoreOpen]);

  // Close mobile More sheet on Escape
  useEffect(() => {
    if (!mobileMoreOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMoreOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMoreOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    setMobileMoreOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const renderSidebarNavItem = ({ to, label, Icon }: NavItem) => {
    const isActive =
      to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

    return (
      <NavLink
        key={to}
        to={to}
        data-active={isActive ? 'true' : 'false'}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        className={cn(
          'group relative z-10 flex items-center h-8 lg:h-9 w-full rounded-[10px] text-[13px] lg:text-sm transition-colors duration-[180ms] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          isActive
            ? 'text-white font-semibold'
            : 'text-white/78 font-medium hover:text-white sidebar-item-hover'
        )}
      >
        {/* Fixed 48px icon slot: stays at exact x=14..62px in both 76px and 264px sidebar widths */}
        <span className="w-12 h-8 lg:h-9 shrink-0 flex items-center justify-center">
          <Icon
            className={cn(
              'h-[17px] w-[17px] lg:h-[18px] lg:w-[18px] shrink-0 transition-transform duration-[180ms]',
              isActive
                ? 'text-white'
                : 'text-white/78 group-hover:text-white group-hover:translate-x-[2px]'
            )}
          />
        </span>

        {/* Clipped animated label container so collapsed 76px width never overflows */}
        <span className="flex-1 min-w-0 overflow-hidden">
          <span
            data-sidebar-label
            className="block pr-3 truncate select-none"
          >
            {label}
          </span>
        </span>
      </NavLink>
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <RouteProgress />
      <OfflineBanner />

      <div className="flex flex-1 min-w-0">
        {/* Desktop Width Spacer matching fixed sidebar width so content never overlaps */}
        <div
          ref={sidebarSpacerRef}
          aria-hidden="true"
          style={{
            width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
          }}
          className="hidden md:block shrink-0 no-print"
        />

        {/* Desktop & Tablet Collapsible Burgundy Sidebar (>= 768px) — fixed to full viewport height */}
        <aside
          ref={sidebarRef}
          style={{
            width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
          }}
          className="hidden md:flex flex-col shrink-0 fixed inset-y-0 left-0 h-[100dvh] bg-sidebar-gradient text-white select-none z-40 no-print"
        >
          {/* Small 28px Round Toggle on Sidebar Edge */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute -right-3.5 top-3.5 z-50 h-7 w-7 rounded-full bg-[var(--bg)] text-[var(--brand)] border border-[var(--border)] shadow-soft inline-flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer focus-ring"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 stroke-[2.5]" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 stroke-[2.5]" />
            )}
          </button>

          {/* Top Brand Header: white rounded badge (fixed position) + "MK Solutions" in white Sora */}
          <div
            className="h-12 lg:h-14 flex items-center px-[18px] border-b shrink-0 overflow-hidden"
            style={{ borderColor: 'var(--sidebar-border)' }}
          >
            <div className="h-8 w-8 lg:h-9 lg:w-9 rounded-[10px] bg-[var(--bg)] shadow-soft p-1 shrink-0 flex items-center justify-center overflow-hidden">
              <img
                src={getActiveLogoUrl(session?.companyId)}
                alt="MK Solutions"
                className="h-full w-full object-contain rounded-[6px]"
              />
            </div>

            <div
              data-sidebar-label
              className="ml-3 min-w-0 overflow-hidden whitespace-nowrap"
            >
              <span className="block font-heading text-sm font-semibold text-white tracking-tight truncate">
                MK Solutions
              </span>
              {session?.companyName && session.companyName !== 'MK Solutions' && (
                <span className="block text-[11px] text-white/70 truncate">
                  {session.companyName}
                </span>
              )}
            </div>
          </div>

          {/* Navigation Menu (10 main items + Settings at the bottom, invisible scrollbar) */}
          <nav
            ref={navListRef}
            aria-label="Main navigation"
            className="relative flex-1 min-h-0 flex flex-col py-1.5 px-3.5 overflow-y-auto overflow-x-hidden sidebar-scroll"
          >
            {/* Shared GSAP Sliding Active Pill + Thin Left White Indicator */}
            <div
              ref={indicatorRef}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 right-3.5 top-0 rounded-[10px] sidebar-active-pill opacity-0 z-0"
            >
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-white" />
            </div>

            <div className="space-y-0.5">
              {MAIN_NAV_ITEMS.map(renderSidebarNavItem)}
            </div>

            {/* Settings sits at the bottom of the nav, above the user block */}
            <div
              className="mt-auto pt-1 border-t"
              style={{ borderColor: 'var(--sidebar-border)' }}
            >
              {renderSidebarNavItem(SETTINGS_NAV_ITEM)}
            </div>
          </nav>

          {/* Small User Block at Bottom (Initials Avatar, Name, Logout Icon) */}
          <div
            className="px-3.5 py-1.5 lg:py-2 border-t shrink-0"
            style={{ borderColor: 'var(--sidebar-border)' }}
          >
            <div className="flex items-center h-9 lg:h-10 w-full rounded-[10px] relative">
              {/* Fixed 48px avatar slot aligned with nav icons */}
              <div className="w-12 h-9 lg:h-10 shrink-0 flex items-center justify-center">
                <div
                  title={collapsed ? session?.fullName || 'Owner' : undefined}
                  className="h-7 w-7 lg:h-8 lg:w-8 rounded-full bg-white/18 border border-white/25 text-white font-heading text-xs font-semibold flex items-center justify-center select-none"
                >
                  {userInitials}
                </div>
              </div>

              {/* User Name & Email (fades/slides when collapsed) */}
              <div
                data-sidebar-label
                className="flex-1 min-w-0 pr-2 overflow-hidden whitespace-nowrap"
              >
                <p className="text-xs font-semibold text-white truncate">
                  {session?.fullName || 'Account owner'}
                </p>
                <p className="text-[11px] text-white/70 truncate">
                  {session?.email || session?.companyName || 'MK Solutions'}
                </p>
              </div>

              {/* Logout Icon Button */}
              {!collapsed ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Log out"
                  title="Log out"
                  className="h-8 w-8 rounded-[10px] inline-flex items-center justify-center text-white/78 hover:text-white sidebar-item-hover transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* When collapsed, provide a clean icon row for Log out with tooltip */}
            {collapsed && (
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Log out"
                className="group relative mt-1 flex items-center justify-center h-9 w-12 rounded-[10px] text-white/78 hover:text-white sidebar-item-hover transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <LogOut className="h-4 w-4" />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 z-50 rounded-[10px] bg-[var(--text)] px-2.5 py-1.5 text-xs font-medium text-white whitespace-nowrap shadow-pop opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150"
                >
                  Log out
                </span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Area (resizes smoothly alongside sidebar) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Sticky White Top Bar */}
          <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur shrink-0 no-print">
            {/* Left: Page Title with small Breadcrumb (plus compact logo badge on mobile) */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="md:hidden h-9 w-9 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] shadow-soft p-1 shrink-0 flex items-center justify-center">
                <img
                  src={getActiveLogoUrl(session?.companyId)}
                  alt="MK Solutions"
                  className="h-full w-full object-contain rounded-[6px]"
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] truncate">
                  <span className="truncate">
                    {session?.companyName || 'MK Solutions'}
                  </span>
                  <span aria-hidden="true">/</span>
                  <span className="text-[var(--brand)] font-semibold truncate">
                    {activeNavItem.label}
                  </span>
                </div>
                <h1 className="font-heading text-sm sm:text-base font-semibold text-[var(--text)] truncate leading-tight">
                  {activeNavItem.label}
                </h1>
              </div>
            </div>

            {/* Right: PWA Install, Today's Date Chip, and User Menu */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <PWAInstallButton compact={false} />

              {/* Today's Date Chip */}
              <div
                aria-label="Today's date"
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 sm:px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] tabular-nums"
              >
                <CalendarDays className="h-3.5 w-3.5 text-[var(--brand)] shrink-0" />
                <span className="hidden sm:inline">{todayLabel}</span>
                <span className="sm:hidden">
                  {todayLabel.replace(/^[A-Za-z]+,\s*/, '')}
                </span>
              </div>

              {/* User Menu (Initials Avatar + Animated Dropdown) */}
              <div ref={userMenuWrapRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  aria-label="User menu"
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] p-1 pr-2 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer focus-ring"
                >
                  <span className="h-7 w-7 rounded-[8px] bg-[var(--brand-soft)] text-[var(--brand)] font-heading text-xs font-semibold flex items-center justify-center">
                    {userInitials}
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200',
                      userMenuOpen && 'rotate-180'
                    )}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    ref={userDropdownRef}
                    role="menu"
                    aria-label="Account actions"
                    className="absolute right-0 mt-2 w-56 rounded-[16px] border border-[var(--border)] bg-[var(--bg)] p-2 shadow-pop z-50"
                  >
                    <div className="px-3 py-2 border-b border-[var(--border)]">
                      <p className="font-heading text-xs font-semibold text-[var(--text)] truncate">
                        {session?.fullName || 'Account owner'}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                        {session?.email || session?.companyName || 'MK Solutions'}
                      </p>
                    </div>

                    <div className="pt-1 space-y-0.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate('/settings');
                        }}
                        className="w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer focus-ring"
                      >
                        <Settings className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                        <span>Settings</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors cursor-pointer focus-ring"
                      >
                        <LogOut className="h-3.5 w-3.5 shrink-0" />
                        <span>Log out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page Viewport: max-w-[1280px], padding 16px mobile, 24px tablet, 32px desktop */}
          <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-8 min-w-0">
            <div ref={pageContentRef} className="min-w-0">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar in Burgundy (< 768px): Dashboard, Dispatch, Stock, Bills, More */}
      <nav
        aria-label="Mobile navigation"
        style={{ borderColor: 'var(--sidebar-border)' }}
        className="md:hidden fixed bottom-0 left-0 right-0 z-[60] border-t bg-sidebar-gradient px-2 pb-[env(safe-area-inset-bottom)] no-print"
      >
        <div className="grid grid-cols-5 h-15 items-center gap-1">
          {MOBILE_PRIMARY_NAV.map(({ to, label, Icon }) => {
            const isActive =
              !mobileMoreOpen &&
              (to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to));

            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMobileMoreOpen(false)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 h-11 rounded-[10px] text-[11px] transition-all duration-200 min-w-0',
                  isActive
                    ? 'bg-[var(--bg)] text-[var(--brand)] font-semibold shadow-soft'
                    : 'text-white/80 font-medium hover:text-white'
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-transform duration-200',
                    isActive && 'scale-110'
                  )}
                />
                <span className="truncate max-w-full px-1">{label}</span>
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMoreOpen((prev) => !prev)}
            aria-expanded={mobileMoreOpen}
            aria-label="More sections"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 h-11 rounded-[10px] text-[11px] transition-all duration-200 min-w-0 cursor-pointer',
              mobileMoreOpen || isMoreSectionActive
                ? 'bg-[var(--bg)] text-[var(--brand)] font-semibold shadow-soft'
                : 'text-white/80 font-medium hover:text-white'
            )}
          >
            <Menu
              className={cn(
                'h-4 w-4 shrink-0 transition-transform duration-200',
                (mobileMoreOpen || isMoreSectionActive) && 'scale-110'
              )}
            />
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Sheet (Burgundy Header, White List) */}
      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-[70] flex flex-col justify-end no-print">
          {/* Backdrop */}
          <div
            ref={moreBackdropRef}
            onClick={() => setMobileMoreOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 bg-black/45 backdrop-blur-[1px]"
          />

          {/* Sheet Container */}
          <div
            ref={moreSheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            className="relative z-10 w-full rounded-t-[20px] bg-[var(--bg)] shadow-pop overflow-hidden pb-[calc(env(safe-area-inset-bottom)+3.75rem)]"
          >
            {/* Burgundy Header */}
            <div className="bg-sidebar-gradient px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-[10px] bg-[var(--bg)] p-1 shadow-soft shrink-0 flex items-center justify-center">
                  <img
                    src={getActiveLogoUrl(session?.companyId)}
                    alt="MK Solutions"
                    className="h-full w-full object-contain rounded-[6px]"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="font-heading text-sm font-semibold text-white truncate">
                    More sections
                  </h2>
                  <p className="text-[11px] text-white/75 truncate">
                    {session?.companyName || 'MK Solutions'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label="Close menu"
                className="h-9 w-9 rounded-[10px] inline-flex items-center justify-center text-white/85 hover:text-white sidebar-item-hover transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* White List of Remaining Sections */}
            <div className="bg-[var(--bg)] divide-y divide-[var(--border)] max-h-[65dvh] overflow-y-auto px-3 py-2">
              {MOBILE_MORE_NAV.map(({ to, label, Icon }) => {
                const isActive = location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileMoreOpen(false)}
                    className={cn(
                      'flex items-center justify-between gap-3 min-h-[48px] px-3 py-2.5 rounded-[10px] text-sm transition-colors',
                      isActive
                        ? 'bg-[var(--brand-soft)] text-[var(--brand)] font-semibold'
                        : 'text-[var(--text)] font-medium hover:bg-[var(--surface-subtle)]'
                    )}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isActive ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
                        )}
                      />
                      <span className="truncate">{label}</span>
                    </span>
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isActive ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'
                      )}
                    />
                  </NavLink>
                );
              })}

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-between gap-3 min-h-[48px] px-3 py-2.5 rounded-[10px] text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <LogOut className="h-4 w-4 shrink-0" />
                  <span>Log out</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
