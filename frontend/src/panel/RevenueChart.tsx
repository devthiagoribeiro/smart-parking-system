import { useState } from 'react';
import { formatMoney } from '../lib/format';
import type { TodayStats } from '../lib/types';
import shared from './panel.module.css';
import styles from './overview.module.css';

const BAR_HEIGHT = 196;

/** Teto "redondo" do eixo: 5, 10, 20, 50, 100… */
function niceMax(value: number) {
  const candidates = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  return candidates.find((c) => c >= value) ?? Math.ceil(value / 1000) * 1000;
}

const short = (v: number) => `R$ ${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}`;

export default function RevenueChart({ data }: { data: TodayStats['receita_por_hora'] | undefined }) {
  const [active, setActive] = useState<number | null>(null);
  const points = data ?? [];
  const max = niceMax(Math.max(0, ...points.map((p) => p.valor)));
  const total = points.reduce((sum, p) => sum + p.valor, 0);

  return (
    <section aria-labelledby="rec-h" className={`${shared.card} ${shared.side}`}>
      <div>
        <h2 id="rec-h" className={shared.cardTitle}>
          Receita por hora
        </h2>
        <p className={shared.cardSub}>Débitos automáticos na saída · hoje · {formatMoney(total)}</p>
      </div>

      <div className={styles.chart} aria-hidden="true">
        <div className={styles.chartGrid}>
          <div className={styles.gridLine}>
            <span>{short(max)}</span>
            <span />
          </div>
          <div className={styles.gridLine}>
            <span>{short(max / 2)}</span>
            <span />
          </div>
          <div className={styles.gridLine}>
            <span>R$ 0</span>
            <span />
          </div>
        </div>
        {points.map((p, i) => {
          const height = (p.valor / max) * 100;
          return (
            <div
              key={p.hora}
              className={styles.barCol}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {active === i && (
                <span className={styles.tooltip} style={{ bottom: 24 + (BAR_HEIGHT * height) / 100 + 6 }}>
                  {String(p.hora).padStart(2, '0')}h · {formatMoney(p.valor)}
                </span>
              )}
              <div className={styles.barTrack}>
                <div
                  className={styles.bar}
                  style={{ height: `${Math.max(height, p.valor > 0 ? 1.5 : 0)}%`, animationDelay: `${i * 50}ms` }}
                />
              </div>
              <span className={styles.barLabel}>{String(p.hora).padStart(2, '0')}h</span>
            </div>
          );
        })}
      </div>

      <table className="visually-hidden">
        <caption>Receita por hora hoje</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Receita</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.hora}>
              <td>{p.hora}h</td>
              <td>{formatMoney(p.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
