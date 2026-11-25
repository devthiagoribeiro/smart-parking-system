import type {
  AppNotification,
  HistoryItem,
  ParkingEvent,
  PaymentMethod,
  PlateDetails,
  PlateListItem,
  PlateSummary,
  Pricing,
  RecognizeResult,
  Spot,
  TodayStats,
} from './types';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // Erros de validação do FastAPI: lista de { msg }.
    if (Array.isArray(detail) && detail[0]?.msg) {
      return String(detail[0].msg).replace(/^Value error, /, '');
    }
  }
  return `Erro ${status} ao falar com a API.`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiError(0, 'Não foi possível conectar à API.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, errorMessage(body, response.status));
  return body as T;
}

function json(method: string, data: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

const plate = (p: string) => encodeURIComponent(p);

export const api = {
  health: () => request<{ status: string }>('/health'),
  pricing: () => request<Pricing>('/pricing'),

  listPlates: () => request<PlateListItem[]>('/plates'),
  getPlate: (p: string) => request<PlateDetails>(`/plates/${plate(p)}`),
  createPlate: (numero_placa: string) =>
    request<PlateSummary>('/plates', json('POST', { numero_placa, saldo: 0 })),
  addBalance: (p: string, valor: number, metodo: PaymentMethod) =>
    request<PlateSummary>(`/plates/${plate(p)}/balance`, json('POST', { valor, metodo })),
  history: (p: string, limit = 50) =>
    request<HistoryItem[]>(`/plates/${plate(p)}/history?limit=${limit}`),
  notifications: (p: string, limit = 50) =>
    request<AppNotification[]>(`/plates/${plate(p)}/notifications?limit=${limit}`),
  markNotificationsRead: (p: string) =>
    request<{ marcadas: number }>(`/plates/${plate(p)}/notifications/read`, { method: 'POST' }),

  events: (limit = 50) => request<ParkingEvent[]>(`/events?limit=${limit}`),
  stats: () => request<TodayStats>('/stats/today'),
  spots: () => request<Spot[]>('/spots'),
  updateSpot: (id: number, ocupada: boolean, campo_gauss?: number) =>
    request<Spot>(`/spots/${id}`, json('PUT', { ocupada, campo_gauss })),

  recognize: (image: File, tipo?: 'entrada' | 'saida', deviceId = 'painel-simulador') => {
    const form = new FormData();
    form.append('image', image);
    const query = tipo ? `?tipo=${tipo}` : '';
    return request<RecognizeResult>(`/plates/recognize${query}`, {
      method: 'POST',
      body: form,
      headers: { 'X-Device-Id': deviceId },
    });
  },
};
