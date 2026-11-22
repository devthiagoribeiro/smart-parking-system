# Smart Parking — Frontend

Painel do operador e app do cliente, em React + TypeScript (Vite). Estilos em
CSS puro com variáveis de tema (modo claro e escuro) e animações em CSS.

| Rota | Tela |
|------|------|
| `/` | Início: escolhe entre painel e app |
| `/painel` | Visão geral: ocupação, receita, vagas em tempo real, portaria, movimentações e receita por hora |
| `/painel/movimentacoes` | Histórico completo, com o dispositivo que fez cada leitura |
| `/painel/clientes` | Placas cadastradas e saldos |
| `/painel/dispositivos` | Simulador: liga/desliga as vagas e envia fotos para o reconhecimento |
| `/app` | App do cliente: entra só com a placa (sem senha) |
| `/app/recarga` | Recarga simulada (Pix ou cartão, sem gateway real) |
| `/app/avisos` | Notificações: entrada, cobrança, saída recusada, recarga, saldo baixo |
| `/app/extrato` | Movimentações e recargas por dia |

Os dados são atualizados a cada 2–3 s (polling). Uma notificação nova aparece
como aviso flutuante no app do cliente.

## Rodar

Pré-requisitos: Node 20+ e a API rodando (ver `backend/api/README.md`).

```powershell
cd frontend
copy .env.example .env    # ajuste VITE_API_URL se a API estiver em outro endereço
npm install
npm run dev
```

Abra <http://localhost:5173>.

Para gerar a versão de produção: `npm run build` (saída em `dist/`).

## Testar sem o hardware

Em **Painel → Dispositivos**:

- **Sensores das vagas**: cada chave envia `PUT /spots/{id}` como o ESP32 faria.
- **Câmera da portaria**: envia uma foto para `POST /plates/recognize`, o mesmo
  endpoint da ESP32-CAM. Use as imagens de
  `backend/license_plate_service/images/test_images/`.

Fluxo completo: cadastre a placa no app → envie a foto (entrada) → envie de
novo depois de alguns segundos (saída) → o valor é debitado e o cliente recebe a
notificação. Sem saldo, a saída é recusada e aparece no painel e no app.

## Estrutura

```
src/
  main.tsx            rotas
  Landing.tsx         tela inicial
  styles/             tokens de tema, base e animações
  lib/                cliente da API, tipos, formatação, tema, hooks de polling
  components/         ícones, placa Mercosul, botão de tema, avisos
  panel/              painel do operador
  client/             app do cliente
```
