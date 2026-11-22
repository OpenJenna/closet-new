import { WeatherCondition } from '../types/wardrobe';

export function formatCurrencyKRW(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₩${safe.toLocaleString('ko-KR')}`;
}

export function formatShortDotDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-');
  return `${y}. ${Number(m)}. ${Number(d)}.`;
}

export function formatPaddedDotDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-');
  return `${y}. ${m}. ${d}.`;
}

const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function formatKoreanFullDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayName = WEEKDAYS_KO[dt.getDay()] ?? '';
  return `${y}년 ${m}월 ${d}일 (${dayName})`;
}

export function formatKoreanMonthDay(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [, m, d] = isoDate.split('-').map(Number);
  return `${m}월 ${d}일`;
}

export function getWeatherLabel(condition: WeatherCondition): string {
  switch (condition) {
    case 'sunny':
      return '맑음';
    case 'partly_cloudy':
      return '구름 조금';
    case 'cloudy':
      return '흐림';
    case 'rainy':
      return '비';
    case 'snowy':
      return '눈';
  }
}

export function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

