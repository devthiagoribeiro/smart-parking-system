/** Tipos espelhando as respostas da API (backend/api/main.py). */

export type EventType = 'entrada' | 'saida' | 'recusada';
export type PaymentMethod = 'pix' | 'cartao';

export interface PlateSummary {
  numero_placa: string;
  saldo: number;
}

export interface PlateDetails extends PlateSummary {
  no_patio: boolean;
  entrada_em: string | null;
  notificacoes_nao_lidas: number;
}

export interface PlateListItem extends PlateSummary {
  no_patio: boolean;
  ultima_movimentacao: string | null;
}

export interface HistoryItem {
  id: string;
  tipo: EventType | 'recarga';
  data: string;
  valor: number | null;
  permanencia_min: number | null;
  metodo: string | null;
}

export type NotificationKind =
  | 'entrada'
  | 'saida'
  | 'saida_recusada'
  | 'recarga'
  | 'saldo_baixo';

export interface AppNotification {
  id: number;
  tipo: NotificationKind;
  titulo: string;
  mensagem: string;
  lida: boolean;
  data: string;
}

export interface ParkingEvent {
  id: number;
  numero_placa: string;
  tipo: EventType;
  data: string;
  valor: number | null;
  permanencia_min: number | null;
  dispositivo: string | null;
  tempo_ocr_ms: number | null;
}

export interface Spot {
  id: number;
  ocupada: boolean;
  campo_gauss: number | null;
  atualizado_em: string;
  ultima_leitura_em: string | null;
}

export interface TodayStats {
  vagas_ocupadas: number;
  vagas_total: number;
  veiculos_no_patio: number;
  entradas: number;
  saidas: number;
  saidas_recusadas: number;
  receita: number;
  recargas: number;
  permanencia_media_min: number | null;
  receita_por_hora: { hora: number; valor: number }[];
}

export interface Pricing {
  primeiras_horas: number;
  valor_hora: number;
  valor_hora_extra: number;
}

export interface RecognizeResult {
  success: boolean;
  plate: string | null;
  processing_time_ms: number;
  saldo?: number;
  tipo?: 'entrada' | 'saida';
  duplicada?: boolean;
  valor_cobrado?: number | null;
  permanencia_min?: number | null;
}
