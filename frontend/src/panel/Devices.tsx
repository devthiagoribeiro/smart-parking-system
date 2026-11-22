import { useEffect, useState } from 'react';
import { CameraIcon } from '../components/icons';
import { ErrorBanner, Plate, Spinner } from '../components/ui';
import { api, API_URL } from '../lib/api';
import { formatAgo, formatDuration, formatMoney } from '../lib/format';
import { useNow, usePolling } from '../lib/hooks';
import type { RecognizeResult } from '../lib/types';
import styles from './panel.module.css';
import local from './pages.module.css';

type Direction = 'auto' | 'entrada' | 'saida';

const DIRECTIONS: { id: Direction; label: string }[] = [
  { id: 'auto', label: 'Automático' },
  { id: 'entrada', label: 'Entrada' },
  { id: 'saida', label: 'Saída' },
];

/** Simula o sensor: perto de zero livre, acima do limite ocupada. */
const simulatedField = (occupied: boolean) =>
  occupied ? 0.18 + Math.random() * 0.06 : 0.005 + Math.random() * 0.015;

function SpotsSimulator() {
  const spots = usePolling(api.spots, 2000);
  const now = useNow(5000);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (id: number, occupied: boolean) => {
    setBusy(id);
    setError(null);
    try {
      await api.updateSpot(id, occupied, Number(simulatedField(occupied).toFixed(3)));
      await spots.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar a vaga.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="sim-vagas">
      <div>
        <h2 id="sim-vagas" className={styles.cardTitle}>
          Sensores das vagas
        </h2>
        <p className={styles.cardSub}>
          Simula o envio do ESP32. No hardware real, a integração MQTT chama <span className="mono">PUT /spots/&#123;id&#125;</span>.
        </p>
      </div>
      {error && <ErrorBanner message={error} />}
      {spots.data?.map((spot) => (
        <div key={spot.id} className={local.spotRow}>
          <div className={local.spotName}>
            <strong>Vaga {String(spot.id).padStart(2, '0')}</strong>
            <span>
              {spot.ultima_leitura_em ? `Última leitura ${formatAgo(spot.ultima_leitura_em, now)}` : 'Sem leituras ainda'}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={spot.ocupada}
            aria-label={`Vaga ${spot.id} ocupada`}
            className={local.switch}
            disabled={busy === spot.id}
            onClick={() => toggle(spot.id, !spot.ocupada)}
          />
        </div>
      ))}
    </section>
  );
}

function CameraSimulator() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>('auto');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RecognizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const send = async () => {
    if (!file) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.recognize(file, direction === 'auto' ? undefined : direction));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no reconhecimento.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="sim-cam">
      <div>
        <h2 id="sim-cam" className={styles.cardTitle}>
          Câmera da portaria
        </h2>
        <p className={styles.cardSub}>Envia uma foto para o mesmo endpoint usado pela ESP32-CAM.</p>
      </div>

      <label className={`${local.drop} ${file ? local.dropActive : ''}`}>
        {preview ? (
          <img src={preview} alt="Foto selecionada" className={local.preview} />
        ) : (
          <>
            <CameraIcon size={28} />
            <span>Clique ou arraste a foto de um veículo</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          aria-label="Foto do veículo"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
      </label>

      <div className={local.field}>
        <span id="dir-label">Sentido da leitura</span>
        <div className={styles.segmented} role="group" aria-labelledby="dir-label">
          {DIRECTIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              className={styles.segment}
              aria-pressed={direction === d.id}
              onClick={() => setDirection(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className={local.primary} disabled={!file || sending} onClick={send}>
        {sending ? (
          <>
            <Spinner /> Reconhecendo…
          </>
        ) : (
          'Enviar para reconhecimento'
        )}
      </button>

      {error && <ErrorBanner message={error} />}

      {result && (
        <div className={local.result} role="status">
          {result.success && result.plate ? (
            <>
              <Plate value={result.plate} size="lg" />
              <div className={local.resultRow}>
                <span>Evento</span>
                <strong>
                  {result.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                  {result.duplicada ? ' (leitura repetida, ignorada)' : ''}
                </strong>
              </div>
              {result.valor_cobrado != null && (
                <div className={local.resultRow}>
                  <span>Cobrado</span>
                  <strong>
                    {formatMoney(result.valor_cobrado)}
                    {result.permanencia_min != null && ` · ${formatDuration(result.permanencia_min)}`}
                  </strong>
                </div>
              )}
              <div className={local.resultRow}>
                <span>Saldo</span>
                <strong>{formatMoney(result.saldo ?? 0)}</strong>
              </div>
              <div className={local.resultRow}>
                <span>Tempo de OCR</span>
                <strong>{Math.round(result.processing_time_ms)} ms</strong>
              </div>
            </>
          ) : (
            <span>Nenhuma placa reconhecida na imagem.</span>
          )}
        </div>
      )}
    </section>
  );
}

export default function Devices() {
  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Dispositivos</h1>
          <p className={styles.pageSub}>Simulador para testar o sistema sem o hardware · API em {API_URL}</p>
        </div>
      </div>
      <div className={local.devices}>
        <SpotsSimulator />
        <CameraSimulator />
      </div>
    </>
  );
}
