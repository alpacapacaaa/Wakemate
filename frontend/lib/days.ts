// spec-v1.1.md §1.2 — bit0=월(1) bit1=화(2) ... bit6=일(64). 평일=31, 주말=96, 매일=127.
// 0 is rejected by the server with VALIDATION_ERROR (1회성 알람 MVP 미지원).

export const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export const WEEKDAYS = 31;
export const WEEKEND = 96;
export const EVERYDAY = 127;

export function isDaySelected(days: number, index: number): boolean {
  return (days & (1 << index)) !== 0;
}

export function toggleDay(days: number, index: number): number {
  return days ^ (1 << index);
}

export function formatDays(days: number): string {
  if (days === EVERYDAY) return '매일';
  if (days === WEEKDAYS) return '평일';
  if (days === WEEKEND) return '주말';
  const selected = DAY_LABELS.filter((_, i) => isDaySelected(days, i));
  return selected.length === 0 ? '요일 없음' : selected.join(' ');
}

/**
 * Same information, but shaped to sit inside a sentence: "월요일 아침에 울려요" rather than the
 * ungrammatical "월 아침에 울려요" that the bare label produces.
 */
export function formatDaysSentence(days: number): string {
  if (days === EVERYDAY) return '매일';
  if (days === WEEKDAYS) return '평일';
  if (days === WEEKEND) return '주말';
  const selected = DAY_LABELS.filter((_, i) => isDaySelected(days, i));
  if (selected.length === 0) return '';
  if (selected.length === 1) return `${selected[0]}요일`;
  return selected.join('·');
}
