import { useState } from 'react';
import { EmptyState, ErrorBanner, LiveDot } from '../components/ui';
import { api } from '../lib/api';
import { formatMoney, formatRelativeDay, normalizePlate } from '../lib/format';
import { usePolling } from '../lib/hooks';
import table from './overview.module.css';
import styles from './panel.module.css';
import local from './pages.module.css';

const LOW_BALANCE = 10;

export default function Clients() {
  const plates = usePolling(api.listPlates, 4000);
  const [query, setQuery] = useState('');
  const q = normalizePlate(query);
  const rows = plates.data?.filter((p) => p.numero_placa.includes(q)) ?? [];
  const totalBalance = plates.data?.reduce((sum, p) => sum + p.saldo, 0) ?? 0;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Clientes</h1>
          <p className={styles.pageSub}>
            {plates.data
              ? `${plates.data.length} placas cadastradas · ${formatMoney(totalBalance)} em saldo`
              : 'Placas cadastradas e saldos'}
          </p>
        </div>
        <label className={local.search}>
          <span className="visually-hidden">Buscar placa</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar placa"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      {plates.error && <ErrorBanner message={plates.error} />}

      <section className={styles.card} aria-label="Lista de clientes">
        {rows.length === 0 ? (
          <EmptyState>{plates.data ? 'Nenhuma placa encontrada.' : 'Carregando…'}</EmptyState>
        ) : (
          <div className={table.tableWrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th scope="col">Placa</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Última movimentação</th>
                  <th scope="col" className={table.right}>
                    Saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.numero_placa}>
                    <td className={table.cellPlate}>{p.numero_placa}</td>
                    <td>
                      {p.no_patio ? (
                        <span className={`${table.status} ${table.statusLive}`}>
                          <LiveDot /> No pátio
                        </span>
                      ) : (
                        <span className={`${table.status} ${table.statusOk}`}>Fora</span>
                      )}
                    </td>
                    <td className={table.cellSoft}>
                      {p.ultima_movimentacao ? formatRelativeDay(p.ultima_movimentacao) : '—'}
                    </td>
                    <td
                      className={`${table.right} num`}
                      style={p.saldo < LOW_BALANCE ? { color: 'var(--occ)' } : undefined}
                    >
                      {formatMoney(p.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
