/**
 * Domain model. Scope and the decisions behind it: `docs/MVP.md`.
 *
 * The shape follows Setlog: a small private room of friends is the unit. The room is *who* you wake
 * up with, not when — each member keeps their own time and days, because a study group at 07:00 and
 * a flatmate on lates should still be able to wake each other. Everyone hears a randomly chosen
 * roommate's voice, and the collective artifact the room produces is the morning log: who actually
 * got up, and when.
 *
 * Personal alarms exist alongside so the app is still a normal alarm app.
 */

export type Member = {
  id: string;
  name: string;
  /** Local URI or remote URL of this member's voice; null until they record. */
  voiceUri: string | null;
  voiceDurationMs: number | null;
  /**
   * Filename of this voice inside the App Group's Sounds directory — what AlarmKit is actually
   * handed. Null until the file is on *this* device: a voice we can play in-app is not the same as
   * one the system can ring, and scheduling a name with no file behind it fails.
   */
  voiceSoundName: string | null;
  /**
   * This member's own wake-up schedule in this room. Everyone sets their own — the room is who you
   * wake up with, not when. Null means they have not set one and nothing rings for them.
   */
  alarm: AlarmSchedule | null;
};

/** bit0=월(1) … bit6=일(64). 0 = no repeat (one-shot). */
export type Days = number;

export type SnoozeMinutes = 5 | 9 | 10 | 15;

export type AlarmSchedule = {
  /** "HH:MM", 24h, device-local wall clock. */
  time: string;
  days: Days;
  enabled: boolean;
  snoozeEnabled: boolean;
  snoozeMinutes: SnoozeMinutes;
};

export type Room = {
  id: string;
  name: string;
  /** Short human-shareable invite code. */
  code: string;
  /**
   * When the code stops working — 7 days after issue. The owner can reissue; the settings screen
   * shows the time left so nobody shares a dead code.
   */
  codeExpiresAt: string;
  /**
   * Whoever created the room. The only member who can remove someone, reissue the code, or hand
   * the room over — and ownership never moves by itself (`docs/MVP.md`).
   */
  ownerId: string;
  members: Member[];
  createdAt: string;
  /** AlarmKit's id for *my* alarm in this room, on *this* device. */
  nativeAlarmId: string | null;
};

/** My own schedule in a room, or null if I have not set one. */
export function myAlarmIn(room: Room, myId: string): AlarmSchedule | null {
  return room.members.find((m) => m.id === myId)?.alarm ?? null;
}

/** Does this schedule ring on the given Monday-based weekday? */
export function ringsOnWeekday(alarm: AlarmSchedule | null, weekday: number): boolean {
  return !!alarm && alarm.enabled && ((alarm.days >> weekday) & 1) === 1;
}

/**
 * Turning one weekday on or off, as a patch.
 *
 * `enabled` and `days` can disagree — a schedule can be switched off while still carrying five
 * weekdays. On screen that reads as every day being off, so turning one day back on has to mean
 * *that day only*; otherwise one tap silently revives four other mornings. This reads the days
 * through `enabled` so what you toggle is what you saw, and switches the schedule off entirely once
 * the last day goes, because a schedule with no days rings on nothing anyway.
 */
export function toggleWeekday(alarm: AlarmSchedule | null, weekday: number): Partial<AlarmSchedule> {
  const bit = 1 << weekday;
  // Read the days *through* enabled, and treat "no schedule" as no days: both look like an empty
  // week on screen, so turning one day on must give exactly that day.
  const visible = alarm?.enabled ? alarm.days : 0;
  const days = ringsOnWeekday(alarm, weekday) ? visible & ~bit : visible | bit;
  return { days, enabled: days !== 0 };
}

/** A personal alarm — no room, no shared morning. Plain alarm-clock behavior. */
export type PersonalAlarm = AlarmSchedule & {
  id: string;
  label: string;
  nativeAlarmId: string | null;
};

/**
 * One person getting up on one day in one room. The morning log is just these, grouped.
 * `wokenByMemberId` is which roommate's voice rang — the reveal on the ring screen.
 */
export type WakeRecord = {
  roomId: string;
  /** YYYY-MM-DD, local. */
  date: string;
  memberId: string;
  wokeAt: string;
  wokenByMemberId: string | null;
};

export type Me = {
  id: string;
  name: string;
  voiceUri: string | null;
  voiceDurationMs: number | null;
  /** See Member.voiceSoundName. */
  voiceSoundName: string | null;
};

/** A report I filed about someone's recording. Kept until a server exists to receive it. */
export type Report = {
  memberId: string;
  roomId: string;
  at: string;
};

export type AppState = {
  me: Me;
  rooms: Room[];
  personalAlarms: PersonalAlarm[];
  wakeRecords: WakeRecord[];
  /**
   * People whose voice must never wake me (and, once the server owns assignment, who never hear
   * mine). App Store guideline 1.2 requires blocking wherever user recordings reach other users.
   */
  blockedIds: string[];
  reports: Report[];
  /**
   * When the first run finished, or null if it has not. Tracked explicitly rather than guessed
   * from "has a name" or "has a room", because someone who deliberately skipped both should not be
   * asked again every launch.
   */
  onboardedAt: string | null;
};

export const SNOOZE_OPTIONS: SnoozeMinutes[] = [5, 9, 10, 15];

export const DEFAULT_ALARM: AlarmSchedule = {
  time: '07:00',
  days: 31, // 평일
  enabled: true,
  snoozeEnabled: true,
  snoozeMinutes: 9,
};

/** YYYY-MM-DD in local time — the key the morning log groups by. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
