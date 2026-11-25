import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BackIcon, BellIcon, CardIcon, HomeIcon, ListIcon, LogoMark, LogoutIcon } from '../components/icons';
import { ErrorBanner, Plate, ThemeToggle, ToastStack, type ToastData } from '../components/ui';
import uiStyles from '../components/ui.module.css';
import { api, ApiError } from '../lib/api';
import { usePolling } from '../lib/hooks';
import type { AppNotification, PlateDetails } from '../lib/types';
import styles from './client.module.css';
import { useSession } from './session';

interface ClientData {
  plate: string;
  details: PlateDetails | undefined;
  notifications: AppNotification[] | undefined;
  refresh: () => Promise<void>;
}

const ClientDataContext = createContext<ClientData | null>(null);

export function useClientData() {
  const data = useContext(ClientDataContext);
  if (!data) throw new Error('useClientData fora do ClientLayout');
  return data;
}

const POLL_MS = 3000;
const TOAST_MS = 5000;

const TABS = [
  { to: '/app', label: 'Início', icon: HomeIcon, end: true },
  { to: '/app/recarga', label: 'Recarga', icon: CardIcon },
  { to: '/app/avisos', label: 'Avisos', icon: BellIcon },
  { to: '/app/extrato', label: 'Extrato', icon: ListIcon },
];

const TITLES: Record<string, string> = {
  '/app/recarga': 'Adicionar saldo',
  '/app/avisos': 'Notificações',
  '/app/extrato': 'Extrato',
};

export default function ClientLayout() {
  const { plate, signOut } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const current = plate!;

  const details = usePolling(() => api.getPlate(current), POLL_MS, [current]);
  const notifications = usePolling(() => api.notifications(current, 50), POLL_MS, [current]);

  // A placa foi removida do banco: volta para a tela de entrada.
  useEffect(() => {
    if (details.error && details.data === undefined && !details.loading) {
      api.getPlate(current).catch((err) => {
        if (err instanceof ApiError && err.status === 404) signOut();
      });
    }
  }, [details.error, details.data, details.loading, current, signOut]);

  // Notificações novas viram toast (exceto as que já existiam ao abrir o app).
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const lastSeenId = useRef<number | null>(null);
  useEffect(() => {
    const list = notifications.data;
    if (!list) return;
    const newest = list[0]?.id ?? 0;
    if (lastSeenId.current === null) {
      lastSeenId.current = newest;
      return;
    }
    const fresh = list.filter((n) => n.id > lastSeenId.current!).reverse();
    lastSeenId.current = Math.max(lastSeenId.current, newest);
    if (fresh.length === 0) return;
    setToasts((prev) => [
      ...prev,
      ...fresh.map((n) => ({ id: n.id, title: n.titulo, text: n.mensagem, kind: n.tipo })),
    ]);
    fresh.forEach((n) => {
      window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== n.id)), TOAST_MS);
    });
  }, [notifications.data]);

  const refreshDetails = details.refresh;
  const refreshNotifications = notifications.refresh;
  const refresh = useCallback(async () => {
    await Promise.all([refreshDetails(), refreshNotifications()]);
  }, [refreshDetails, refreshNotifications]);

  const title = TITLES[location.pathname];
  const page = location.pathname.split('/')[2] || 'inicio';
  const unread = details.data?.notificacoes_nao_lidas ?? 0;
  const bellLabel = unread ? `Notificações, ${unread} não lidas` : 'Notificações';

  return (
    <ClientDataContext.Provider
      value={{ plate: current, details: details.data, notifications: notifications.data, refresh }}
    >
      <div className={styles.app}>
        <div className={styles.frame}>
          <ToastStack toasts={toasts} />

          {/* Computador: cabeçalho com abas. No celular fica oculto. */}
          <header className={styles.topbar}>
            <div className={styles.topbarInner}>
              <Link to="/app" className={styles.brand}>
                <span className={styles.brandMark}>
                  <LogoMark size={18} />
                </span>
                <span className={styles.brandName}>Smart Parking</span>
              </Link>
              <nav aria-label="Navegação do app" className={styles.topnav}>
                {TABS.map(({ to, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `${styles.topLink} ${isActive ? styles.topLinkActive : ''}`}
                  >
                    {label}
                    {to === '/app/avisos' && unread > 0 && <span className={styles.topCount}>{unread}</span>}
                  </NavLink>
                ))}
              </nav>
              <div className={styles.topActions}>
                <Plate value={current} size="md" />
                <ThemeToggle />
                <Link to="/app/avisos" className={`${uiStyles.iconButton} ${styles.bell}`} aria-label={bellLabel}>
                  <BellIcon size={18} />
                  {unread > 0 && <span className={styles.badgeDotSm} />}
                </Link>
                <button
                  type="button"
                  className={uiStyles.iconButton}
                  onClick={signOut}
                  aria-label="Trocar de placa"
                  title="Trocar de placa"
                >
                  <LogoutIcon size={18} />
                </button>
              </div>
            </div>
          </header>

          {title ? (
            <header className={`${styles.header} ${styles.headerBack} ${styles.mobileOnly}`}>
              <button type="button" className={`${styles.back} ${uiStyles.iconButton}`} style={{ border: 0 }} onClick={() => navigate('/app')} aria-label="Voltar ao início">
                <BackIcon size={22} />
              </button>
              <h1 className={styles.headerTitle} style={{ flex: 1 }}>
                {title}
              </h1>
              <ThemeToggle large />
            </header>
          ) : (
            <header className={`${styles.header} ${styles.mobileOnly}`}>
              <div className={styles.headerText}>
                <span className={styles.headerSub}>Smart Parking</span>
                <Plate value={current} size="sm" />
              </div>
              <ThemeToggle large />
              <Link
                to="/app/avisos"
                className={`${uiStyles.iconButton} ${uiStyles.iconButtonLg} ${styles.bell}`}
                aria-label={bellLabel}
              >
                <BellIcon size={20} />
                {unread > 0 && <span className={styles.badgeDot} />}
              </Link>
              <button
                type="button"
                className={`${uiStyles.iconButton} ${uiStyles.iconButtonLg}`}
                onClick={signOut}
                aria-label="Trocar de placa"
                title="Trocar de placa"
              >
                <LogoutIcon size={20} />
              </button>
            </header>
          )}

          <div className={styles.content} data-page={page}>
            {title && <h1 className={styles.desktopTitle}>{title}</h1>}
            {details.error && <ErrorBanner message={details.error} />}
            <Outlet />
          </div>

          <nav aria-label="Navegação do app" className={styles.tabbar}>
            {TABS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
              >
                <Icon size={22} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
    </ClientDataContext.Provider>
  );
}
