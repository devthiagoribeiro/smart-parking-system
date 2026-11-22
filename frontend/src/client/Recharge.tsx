import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckIcon } from '../components/icons';
import { ErrorBanner } from '../components/ui';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { PaymentMethod } from '../lib/types';
import { useClientData } from './ClientLayout';
import RechargeForm from './RechargeForm';
import styles from './client.module.css';
import local from './recharge.module.css';

/** Tempo mínimo do "processando" para a confirmação simulada parecer real. */
const MIN_PROCESSING_MS = 1200;

type Step =
  | { kind: 'form' }
  | { kind: 'processing'; method: PaymentMethod }
  | { kind: 'done'; amount: number; method: PaymentMethod; balance: number };

export const methodLabel = (m: PaymentMethod) => (m === 'pix' ? 'Pix' : 'cartão');

export default function Recharge() {
  const { plate, details, refresh } = useClientData();
  const [step, setStep] = useState<Step>({ kind: 'form' });
  const [error, setError] = useState<string | null>(null);

  const submit = async (amount: number, method: PaymentMethod) => {
    setError(null);
    setStep({ kind: 'processing', method });
    try {
      const [result] = await Promise.all([
        api.addBalance(plate, amount, method),
        new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS)),
      ]);
      setStep({ kind: 'done', amount, method, balance: result.saldo });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a recarga.');
      setStep({ kind: 'form' });
    }
  };

  if (step.kind === 'processing') {
    return (
      <div className={local.state} role="status">
        <span className={local.bigSpinner} />
        <span style={{ color: 'var(--text-2)' }}>Confirmando {methodLabel(step.method)}…</span>
      </div>
    );
  }

  if (step.kind === 'done') {
    return (
      <div className={local.state} role="status">
        <span className={local.success}>
          <CheckIcon size={34} strokeWidth={2.4} />
        </span>
        <span className={local.stateTitle}>Recarga confirmada</span>
        <span style={{ color: 'var(--text-2)' }}>
          {formatMoney(step.amount)} adicionados via {methodLabel(step.method)}.
        </span>
        <span className={local.newBalance}>
          <span className={styles.small}>Novo saldo</span>
          <strong>{formatMoney(step.balance)}</strong>
        </span>
        <div className={local.actions}>
          <button type="button" className={`${styles.btn} ${styles.grow}`} onClick={() => setStep({ kind: 'form' })}>
            Nova recarga
          </button>
          <Link to="/app" className={`${styles.btn} ${styles.btnPrimary} ${styles.grow}`}>
            Concluir
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && <ErrorBanner message={error} />}
      <RechargeForm balance={details?.saldo ?? 0} onSubmit={submit} />
    </>
  );
}
