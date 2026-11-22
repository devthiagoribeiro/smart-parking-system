import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ErrorIcon } from '../components/icons';
import { EmptyState, LiveDot } from '../components/ui';
import { formatDuration, formatMoney, formatRelativeDay, formatTime } from '../lib/format';
import type { EventType, ParkingEvent } from '../lib/types';
import shared from './panel.module.css';
import styles from './overview.module.css';

type Filter = 'all' | EventType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'entrada', label: 'Entradas' },
  { id: 'saida', label: 'Saídas' },
  { id: 'recusada', label: 'Recusadas' },
];

const EVENT_LABEL: Record<EventType, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  recusada: 'Recusada',
};

const BADGE: Record<EventType, string> = {
  entrada: styles.badgeIn,
  saida: styles.badgeOut,
  recusada: styles.badgeRefused,
};

interface Props {
  events: ParkingEvent[] | undefined;
  title?: string;
  showDevice?: boolean;
  fullDate?: boolean;
}

export default function EventsTable({ events, title = 'Movimentações', showDevice = false, fullDate = false }: Props) {
  const [filter, setFilter] = useState<Filter>('all');

  // Linhas que chegaram depois do primeiro carregamento piscam.
  const seen = useRef<Set<number> | null>(null);
  const fresh = useMemo(() => {
    if (!events || !seen.current) return new Set<number>();
    return new Set(events.filter((e) => !seen.current!.has(e.id)).map((e) => e.id));
  }, [events]);
  useEffect(() => {
    if (events) seen.current = new Set(events.map((e) => e.id));
  }, [events]);

  // Placas cuja última movimentação é uma entrada continuam no pátio.
  const inside = useMemo(() => {
    const latest = new Map<string, EventType>();
    events?.forEach((e) => {
      if (e.tipo !== 'recusada' && !latest.has(e.numero_placa)) latest.set(e.numero_placa, e.tipo);
    });
    return latest;
  }, [events]);

  const rows = events?.filter((e) => filter === 'all' || e.tipo === filter) ?? [];

  return (
    <section aria-labelledby="mov-h" className={`${shared.card} ${shared.grow}`}>
      <div className={shared.cardHead}>
        <h2 id="mov-h" className={shared.cardTitle}>
          {title}
        </h2>
        <div className={shared.segmented} role="group" aria-label="Filtrar movimentações">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={shared.segment}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState>{events ? 'Nenhuma movimentação registrada.' : 'Carregando movimentações…'}</EmptyState>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{fullDate ? 'Data' : 'Hora'}</th>
                <th scope="col">Placa</th>
                <th scope="col">Evento</th>
                <th scope="col">Permanência</th>
                <th scope="col" className={styles.right}>
                  Valor
                </th>
                <th scope="col">Status</th>
                {showDevice && <th scope="col">Dispositivo</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const stillInside =
                  e.tipo === 'entrada' &&
                  inside.get(e.numero_placa) === 'entrada' &&
                  events?.find((x) => x.numero_placa === e.numero_placa && x.tipo === 'entrada')?.id === e.id;
                return (
                  <tr key={e.id} className={fresh.has(e.id) ? 'anim-flash' : undefined}>
                    <td className={styles.cellTime}>{fullDate ? formatRelativeDay(e.data) : formatTime(e.data)}</td>
                    <td className={styles.cellPlate}>{e.numero_placa}</td>
                    <td>
                      <span className={`${styles.badge} ${BADGE[e.tipo]}`}>{EVENT_LABEL[e.tipo]}</span>
                    </td>
                    <td className={styles.cellSoft}>
                      {e.permanencia_min != null ? formatDuration(e.permanencia_min) : '—'}
                    </td>
                    <td className={`${styles.right} num`}>{e.valor != null ? formatMoney(e.valor) : '—'}</td>
                    <td>
                      {e.tipo === 'recusada' ? (
                        <span className={`${styles.status} ${styles.statusErr}`}>
                          <ErrorIcon size={14} /> Saldo insuficiente
                        </span>
                      ) : stillInside ? (
                        <span className={`${styles.status} ${styles.statusLive}`}>
                          <LiveDot /> No pátio
                        </span>
                      ) : (
                        <span className={`${styles.status} ${styles.statusOk}`}>
                          <CheckIcon size={14} /> {e.tipo === 'saida' ? 'Debitado' : 'Concluída'}
                        </span>
                      )}
                    </td>
                    {showDevice && <td className={`${styles.cellSoft} mono`}>{e.dispositivo ?? '—'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
