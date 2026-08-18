import { DEFAULT_ALARM, type AlarmSchedule, type AppState, type Member, type Room, type WakeRecord } from './model';

/**
 * Mock content for the design prototype.
 *
 * There is no backend yet (see `docs/MVP.md`), so friends cannot actually join a room and no real
 * morning data can exist. Every screen would otherwise be an empty state, which makes the design
 * impossible to judge. This fills the app with a plausible week so the layouts can be evaluated
 * against realistic content.
 *
 * It is fiction and the UI says so — "나" 탭 has a labelled reset. Nothing here should survive
 * into a build that talks to a real server.
 */

const NAMES = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Quinn', 'Avery'];

function localDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Code expiry `days` from now — negative makes an already-expired code, so that state is judgeable. */
function expiry(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function id(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

/** Monday-based weekday of a YYYY-MM-DD date, matching the days bitmask. */
function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function ringsOn(days: number, date: string): boolean {
  return ((days >> weekdayOf(date)) & 1) === 1;
}

/**
 * The `count` most recent dates a schedule actually rings on, newest first, starting `minBack` days
 * back. Mornings have to land on days the room rings: a weekday room with a Saturday morning in its
 * log puts "3 people got up" under "no alarm today", and every screen built on the log inherits the
 * contradiction.
 */
function ringDatesBack(days: number, count: number, minBack = 1): string[] {
  const out: string[] = [];
  for (let back = minBack; back < minBack + 28 && out.length < count; back++) {
    const date = localDate(back);
    if (ringsOn(days, date)) out.push(date);
  }
  return out;
}

/** "07:02" → "2026-08-14T07:02:00" */
function at(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00`;
}

/**
 * Everyone in a room keeps their own schedule, so the mock spreads them out: same room, times a few
 * minutes to a couple of hours apart, and one person with no alarm at all. A room where everyone
 * happens to share one time would hide the whole point of the model.
 */
function scheduleFor(index: number, base: string, days: number): AlarmSchedule | null {
  if (index % 5 === 3) return null; // one person in the room has not set one
  const [h, m] = base.split(':').map(Number);
  const shifted = (h * 60 + m + [0, 15, -20, 45, 30][index % 5] + 1440) % 1440;
  return {
    ...DEFAULT_ALARM,
    time: `${String(Math.floor(shifted / 60)).padStart(2, '0')}:${String(shifted % 60).padStart(2, '0')}`,
    days: index % 3 === 2 ? 127 : days,
  };
}

function member(prefix: string, index: number, hasVoice: boolean, base = '07:00', days = 31): Member {
  return {
    id: id(prefix, index),
    name: NAMES[index % NAMES.length],
    // Mock members have no audio file. Alarms fall back to the bundled sound, and the room screens
    // show them as having recorded so the layouts can be judged with full rooms.
    voiceUri: hasVoice ? `mock://voice/${prefix}-${index}` : null,
    voiceDurationMs: hasVoice ? 6000 + index * 900 : null,
    // Fiction has no file on this device, so these never reach AlarmKit — the alarm falls back to
    // the system sound until a real one is downloaded. See lib/alarm.ts.
    voiceSoundName: null,
    alarm: scheduleFor(index, base, days),
  };
}

/** Me, inside a room, with my own schedule for it. */
function meIn(me: AppState['me'], alarm: AlarmSchedule | null): Member {
  return {
    id: me.id,
    name: me.name,
    voiceUri: me.voiceUri,
    voiceDurationMs: me.voiceDurationMs,
    voiceSoundName: me.voiceSoundName,
    alarm,
  };
}

export function mockState(meId: string): AppState {
  const me = { id: meId, name: 'You', voiceUri: 'mock://voice/me', voiceDurationMs: 7400, voiceSoundName: null };

  const myStudyAlarm: AlarmSchedule = { ...DEFAULT_ALARM, time: '07:00', days: 31 };
  const studyMembers: Member[] = [
    meIn(me, myStudyAlarm),
    member('study', 0, true, '07:00', 31),
    member('study', 1, true, '07:00', 31),
    member('study', 2, true, '07:00', 31),
    member('study', 3, false, '07:00', 31),
  ];

  const gymMembers: Member[] = [
    meIn(me, { ...DEFAULT_ALARM, time: '06:30', days: 96, snoozeMinutes: 5 }),
    member('gym', 1, true, '06:30', 96),
    member('gym', 4, true, '06:30', 96),
  ];

  // Ownership is spread so every state the settings screen has is on show: a room I own (kick,
  // reissue), one I don't (the same screen without the owner tools), and one with a dead code.
  const study: Room = {
    id: 'room-study',
    name: 'Study crew',
    code: 'K7QM3P',
    codeExpiresAt: expiry(5),
    ownerId: meId,
    createdAt: new Date().toISOString(),
    nativeAlarmId: null,
    members: studyMembers,
  };

  const gym: Room = {
    id: 'room-gym',
    name: 'Gym buddies',
    code: 'B4XR9T',
    codeExpiresAt: expiry(2),
    ownerId: 'gym-1',
    createdAt: new Date().toISOString(),
    nativeAlarmId: null,
    members: gymMembers,
  };

  const wakeRecords: WakeRecord[] = [];

  // Today: three of the study room are up, I am not — the state the room screen should show most
  // often, and the one where "나는 아직" has to read well. Only on a day it rings; on a day off the
  // room is meant to be empty.
  const t = localDate(0);
  if (ringsOn(myStudyAlarm.days, t)) {
    wakeRecords.push(
      { roomId: study.id, date: t, memberId: 'study-0', wokeAt: at(t, '07:02'), wokenByMemberId: 'study-1' },
      { roomId: study.id, date: t, memberId: 'study-1', wokeAt: at(t, '07:05'), wokenByMemberId: meId },
      { roomId: study.id, date: t, memberId: 'study-2', wokeAt: at(t, '07:11'), wokenByMemberId: 'study-0' }
    );
  }

  // A week of past mornings, including a day I overslept and a day everyone made it. They are laid
  // onto the room's last five ringing days rather than the last five calendar days.
  const past: [string, string, string | null][][] = [
    [['study-1', '07:01', meId], ['study-0', '07:03', 'study-2'], [meId, '07:04', 'study-1'], ['study-2', '07:09', 'study-0']],
    [[meId, '07:00', 'study-2'], ['study-0', '07:02', meId], ['study-1', '07:06', 'study-0']],
    [['study-2', '07:03', 'study-1'], ['study-0', '07:07', meId], [meId, '07:08', 'study-0'], ['study-1', '07:12', 'study-2']],
    [['study-0', '07:01', 'study-1'], [meId, '07:02', 'study-2']],
    [[meId, '06:58', 'study-0'], ['study-1', '07:04', meId], ['study-2', '07:05', 'study-1'], ['study-0', '07:10', 'study-2']],
  ];
  ringDatesBack(myStudyAlarm.days, past.length).forEach((date, i) => {
    for (const [memberId, hhmm, by] of past[i]) {
      wakeRecords.push({ roomId: study.id, date, memberId, wokeAt: at(date, hhmm), wokenByMemberId: by });
    }
  });

  // The gym room runs weekends only, so its last morning is its last weekend — a room that is
  // quiet today still has to look intentional.
  const [g] = ringDatesBack(96, 1);
  if (g) {
    wakeRecords.push(
      { roomId: gym.id, date: g, memberId: 'gym-1', wokeAt: at(g, '06:31'), wokenByMemberId: meId },
      { roomId: gym.id, date: g, memberId: meId, wokeAt: at(g, '06:35'), wokenByMemberId: 'gym-4' }
    );
  }

  // Enough rooms that every weekday has at least one and busy days have several — the week deck
  // is judged by how a full week reads.
  const extra: Room[] = [
    // Flatmates' code is already dead and I own it — the "make a new code" state.
    { id: 'room-flat', name: 'Flatmates', code: 'M2WD8K', time: '08:00', days: 127, seed: 'flat', size: 4, exp: -1, mine: true },
    { id: 'room-cafe', name: 'Café openers', code: 'R9NX4V', time: '05:40', days: 31, seed: 'cafe', size: 3, exp: 6, mine: false },
    { id: 'room-run', name: 'Run club', code: 'T6HY2Q', time: '06:00', days: 96, seed: 'run', size: 5, exp: 3, mine: true },
    { id: 'room-lab', name: 'Lab people', code: 'C3JP7L', time: '09:00', days: 31, seed: 'lab', size: 5, exp: 1, mine: false },
    { id: 'room-band', name: 'Band practice', code: 'W8FZ5N', time: '10:30', days: 96, seed: 'band', size: 4, exp: 4, mine: false },
  ].map(({ id: rid, name, code, time, days, seed, size, exp, mine }) => ({
    id: rid,
    name,
    code,
    codeExpiresAt: expiry(exp),
    ownerId: mine ? meId : id(seed, 0),
    createdAt: new Date().toISOString(),
    nativeAlarmId: null,
    members: [
      meIn(me, { ...DEFAULT_ALARM, time, days }),
      ...Array.from({ length: size - 1 }, (_, i) => member(seed, i, i % 4 !== 3, time, days)),
    ],
  }));

  for (const room of extra) {
    const mine = room.members[0].alarm;
    if (!mine || !ringsOn(mine.days, t)) continue;
    const woke = room.members.slice(1, 1 + Math.max(1, Math.floor((room.members.length - 1) / 2)));
    woke.forEach((m, i) => {
      wakeRecords.push({
        roomId: room.id,
        date: t,
        memberId: m.id,
        wokeAt: at(t, `0${Number(mine.time.slice(0, 2))}:${String(2 + i * 4).padStart(2, '0')}`.slice(-5)),
        wokenByMemberId: room.members[(i + 2) % room.members.length].id,
      });
    });
  }

  return {
    me,
    // Loading fixtures is not a first run — whoever asked for them has already seen the app.
    onboardedAt: new Date().toISOString(),
    blockedIds: [],
    reports: [],
    rooms: [study, gym, ...extra],
    personalAlarms: [
      {
        id: 'alarm-nap',
        time: '13:30',
        days: 0,
        label: 'Nap',
        enabled: false,
        snoozeEnabled: false,
        snoozeMinutes: 5,
        nativeAlarmId: null,
      },
      {
        id: 'alarm-night',
        time: '23:00',
        days: 127,
        label: 'Wind down',
        enabled: true,
        snoozeEnabled: true,
        snoozeMinutes: 10,
        nativeAlarmId: null,
      },
    ],
    wakeRecords,
  };
}
