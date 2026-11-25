import { ErrorBanner } from '../components/ui';
import { api } from '../lib/api';
import { formatDuration, formatLongDate, formatMoney } from '../lib/format';
import { usePolling } from '../lib/hooks';
import EventsTable from './EventsTable';
import GateCard from './GateCard';
import RevenueChart from './RevenueChart';
import SpotsCard from './SpotsCard';
import styles from './panel.module.css';

const POLL_MS = 2000;

export default function Overview() {
  const stats = usePolling(api.stats, POLL_MS);
  const spots = usePolling(api.spots, POLL_MS);
  const events = usePolling(() => api.events(30), POLL_MS);
  const s = stats.data;
  const error = stats.error ?? spots.error ?? events.error;

  const occupied = spots.data?.filter((v) => v.ocupada).length ?? s?.vagas_ocupadas ?? 0;
  const total = spots.data?.length ?? s?.vagas_total ?? 0;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Visão geral</h1>
          <p className={styles.pageSub}>Tempo real · {formatLongDate()}</p>
        </div>
      </div>

      {error && <ErrorBanner message={`${error} Os dados exibidos podem estar desatualizados.`} />}

      <section aria-label="Indicadores" className={styles.kpis}>
        <div className={`${styles.card} ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Ocupação</span>
          <div className={styles.kpiInline}>
            <span className={styles.kpiValue}>
              {occupied} / {total}
            </span>
            <span className="muted">vagas</span>
          </div>
          <div className={styles.occBar} aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < occupied ? styles.occFilled : undefined} />
            ))}
          </div>
        </div>

        <div className={`${styles.card} ${styles.kpi}`} style={{ animationDelay: '60ms' }}>
          <span className={styles.kpiLabel}>Receita hoje</span>
          <span className={styles.kpiValue}>{s ? formatMoney(s.receita) : '—'}</span>
          <span className={styles.kpiFoot}>
            {s
              ? `${s.saidas} ${s.saidas === 1 ? 'cobrança automática' : 'cobranças automáticas'} · ${formatMoney(s.recargas)} em recargas`
              : ' '}
          </span>
        </div>

        <div className={`${styles.card} ${styles.kpi}`} style={{ animationDelay: '120ms' }}>
          <span className={styles.kpiLabel}>Movimentações</span>
          <div className={styles.kpiInline}>
            <span className={styles.kpiValue}>{s?.entradas ?? '—'}</span>
            <span className="muted" style={{ marginRight: 8 }}>
              entradas
            </span>
            <span className={styles.kpiValue}>{s?.saidas ?? '—'}</span>
            <span className="muted">saídas</span>
          </div>
          <span className={styles.kpiFoot}>
            {s
              ? `${s.veiculos_no_patio} no pátio · ${s.saidas_recusadas} ${s.saidas_recusadas === 1 ? 'saída recusada' : 'saídas recusadas'}`
              : ' '}
          </span>
        </div>

        <div className={`${styles.card} ${styles.kpi}`} style={{ animationDelay: '180ms' }}>
          <span className={styles.kpiLabel}>Permanência média</span>
          <span className={styles.kpiValue}>
            {s?.permanencia_media_min != null ? formatDuration(s.permanencia_media_min) : '—'}
          </span>
          <span className={styles.kpiFoot}>Tarifa: R$ 3/h até 3h · R$ 1/h depois</span>
        </div>
      </section>

      <div className={styles.row}>
        <SpotsCard spots={spots.data} />
        <GateCard events={events.data} />
      </div>

      <div className={styles.row}>
        <EventsTable events={events.data} />
        <RevenueChart data={s?.receita_por_hora} />
      </div>
    </>
  );
}
