import { Link } from 'react-router-dom';
import { PlusIcon } from '../components/icons';
import { EmptyState, LiveDot } from '../components/ui';
import { api } from '../lib/api';
import { calculateFee, formatClock, formatMoney, formatTime } from '../lib/format';
import { useNow, usePolling } from '../lib/hooks';
import { useClientData } from './ClientLayout';
import HistoryList from './HistoryList';
import styles from './client.module.css';

function ActiveSession({ since }: { since: string }) {
  const now = useNow(1000);
  const seconds = Math.max(0, (now - new Date(since).getTime()) / 1000);
  const hours = seconds / 3600;
  const progress = Math.min((hours / 3) * 100, 100);

  return (
    <section className={styles.card} style={{ animationDelay: '80ms' }} aria-labelledby="sessao-h">
      <div className={styles.cardHead}>
        <h2 id="sessao-h" className={styles.cardTitle}>
          <LiveDot /> Estacionado agora
        </h2>
        <span className={`${styles.small} mono`}>desde {formatTime(since)}</span>
      </div>
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.small}>Tempo</span>
          <span className={styles.clock}>{formatClock(seconds)}</span>
        </div>
        <div className={`${styles.metric} ${styles.metricEnd}`}>
          <span className={styles.small}>Valor até agora</span>
          <span className={styles.partial}>{formatMoney(calculateFee(hours))}</span>
        </div>
      </div>
      <div>
        <div className={styles.progress} aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className={styles.scale} style={{ marginTop: 6 }}>
          <span>0h</span>
          <span>R$ 3/h até 3h</span>
          <span>3h → R$ 1/h</span>
        </div>
      </div>
      <p className={styles.note}>
        O valor é debitado do seu saldo automaticamente quando a câmera de saída ler sua placa.
      </p>
    </section>
  );
}

function Idle() {
  return (
    <section className={styles.card} style={{ animationDelay: '80ms' }} aria-labelledby="sessao-h">
      <h2 id="sessao-h" className={styles.cardTitle}>
        Fora do estacionamento
      </h2>
      <p className={styles.small} style={{ fontSize: 13, color: 'var(--text-2)' }}>
        Ao entrar, a câmera lê sua placa e o tempo começa a contar. Na saída, o valor é debitado do seu saldo
        automaticamente.
      </p>
      <div className={styles.scale} style={{ fontSize: 12 }}>
        <span>R$ 3,00/h nas 3 primeiras horas</span>
        <span>R$ 1,00/h depois</span>
      </div>
    </section>
  );
}

export default function ClientHome() {
  const { plate, details } = useClientData();
  const history = usePolling(() => api.history(plate, 8), 3000, [plate]);

  return (
    <div className={styles.homeGrid}>
      <div className={styles.homeCol}>
      <section className={styles.hero} aria-label="Saldo">
        <div className={styles.heroTop}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className={styles.heroLabel}>Saldo disponível</span>
            <span className={styles.heroValue}>{details ? formatMoney(details.saldo) : '—'}</span>
          </div>
        </div>
        <div className={styles.heroActions}>
          <Link to="/app/recarga" className={`${styles.btn} ${styles.btnPrimary} ${styles.grow}`}>
            <PlusIcon /> Adicionar saldo
          </Link>
          <Link to="/app/extrato" className={styles.btn}>
            Extrato
          </Link>
        </div>
      </section>

      {details?.no_patio && details.entrada_em ? <ActiveSession since={details.entrada_em} /> : details ? <Idle /> : null}
      </div>

      <section aria-labelledby="ult-h" className={styles.homeCol} style={{ gap: 8 }}>
        <div className={styles.sectionHead}>
          <h2 id="ult-h" className={styles.sectionTitle}>
            Últimas movimentações
          </h2>
          <Link to="/app/extrato" className={styles.link}>
            Ver tudo
          </Link>
        </div>
        {history.data && history.data.length > 0 ? (
          <HistoryList items={history.data} />
        ) : (
          <EmptyState>{history.data ? 'Nenhuma movimentação ainda.' : 'Carregando…'}</EmptyState>
        )}
      </section>
    </div>
  );
}
