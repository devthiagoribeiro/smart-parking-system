import { useEffect, useRef } from 'react';
import { formatAgo, formatClock } from '../lib/format';
import { useNow } from '../lib/hooks';
import type { Spot } from '../lib/types';
import shared from './panel.module.css';
import styles from './overview.module.css';

/** Limite de variação do campo usado pelo firmware (hardware/main/main.c). */
export const LIMIT_GAUSS = 0.08;
const HISTORY_POINTS = 60;

function Car() {
  return (
    <svg className={styles.car} width="104" height="190" viewBox="0 0 104 190" aria-hidden="true">
      <rect className={styles.carBody} x="6" y="4" width="92" height="182" rx="26" stroke="currentColor" strokeWidth="1.5" />
      <path className={styles.carGlass} d="M18 52 Q52 36 86 52 L80 78 Q52 70 24 78 Z" />
      <path className={styles.carGlass} d="M24 140 Q52 146 80 140 L84 160 Q52 170 20 160 Z" />
      <rect className={styles.carRoof} x="26" y="86" width="52" height="46" rx="8" />
      <rect x="10" y="12" width="14" height="6" rx="3" fill="#FCD34D" opacity=".85" />
      <rect x="80" y="12" width="14" height="6" rx="3" fill="#FCD34D" opacity=".85" />
    </svg>
  );
}

function Sparkline({ values, busy, spotId }: { values: number[]; busy: boolean; spotId: number }) {
  const max = Math.max(LIMIT_GAUSS * 3, ...values) * 1.1;
  const y = (v: number) => 34 - (v / max) * 32;
  const step = 200 / (HISTORY_POINTS - 1);
  const offset = HISTORY_POINTS - values.length;
  const points = values.map((v, i) => `${((offset + i) * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];

  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 200 36"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Campo magnético da vaga ${spotId}: ${last?.toFixed(3) ?? '—'} G, limite ${LIMIT_GAUSS} G`}
      style={{ color: busy ? 'var(--occ)' : 'var(--accent)' }}
    >
      <line
        className={styles.sparkLimit}
        x1="0"
        x2="200"
        y1={y(LIMIT_GAUSS)}
        y2={y(LIMIT_GAUSS)}
        strokeWidth="1"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      {values.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function SpotView({ spot, history, now }: { spot: Spot; history: number[]; now: number }) {
  const number = String(spot.id).padStart(2, '0');
  const since = Math.max(0, (now - new Date(spot.atualizado_em).getTime()) / 1000);

  return (
    <div className={styles.spotCol}>
      {spot.ocupada ? (
        <div className={`${styles.stall} ${styles.stallBusy}`} aria-label={`Vaga ${number} ocupada`}>
          <span className={styles.stallTag}>VAGA {number}</span>
          <span className={styles.stallState}>OCUPADA</span>
          <Car key={spot.atualizado_em} />
          <span className={styles.stallFooter}>
            <span>ocupada há</span>
            <strong>{formatClock(since)}</strong>
          </span>
        </div>
      ) : (
        <div className={`${styles.stall} ${styles.stallFree}`} aria-label={`Vaga ${number} livre`}>
          <span className={styles.stallTag}>VAGA</span>
          <span key={spot.atualizado_em} className={styles.stallNumber}>
            {number}
          </span>
          <span className={styles.stallLabel}>LIVRE</span>
          <span className={styles.stallSince}>livre {formatAgo(spot.atualizado_em, now)}</span>
        </div>
      )}

      <div className={styles.sensor}>
        <div className={styles.sensorHead}>
          <span>|Δ campo|</span>
          <strong>{spot.campo_gauss != null ? `${spot.campo_gauss.toFixed(3).replace('.', ',')} G` : '—'}</strong>
        </div>
        {history.length > 0 ? (
          <>
            <Sparkline values={history} busy={spot.ocupada} spotId={spot.id} />
            <div className={styles.sensorAxis}>
              <span>histórico</span>
              <span>limite {String(LIMIT_GAUSS).replace('.', ',')} G</span>
              <span>agora</span>
            </div>
          </>
        ) : (
          <p className={styles.sensorEmpty}>
            {spot.ultima_leitura_em
              ? `Última leitura ${formatAgo(spot.ultima_leitura_em, now)} · sem valor de campo`
              : 'Aguardando a primeira leitura do sensor'}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SpotsCard({ spots }: { spots: Spot[] | undefined }) {
  const now = useNow(1000);
  // Histórico do campo acumulado no navegador, a cada leitura nova.
  const history = useRef(new Map<number, { at: string; values: number[] }>());

  useEffect(() => {
    spots?.forEach((spot) => {
      if (spot.campo_gauss == null || !spot.ultima_leitura_em) return;
      const entry = history.current.get(spot.id) ?? { at: '', values: [] };
      if (entry.at === spot.ultima_leitura_em) return;
      entry.at = spot.ultima_leitura_em;
      entry.values = [...entry.values, Math.abs(spot.campo_gauss)].slice(-HISTORY_POINTS);
      history.current.set(spot.id, entry);
    });
  }, [spots]);

  return (
    <section aria-labelledby="vagas-h" className={`${shared.card} ${shared.grow}`}>
      <div className={shared.cardHead}>
        <div>
          <h2 id="vagas-h" className={shared.cardTitle}>
            Vagas
          </h2>
          <p className={shared.cardSub}>Magnetômetros HMC5883L · ESP32</p>
        </div>
        <div className={shared.legend}>
          <span>
            <span className={shared.swatch} style={{ background: 'var(--accent)' }} />
            Livre
          </span>
          <span>
            <span className={shared.swatch} style={{ background: 'var(--occ)' }} />
            Ocupada
          </span>
        </div>
      </div>

      <div className={styles.spotsGrid}>
        {spots?.map((spot) => (
          <SpotView key={spot.id} spot={spot} history={history.current.get(spot.id)?.values ?? []} now={now} />
        ))}
      </div>
    </section>
  );
}
