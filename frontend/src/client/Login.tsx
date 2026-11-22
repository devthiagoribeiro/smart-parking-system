import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, BackIcon, BellIcon, CameraIcon, CardIcon, LogoMark } from '../components/icons';
import { ErrorBanner, Spinner, ThemeToggle } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { isValidPlate, normalizePlate } from '../lib/format';
import type { PaymentMethod } from '../lib/types';
import RechargeForm from './RechargeForm';
import styles from './client.module.css';
import local from './login.module.css';
import { useSession } from './session';

type Step = 'plate' | 'register';

export default function Login() {
  const { signIn } = useSession();
  const [plate, setPlate] = useState('');
  const [step, setStep] = useState<Step>('plate');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const valid = isValidPlate(plate);

  const lookup = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.getPlate(plate);
      signIn(plate);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setStep('register');
      else setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  };

  const register = async (recharge?: { amount: number; method: PaymentMethod }) => {
    setBusy(true);
    setError(null);
    try {
      try {
        await api.createPlate(plate);
      } catch (err) {
        // A câmera pode ter cadastrado a placa nesse meio-tempo.
        if (!(err instanceof ApiError && err.status === 409)) throw err;
      }
      if (recharge) await api.addBalance(plate, recharge.amount, recharge.method);
      signIn(plate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.app}>
      <div className={styles.frame}>
        <header className={`${styles.header} ${styles.headerBack}`}>
          {step === 'register' ? (
            <button
              type="button"
              className={styles.back}
              style={{ border: 0, background: 'transparent' }}
              onClick={() => setStep('plate')}
              aria-label="Voltar"
            >
              <BackIcon size={22} />
            </button>
          ) : (
            <>
              <Link to="/" className={styles.back} aria-label="Voltar para a escolha de acesso" title="Voltar">
                <BackIcon size={22} />
              </Link>
              <span className={local.brandMark} aria-hidden="true">
                <LogoMark size={18} />
              </span>
            </>
          )}
          <div className={styles.headerText}>
            <span className={styles.headerTitle}>{step === 'register' ? 'Cadastro' : 'Smart Parking'}</span>
          </div>
          <ThemeToggle large />
        </header>

        <div className={styles.content}>
          {error && <ErrorBanner message={error} />}

          {step === 'plate' ? (
            <div className={local.layout}>
            <div className={local.copy}>
              <h1 className={local.title}>Estacione sem parar no caixa.</h1>
              <p className={local.lead}>
                A câmera lê sua placa na entrada e na saída, e o valor é debitado do seu saldo automaticamente.
              </p>
              <ul className={local.features}>
                <li>
                  <span className={local.featureIcon}>
                    <CameraIcon size={18} />
                  </span>
                  <span>
                    <strong>Leitura automática da placa</strong>
                    Sem ticket e sem cancela travada na entrada.
                  </span>
                </li>
                <li>
                  <span className={local.featureIcon}>
                    <CardIcon size={18} />
                  </span>
                  <span>
                    <strong>Débito na saída</strong>
                    R$ 3,00/h nas 3 primeiras horas e R$ 1,00/h depois.
                  </span>
                </li>
                <li>
                  <span className={local.featureIcon}>
                    <BellIcon size={18} />
                  </span>
                  <span>
                    <strong>Aviso de cada cobrança</strong>
                    Entradas, saídas, recargas e saldo baixo.
                  </span>
                </li>
              </ul>
            </div>

            <form
              className={local.intro}
              onSubmit={(e) => {
                e.preventDefault();
                lookup();
              }}
            >
              <label htmlFor="placa" className={local.label}>
                Placa do veículo
              </label>
              <div className={`${local.plateInput} ${touched && !valid ? local.plateInvalid : ''}`}>
                <span className={local.plateBand}>BRASIL</span>
                <input
                  id="placa"
                  value={plate}
                  onChange={(e) => setPlate(normalizePlate(e.target.value))}
                  onBlur={() => plate && setTouched(true)}
                  placeholder="ABC1D23"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={touched && !valid}
                  aria-describedby="placa-ajuda"
                />
              </div>
              <span id="placa-ajuda" className={touched && !valid ? local.helpError : local.help}>
                {touched && !valid ? 'Use o formato ABC1234 ou ABC1D23.' : 'Formato antigo ou Mercosul. Sem senha.'}
              </span>

              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnBlock} ${local.submit}`}
                disabled={busy || plate.length < 7}
              >
                {busy ? <Spinner /> : <>Continuar <ArrowRightIcon /></>}
              </button>
              <Link to="/painel" className={local.switchLink}>
                É operador? <span>Abrir o painel</span>
              </Link>
            </form>
            </div>
          ) : (
            <div className={local.registerWrap}>
              <div className={local.registerHead}>
                <h1 className={local.title} style={{ fontSize: 22 }}>
                  Cadastrar a placa <span className="mono">{plate}</span>
                </h1>
                <p className={local.lead}>
                  Quer adicionar saldo agora? Você também pode recarregar depois, pelo app.
                </p>
              </div>
              <RechargeForm
                balance={0}
                submitLabel={(amount) => `Cadastrar e recarregar ${amount}`}
                onSubmit={(amount, method) => register({ amount, method })}
                secondary={
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnBlock}`}
                    disabled={busy}
                    onClick={() => register()}
                  >
                    Cadastrar sem recarregar
                  </button>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
