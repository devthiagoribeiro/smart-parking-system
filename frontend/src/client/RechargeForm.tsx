import { useState, type ReactNode } from 'react';
import { InfoIcon } from '../components/icons';
import { formatMoney } from '../lib/format';
import type { PaymentMethod } from '../lib/types';
import styles from './client.module.css';
import local from './recharge.module.css';

const PRESETS = [20, 50, 100, 200];
const METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: 'pix', label: 'Pix', hint: 'Aprovação instantânea' },
  { id: 'cartao', label: 'Cartão de crédito', hint: 'Final 4242' },
];
const MAX_VALUE = 1000;

function parseAmount(text: string): number | null {
  const value = Number(text.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

interface Props {
  balance: number;
  submitLabel?: (amount: string) => string;
  onSubmit: (amount: number, method: PaymentMethod) => void;
  secondary?: ReactNode;
}

export default function RechargeForm({ balance, onSubmit, submitLabel, secondary }: Props) {
  const [preset, setPreset] = useState<number | null>(50);
  const [custom, setCustom] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');

  const customValue = custom ? parseAmount(custom) : null;
  const amount = custom ? customValue : preset;
  const invalid = custom !== '' && (customValue === null || customValue > MAX_VALUE);
  const label = amount ? formatMoney(amount) : '';

  return (
    <form
      className={local.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (amount && !invalid) onSubmit(amount, method);
      }}
    >
      <div className={local.balanceRow}>
        <span className="muted">Saldo atual</span>
        <span className={local.balanceValue}>{formatMoney(balance)}</span>
      </div>

      <fieldset className={local.fieldset}>
        <legend className={local.legend}>Valor da recarga</legend>
        <div className={local.presets}>
          {PRESETS.map((value) => (
            <button
              key={value}
              type="button"
              className={local.chip}
              aria-pressed={!custom && preset === value}
              onClick={() => {
                setPreset(value);
                setCustom('');
              }}
            >
              R$ {value}
            </button>
          ))}
        </div>
        <label htmlFor="outro-valor" className={local.customLabel}>
          Outro valor
        </label>
        <div className={`${local.inputWrap} ${invalid ? local.inputInvalid : ''}`}>
          <span className="muted">R$</span>
          <input
            id="outro-valor"
            inputMode="decimal"
            placeholder="0,00"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^\d,.]/g, ''))}
            aria-invalid={invalid}
            aria-describedby={invalid ? 'valor-erro' : undefined}
          />
        </div>
        {invalid && (
          <span id="valor-erro" className={local.error}>
            Informe um valor entre R$ 0,01 e {formatMoney(MAX_VALUE)}.
          </span>
        )}
      </fieldset>

      <fieldset className={local.fieldset}>
        <legend className={local.legend}>Forma de pagamento</legend>
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={local.method}
            aria-pressed={method === m.id}
            onClick={() => setMethod(m.id)}
          >
            <span className={local.radio} aria-hidden="true" />
            <span className={local.methodText}>
              <span style={{ fontWeight: 500 }}>{m.label}</span>
              <span className={styles.small}>{m.hint}</span>
            </span>
          </button>
        ))}
      </fieldset>

      <div className={local.footer}>
        <div className={local.after}>
          <span>Saldo após recarga</span>
          <strong className="num">{formatMoney(balance + (amount && !invalid ? amount : 0))}</strong>
        </div>
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock}`} disabled={!amount || invalid}>
          {submitLabel ? submitLabel(label) : `Recarregar ${label}`}
        </button>
        {secondary}
        <p className={local.disclaimer}>
          <InfoIcon size={14} /> Pagamento simulado — nenhuma cobrança real
        </p>
      </div>
    </form>
  );
}
