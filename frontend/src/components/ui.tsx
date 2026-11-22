import type { ReactNode } from 'react';
import { useTheme } from '../lib/theme';
import type { NotificationKind } from '../lib/types';
import {
  AlertIcon,
  CheckIcon,
  EnterIcon,
  ErrorIcon,
  ExitIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from './icons';
import styles from './ui.module.css';

export function Plate({ value, size = 'md' }: { value: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: styles.plateSm, md: styles.plateMd, lg: styles.plateLg }[size];
  return (
    <span className={`${styles.plate} ${sizeClass}`} aria-label={`Placa ${value}`}>
      <span className={styles.plateBand} />
      <span className={styles.plateText}>{value}</span>
    </span>
  );
}

export function ThemeToggle({ large = false }: { large?: boolean }) {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro';
  return (
    <button
      type="button"
      className={`${styles.iconButton} ${large ? styles.iconButtonLg : ''}`}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span key={theme} className={styles.themeIcon}>
        {theme === 'dark' ? <SunIcon size={large ? 20 : 18} /> : <MoonIcon size={large ? 20 : 18} />}
      </span>
    </button>
  );
}

export const LiveDot = ({ color }: { color?: string }) => (
  <span className={`${styles.liveDot} anim-live`} style={color ? { background: color } : undefined} />
);

export const Spinner = () => <span className={styles.spinner} role="status" aria-label="Carregando" />;

export const EmptyState = ({ children }: { children: ReactNode }) => (
  <p className={styles.emptyState}>{children}</p>
);

export const ErrorBanner = ({ message }: { message: string }) => (
  <div className={styles.errorBanner} role="alert">
    <AlertIcon size={16} />
    <span>{message}</span>
  </div>
);

export type Tone = 'accent' | 'neutral' | 'warn' | 'danger';

export function toneClass(tone: Tone) {
  return styles[`tone-${tone}`];
}

/** Ícone e tom de cada tipo de notificação/movimentação. */
export function notificationVisual(kind: NotificationKind | 'recarga' | 'entrada' | 'saida' | 'recusada') {
  switch (kind) {
    case 'entrada':
      return { tone: 'accent' as Tone, icon: <EnterIcon /> };
    case 'saida':
      return { tone: 'neutral' as Tone, icon: <ExitIcon /> };
    case 'recarga':
      return { tone: 'accent' as Tone, icon: <PlusIcon /> };
    case 'saldo_baixo':
      return { tone: 'warn' as Tone, icon: <AlertIcon /> };
    case 'saida_recusada':
    case 'recusada':
      return { tone: 'danger' as Tone, icon: <ErrorIcon /> };
    default:
      return { tone: 'neutral' as Tone, icon: <CheckIcon /> };
  }
}

export interface ToastData {
  id: string | number;
  title: string;
  text: string;
  kind: NotificationKind;
}

export function ToastStack({ toasts }: { toasts: ToastData[] }) {
  return (
    <div className={styles.toastStack} role="status" aria-live="polite">
      {toasts.map((toast) => {
        const visual = notificationVisual(toast.kind);
        return (
          <div key={toast.id} className={styles.toast}>
            <span className={`${styles.toastIcon} ${toneClass(visual.tone)}`}>{visual.icon}</span>
            <span className={styles.toastBody}>
              <span className={styles.toastTitle}>{toast.title}</span>
              <span className={styles.toastText}>{toast.text}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
