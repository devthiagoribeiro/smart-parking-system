import { ErrorBanner } from '../components/ui';
import { api } from '../lib/api';
import { usePolling } from '../lib/hooks';
import EventsTable from './EventsTable';
import styles from './panel.module.css';

export default function Movements() {
  const events = usePolling(() => api.events(200), 3000);
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Movimentações</h1>
          <p className={styles.pageSub}>Últimos 200 registros de entrada, saída e recusa</p>
        </div>
      </div>
      {events.error && <ErrorBanner message={events.error} />}
      <EventsTable events={events.data} title="Histórico" showDevice fullDate />
    </>
  );
}
