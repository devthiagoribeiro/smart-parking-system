import { notificationVisual, toneClass } from '../components/ui';
import { formatDuration, formatMoney, formatRelativeDay } from '../lib/format';
import type { HistoryItem } from '../lib/types';
import styles from './client.module.css';

function describe(item: HistoryItem) {
  switch (item.tipo) {
    case 'entrada':
      return { title: 'Entrada', amount: null, color: undefined };
    case 'saida':
      return {
        title: `Saída${item.permanencia_min != null ? ` · ${formatDuration(item.permanencia_min)}` : ''}`,
        amount: item.valor != null ? `− ${formatMoney(item.valor)}` : null,
        color: undefined,
      };
    case 'recusada':
      return {
        title: 'Saída recusada · sem saldo',
        amount: item.valor != null ? formatMoney(item.valor) : null,
        color: 'var(--danger)',
      };
    case 'recarga': {
      const method = item.metodo === 'pix' ? 'Pix' : item.metodo === 'cartao' ? 'Cartão' : 'Manual';
      return {
        title: `Recarga · ${method}`,
        amount: item.valor != null ? `+ ${formatMoney(item.valor)}` : null,
        color: 'var(--accent)',
      };
    }
  }
}

export default function HistoryList({ items }: { items: HistoryItem[] }) {
  return (
    <div className={styles.list}>
      {items.map((item, i) => {
        const visual = notificationVisual(item.tipo);
        const info = describe(item);
        return (
          <div key={item.id} className={styles.listItem} style={{ animationDelay: `${i * 30}ms` }}>
            <span className={`${styles.itemIcon} ${toneClass(visual.tone)}`}>{visual.icon}</span>
            <span className={styles.itemText}>
              <span className={styles.itemTitle}>{info.title}</span>
              <span className={styles.small}>{formatRelativeDay(item.data)}</span>
            </span>
            {info.amount && (
              <span className={styles.itemAmount} style={{ color: info.color }}>
                {info.amount}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
