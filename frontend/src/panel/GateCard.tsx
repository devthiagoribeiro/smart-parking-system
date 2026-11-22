import { AlertIcon, CheckIcon } from '../components/icons';
import { Plate } from '../components/ui';
import { formatDuration, formatMoney, formatTime, formatTimeSeconds } from '../lib/format';
import type { ParkingEvent } from '../lib/types';
import shared from './panel.module.css';
import styles from './overview.module.css';

function Reading({ event, kind }: { event: ParkingEvent | undefined; kind: 'entrada' | 'saida' }) {
  const isEntry = kind === 'entrada';
  const label = `${isEntry ? 'Entrada' : 'Saída'} · ${event?.dispositivo ?? (isEntry ? 'câmera 01' : 'câmera 02')}`;

  return (
    <div className={styles.gate}>
      <div className={styles.viewfinder} aria-hidden="true">
        {isEntry && <span className={styles.scan} />}
        <span className={`${styles.vfPlate} ${isEntry ? '' : styles.vfPlateIdle}`}>
          {event?.numero_placa ?? '———————'}
        </span>
      </div>
      <div className={styles.gateInfo}>
        <span className={styles.gateLabel} style={{ color: isEntry ? 'var(--accent)' : 'var(--text-2)' }}>
          {label}
        </span>
        {event ? (
          <>
            <Plate value={event.numero_placa} />
            <span key={event.id} className={`${styles.gateMeta} anim-fade`}>
              {formatTimeSeconds(event.data)}
              {event.tempo_ocr_ms != null && ` · OCR ${Math.round(event.tempo_ocr_ms)} ms`}
              {event.tipo === 'entrada' && ' · entrada registrada'}
              {event.tipo === 'saida' && (
                <>
                  {event.permanencia_min != null && ` · ${formatDuration(event.permanencia_min)}`} ·{' '}
                  <strong>{formatMoney(event.valor ?? 0)} debitado</strong>
                </>
              )}
              {event.tipo === 'recusada' && (
                <>
                  {' · '}
                  <strong style={{ color: 'var(--danger)' }}>saldo insuficiente</strong>
                </>
              )}
            </span>
          </>
        ) : (
          <span className={styles.gateMeta}>Nenhuma leitura ainda.</span>
        )}
      </div>
    </div>
  );
}

export default function GateCard({ events }: { events: ParkingEvent[] | undefined }) {
  const lastEntry = events?.find((e) => e.tipo === 'entrada');
  const lastExit = events?.find((e) => e.tipo === 'saida' || e.tipo === 'recusada');
  const lastRefusal = events?.find((e) => e.tipo === 'recusada');
  const resolvedBy = lastRefusal
    ? events?.find(
        (e) =>
          e.tipo === 'saida' &&
          e.numero_placa === lastRefusal.numero_placa &&
          new Date(e.data) > new Date(lastRefusal.data),
      )
    : undefined;

  return (
    <section aria-labelledby="portaria-h" className={`${shared.card} ${shared.side}`}>
      <div>
        <h2 id="portaria-h" className={shared.cardTitle}>
          Portaria
        </h2>
        <p className={shared.cardSub}>Reconhecimento de placa · YOLO + OCR</p>
      </div>

      <Reading event={lastEntry} kind="entrada" />
      <Reading event={lastExit} kind="saida" />

      {lastRefusal && !resolvedBy && (
        <div className={`${styles.alert} ${styles.alertDanger}`} role="alert">
          <AlertIcon />
          <div className={styles.alertBody}>
            <strong>
              {formatTime(lastRefusal.data)} · {lastRefusal.numero_placa} saída recusada
            </strong>
            <span>
              Saldo insuficiente para {formatMoney(lastRefusal.valor ?? 0)}. O cliente foi notificado no app.
            </span>
          </div>
        </div>
      )}
      {lastRefusal && resolvedBy && (
        <div className={`${styles.alert} ${styles.alertOk}`}>
          <CheckIcon />
          <div className={styles.alertBody}>
            <strong>
              {lastRefusal.numero_placa} regularizou a saída às {formatTime(resolvedBy.data)}
            </strong>
            <span>Recusada às {formatTime(lastRefusal.data)} por saldo insuficiente.</span>
          </div>
        </div>
      )}
    </section>
  );
}
