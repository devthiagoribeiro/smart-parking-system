import { Link } from 'react-router-dom';
import { ArrowRightIcon, ChipIcon, LogoMark } from './components/icons';
import { ThemeToggle } from './components/ui';
import styles from './landing.module.css';

export default function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.mark}>
            <LogoMark size={18} />
          </span>
          Smart Parking
        </span>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            <ChipIcon size={14} /> Instrumentação eletrônica · IoT
          </span>
          <h1 className={styles.title}>Estacionamento inteligente com cobrança automática pela placa.</h1>
          <p className={styles.lead}>
            Magnetômetros detectam a ocupação das vagas e a ESP32-CAM lê a placa na entrada e na saída. O valor é
            debitado do saldo do cliente sem parar no caixa.
          </p>
        </div>

        <div className={styles.cards}>
          <Link to="/painel" className={styles.card}>
            <span className={styles.cardTitle}>Painel do operador</span>
            <span className={styles.cardText}>Vagas em tempo real, portaria, movimentações e receita.</span>
            <span className={styles.cardCta}>
              Abrir painel <ArrowRightIcon size={16} />
            </span>
          </Link>
          <Link to="/app" className={styles.card} style={{ animationDelay: '80ms' }}>
            <span className={styles.cardTitle}>App do cliente</span>
            <span className={styles.cardText}>Entre com a placa para recarregar e acompanhar as cobranças.</span>
            <span className={styles.cardCta}>
              Abrir app <ArrowRightIcon size={16} />
            </span>
          </Link>
        </div>
      </main>
    </div>
  );
}
