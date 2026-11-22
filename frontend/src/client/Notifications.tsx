import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, notificationVisual, toneClass } from '../components/ui';
import { api } from '../lib/api';
import { formatTime } from '../lib/format';
import type { AppNotification } from '../lib/types';
import { useClientData } from './ClientLayout';
import { groupByDay } from './Statement';
import styles from './client.module.css';

export default function Notifications() {
  const { plate, notifications, details, refresh } = useClientData();

  // Guarda quais estavam não lidas ao abrir, para manter o destaque visível.
  const unreadOnOpen = useRef<Set<number> | null>(null);
  if (unreadOnOpen.current === null && notifications) {
    unreadOnOpen.current = new Set(notifications.filter((n) => !n.lida).map((n) => n.id));
  }

  const unreadCount = details?.notificacoes_nao_lidas ?? 0;
  useEffect(() => {
    if (unreadCount === 0) return;
    const id = window.setTimeout(() => {
      api.markNotificationsRead(plate).then(refresh).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [plate, unreadCount, refresh]);

  if (!notifications) return <EmptyState>Carregando…</EmptyState>;
  if (notifications.length === 0)
    return <EmptyState>Sem notificações. Avisaremos aqui sobre entradas, cobranças e recargas.</EmptyState>;

  let index = 0;
  return (
    <>
      {groupByDay<AppNotification>(notifications).map((group) => (
        <section key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className={styles.groupTitle}>{group.label}</h2>
          {group.items.map((n) => {
            const visual = notificationVisual(n.tipo);
            const highlighted = !n.lida || unreadOnOpen.current?.has(n.id);
            return (
              <article
                key={n.id}
                className={`${styles.notif} ${highlighted ? styles.notifUnread : ''}`}
                style={{ animationDelay: `${index++ * 40}ms` }}
              >
                <span className={`${styles.itemIcon} ${toneClass(visual.tone)}`}>{visual.icon}</span>
                <div className={styles.notifBody}>
                  <div className={styles.notifTop}>
                    <strong>{n.titulo}</strong>
                    <span className={styles.notifTime}>{formatTime(n.data)}</span>
                  </div>
                  <span className={styles.notifText}>{n.mensagem}</span>
                  {(n.tipo === 'saida_recusada' || n.tipo === 'saldo_baixo') && (
                    <Link to="/app/recarga" className={styles.notifCta}>
                      Adicionar saldo
                    </Link>
                  )}
                </div>
                {highlighted && <span className={styles.unreadDot} aria-label="Não lida" />}
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
