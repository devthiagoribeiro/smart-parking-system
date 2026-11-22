import { EmptyState } from '../components/ui';
import { api } from '../lib/api';
import { dayGroupLabel } from '../lib/format';
import { usePolling } from '../lib/hooks';
import type { HistoryItem } from '../lib/types';
import { useClientData } from './ClientLayout';
import HistoryList from './HistoryList';
import styles from './client.module.css';

export function groupByDay<T extends { data: string }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [];
  items.forEach((item) => {
    const label = dayGroupLabel(item.data);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  });
  return groups;
}

export default function Statement() {
  const { plate } = useClientData();
  const history = usePolling(() => api.history(plate, 100), 4000, [plate]);

  if (!history.data) return <EmptyState>Carregando…</EmptyState>;
  if (history.data.length === 0) return <EmptyState>Nenhuma movimentação ainda.</EmptyState>;

  return (
    <>
      {groupByDay<HistoryItem>(history.data).map((group) => (
        <section key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className={styles.groupTitle}>{group.label}</h2>
          <HistoryList items={group.items} />
        </section>
      ))}
    </>
  );
}
