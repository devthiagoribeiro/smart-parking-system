import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import ClientHome from './client/ClientHome';
import ClientLayout from './client/ClientLayout';
import Login from './client/Login';
import Notifications from './client/Notifications';
import Recharge from './client/Recharge';
import { SessionProvider, useSession } from './client/session';
import Statement from './client/Statement';
import Landing from './Landing';
import Clients from './panel/Clients';
import Devices from './panel/Devices';
import Movements from './panel/Movements';
import Overview from './panel/Overview';
import PanelLayout from './panel/PanelLayout';
import './styles/global.css';

/** Sem placa informada, o app do cliente mostra a tela de entrada. */
function ClientGate() {
  const { plate } = useSession();
  return plate ? <ClientLayout key={plate} /> : <Login />;
}

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  {
    path: '/painel',
    element: <PanelLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'movimentacoes', element: <Movements /> },
      { path: 'clientes', element: <Clients /> },
      { path: 'dispositivos', element: <Devices /> },
    ],
  },
  {
    path: '/app',
    element: <ClientGate />,
    children: [
      { index: true, element: <ClientHome /> },
      { path: 'recarga', element: <Recharge /> },
      { path: 'avisos', element: <Notifications /> },
      { path: 'extrato', element: <Statement /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  </StrictMode>,
);
