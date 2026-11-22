import type { Pricing } from './types';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const timeSeconds = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const longDate = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export const formatMoney = (value: number) => money.format(value).replace(/ /g, ' ');

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatTimeSeconds = (iso: string) => timeSeconds.format(new Date(iso));
export const formatLongDate = (date = new Date()) => longDate.format(date);

/** "14:02", "Ontem, 18:40" ou "20 de nov., 12:31". */
export function formatRelativeDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - date.getTime()) / 86_400_000) + 1;
  if (date >= startOfToday) return `Hoje, ${time.format(date)}`;
  if (diffDays === 1) return `Ontem, ${time.format(date)}`;
  return `${dayMonth.format(date)}, ${time.format(date)}`;
}

/** Rótulo de grupo de dia para listas: Hoje, Ontem, 20 de novembro. */
export function dayGroupLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  if (date >= startOfToday) return 'Hoje';
  if (date >= startOfYesterday) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(date);
}

/** 108 → "1h 48min", 25 → "25min". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

/** Cronômetro HH:MM:SS a partir de segundos. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** "agora", "há 3 min", "há 2 h". */
export function formatAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'agora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  return `há ${Math.floor(hours / 24)} d`;
}

export const DEFAULT_PRICING: Pricing = {
  primeiras_horas: 3,
  valor_hora: 3,
  valor_hora_extra: 1,
};

/** Mesmo cálculo de backend/api/database.py::calculate_fee. */
export function calculateFee(hours: number, pricing: Pricing = DEFAULT_PRICING): number {
  const first = Math.min(hours, pricing.primeiras_horas);
  const extra = Math.max(hours - pricing.primeiras_horas, 0);
  return Math.round((first * pricing.valor_hora + extra * pricing.valor_hora_extra) * 100) / 100;
}

export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

export const isValidPlate = (value: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value);
