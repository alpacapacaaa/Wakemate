import { myAlarmIn, ringsOnWeekday, type PersonalAlarm, type Room } from './model';

/**
 * The week is this product's real axis: alarms repeat by weekday and mornings archive by date.
 * These helpers let the deck be the seven days — which is also what keeps its seven colours
 * meaningful no matter how many rooms exist.
 *
 * Weekday index is Monday-based (0=Mon … 6=Sun), matching the days bitmask (bit0=Mon).
 */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Local date (YYYY-MM-DD) of the given weekday in the current week. */
export function dateOfWeekday(i: number): string {
  const now = new Date();
  const monBased = (now.getDay() + 6) % 7;
  const d = new Date(now);
  d.setDate(now.getDate() - monBased + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monday-based index of today. */
export function todayWeekday(): number {
  return (new Date().getDay() + 6) % 7;
}

/** Rooms where *my* alarm rings on the given weekday. */
export function roomsOn(i: number, rooms: Room[], myId: string): Room[] {
  return rooms.filter((r) => ringsOnWeekday(myAlarmIn(r, myId), i));
}

export function fmtDaysEN(days: number): string {
  if (days === 0) return 'Once';
  if (days === 127) return 'Every day';
  if (days === 31) return 'Weekdays';
  if (days === 96) return 'Weekends';
  const L = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  return L.filter((_, i) => days & (1 << i)).join(' · ');
}

/** The same schedule, said in Korean — functional copy is Korean, day names on the deck stay English. */
export function fmtDaysKR(days: number): string {
  if (days === 0) return '한 번만';
  if (days === 127) return '매일';
  if (days === 31) return '평일';
  if (days === 96) return '주말';
  const L = ['월', '화', '수', '목', '금', '토', '일'];
  return L.filter((_, i) => days & (1 << i)).join('·');
}

export type UpcomingRing = {
  /** Minutes from now until it rings. */
  minutes: number;
  time: string;
  name: string;
  kind: 'room' | 'personal';
  id: string;
};

/**
 * Every enabled alarm's next occurrence, soonest first — what the Tonight screen is built on.
 * One-shot alarms (days=0) ring at their next time occurrence; repeating ones at the first
 * matching weekday.
 */
export function upcomingRings(rooms: Room[], personals: PersonalAlarm[], myId: string): UpcomingRing[] {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayIdx = todayWeekday();
  const out: UpcomingRing[] = [];

  const push = (time: string, days: number, enabled: boolean, name: string, kind: 'room' | 'personal', id: string) => {
    if (!enabled) return;
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const t = h * 60 + m;
    for (let off = 0; off < 8; off++) {
      const d = (todayIdx + off) % 7;
      const ringsThatDay = days === 0 ? true : ((days >> d) & 1) === 1;
      if (!ringsThatDay) continue;
      if (off === 0 && t <= nowMin) continue;
      out.push({ minutes: off * 1440 + t - nowMin, time, name, kind, id });
      return;
    }
  };

  for (const r of rooms) {
    const mine = myAlarmIn(r, myId);
    if (mine) push(mine.time, mine.days, mine.enabled, r.name, 'room', r.id);
  }
  for (const a of personals) push(a.time, a.days, a.enabled, a.label || 'Alarm', 'personal', a.id);
  return out.sort((a, b) => a.minutes - b.minutes);
}

export function fmtCountdown(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}
