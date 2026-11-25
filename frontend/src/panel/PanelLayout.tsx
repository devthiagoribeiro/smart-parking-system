import { NavLink, Outlet } from 'react-router-dom';
import { LogoMark } from '../components/icons';
import { LiveDot, ThemeToggle } from '../components/ui';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import styles from './panel.module.css';

const LINKS = [
  { to: '/painel', label: 'Visão geral', end: true },
  { to: '/painel/movimentacoes', label: 'Movimentações' },
  { to: '/painel/clientes', label: 'Clientes' },
  { to: '/painel/dispositivos', label: 'Dispositivos' },
];

/** Um sensor é considerado ativo se enviou leitura no último minuto. */
const SENSOR_TIMEOUT_MS = 60_000;

export default function PanelLayout() {
  const health = usePolling(api.health, 5000);
  const spots = usePolling(api.spots, 5000);
  const online = !health.error && health.data?.status === 'ok';

  const total = spots.data?.length ?? 0;
  const active =
    spots.data?.filter(
      (s) => s.ultima_leitura_em && Date.now() - new Date(s.ultima_leitura_em).getTime() < SENSOR_TIMEOUT_MS,
    ).length ?? 0;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to="/" className={styles.brand} aria-label="Smart Parking — início">
            <span className={styles.brandMark}>
              <LogoMark size={18} />
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>Smart Parking</span>
              <span className={styles.brandSub}>Painel do operador</span>
            </span>
          </NavLink>

          <nav aria-label="Principal" className={styles.nav}>
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className={styles.status}>
            <span className={`${styles.pill} ${online ? '' : styles.pillOffline}`}>
              {online ? <LiveDot /> : <span className={styles.offDot} />}
              {online ? 'API online' : 'API offline'}
            </span>
            <span className={`${styles.pill} mono`} title="Sensores que enviaram leitura no último minuto">
              ESP32 · {active}/{total} sensores
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
