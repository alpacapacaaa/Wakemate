import AsyncStorage from '@react-native-async-storage/async-storage';

import { mockState } from './mock';
import {
  DEFAULT_ALARM,
  today,
  toggleWeekday,
  type AlarmSchedule,
  type AppState,
  type Member,
  type PersonalAlarm,
  type Room,
  type WakeRecord,
} from './model';

/**
 * Local stand-in for the backend that does not exist yet. What it will owe us: `docs/api-contract.md`.
 *
 * Every function is async and shaped like an API call on purpose: when real endpoints land this
 * module is replaced with fetch calls and no screen changes. Business rules a server would own are
 * kept out of here — the one real rule, `pickVoiceFor`, is isolated so it can move server-side.
 */

// Bumped whenever the mock content changes shape: the seed only runs on an empty store, so a
// stale saved copy would otherwise keep showing the previous prototype's data.
const KEY = 'app_state_v13';

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Invite codes people read aloud and type — no 0/O/1/I. */
function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function emptyState(): AppState {
  return {
    me: { id: id(), name: 'You', voiceUri: null, voiceDurationMs: null, voiceSoundName: null },
    rooms: [],
    personalAlarms: [],
    wakeRecords: [],
    onboardedAt: null,
  };
}

let cache: AppState | null = null;

async function read(): Promise<AppState> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(KEY);
  cache = raw ? (JSON.parse(raw) as AppState) : emptyState();
  return cache;
}

async function write(next: AppState): Promise<AppState> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

/**
 * Mutations run one at a time.
 *
 * Every operation here is read-modify-write over one blob, and `read` awaits — so two started
 * together both see the same "before" and the second silently throws away the first. Two quick
 * swipes on the deck did exactly that: three toggles fired back to back left only the last one.
 */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // A failed mutation must not wedge everything queued behind it.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AsyncApi = Record<string, (...args: any[]) => Promise<any>>;

/** Puts every operation through the queue, so callers cannot forget to. */
function serialize<T extends AsyncApi>(api: T): T {
  const out: AsyncApi = {};
  for (const key of Object.keys(api)) {
    out[key] = (...args: any[]) => serial(() => api[key](...args));
  }
  return out as T;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const operations = {
  getState: read,

  async reset(): Promise<AppState> {
    return write(emptyState());
  },

  async completeOnboarding(): Promise<AppState> {
    const s = await read();
    return write({ ...s, onboardedAt: new Date().toISOString() });
  },

  async setMyName(name: string): Promise<AppState> {
    const s = await read();
    const rooms = s.rooms.map((r) => ({
      ...r,
      members: r.members.map((m) => (m.id === s.me.id ? { ...m, name } : m)),
    }));
    return write({ ...s, me: { ...s.me, name }, rooms });
  },

  async setMyVoice(voiceUri: string, voiceDurationMs: number, voiceSoundName: string | null): Promise<AppState> {
    const s = await read();
    // My voice is mirrored into every room I'm in — that is what makes it available to roommates.
    const patch = { voiceUri, voiceDurationMs, voiceSoundName };
    const rooms = s.rooms.map((room) => ({
      ...room,
      members: room.members.map((m) => (m.id === s.me.id ? { ...m, ...patch } : m)),
    }));
    return write({ ...s, me: { ...s.me, ...patch }, rooms });
  },

  // MARK: rooms

  /**
   * Creating a room no longer sets a schedule for anyone else — each member owns theirs. Mine
   * starts at the default so a new room rings from day one; the day screen is where it changes.
   */
  async createRoom(name: string, alarm: AlarmSchedule = DEFAULT_ALARM): Promise<Room> {
    const s = await read();
    const room: Room = {
      id: id(),
      name,
      code: inviteCode(),
      createdAt: new Date().toISOString(),
      nativeAlarmId: null,
      members: [
        {
          id: s.me.id,
          name: s.me.name,
          voiceUri: s.me.voiceUri,
          voiceDurationMs: s.me.voiceDurationMs,
          voiceSoundName: s.me.voiceSoundName,
          alarm,
        },
      ],
    };
    await write({ ...s, rooms: [...s.rooms, room] });
    return room;
  },

  /**
   * Joining needs a server to resolve a code to a real room. Until then this creates a local room
   * carrying that code so the flow is exercisable end to end; it will be replaced by
   * `POST /rooms/join` verbatim.
   */
  async joinRoomByCode(code: string, roomName: string): Promise<Room> {
    const s = await read();
    const upper = code.toUpperCase();
    const existing = s.rooms.find((r) => r.code === upper);
    if (existing) return existing;
    // Built inline rather than through createRoom: operations are queued, so one calling another
    // would wait for a turn that cannot come until it returns.
    const room: Room = {
      id: id(),
      name: roomName,
      code: upper,
      createdAt: new Date().toISOString(),
      nativeAlarmId: null,
      members: [
        {
          id: s.me.id,
          name: s.me.name,
          voiceUri: s.me.voiceUri,
          voiceDurationMs: s.me.voiceDurationMs,
          voiceSoundName: s.me.voiceSoundName,
          alarm: DEFAULT_ALARM,
        },
      ],
    };
    await write({ ...s, rooms: [...s.rooms, room] });
    return room;
  },

  async updateRoom(roomId: string, patch: Partial<Room>): Promise<Room | null> {
    const s = await read();
    let updated: Room | null = null;
    const rooms = s.rooms.map((r) => {
      if (r.id !== roomId) return r;
      updated = { ...r, ...patch };
      return updated;
    });
    await write({ ...s, rooms });
    return updated;
  },

  /** Changes *my* schedule in a room. Nobody can move anyone else's alarm. */
  async updateMyAlarm(roomId: string, myId: string, patch: Partial<AlarmSchedule>): Promise<Room | null> {
    const s = await read();
    let updated: Room | null = null;
    const rooms = s.rooms.map((r) => {
      if (r.id !== roomId) return r;
      updated = {
        ...r,
        members: r.members.map((m) =>
          m.id === myId ? { ...m, alarm: { ...(m.alarm ?? DEFAULT_ALARM), ...patch } } : m
        ),
      };
      return updated;
    });
    await write({ ...s, rooms });
    return updated;
  },

  /**
   * Flips one weekday of my schedule in a room, deciding the new value *inside* the queued
   * operation. Working it out from a separately-read copy is what let two swipes collide.
   * Returns the schedule as it was, so a refused alarm can be put back exactly.
   */
  async toggleMyWeekday(
    roomId: string,
    myId: string,
    weekday: number
  ): Promise<{ room: Room; before: AlarmSchedule | null } | null> {
    const s = await read();
    const room = s.rooms.find((r) => r.id === roomId);
    if (!room) return null;

    const before = room.members.find((m) => m.id === myId)?.alarm ?? null;
    const patch = toggleWeekday(before, weekday);
    const updated: Room = {
      ...room,
      members: room.members.map((m) =>
        m.id === myId ? { ...m, alarm: { ...(m.alarm ?? DEFAULT_ALARM), ...patch } } : m
      ),
    };
    await write({ ...s, rooms: s.rooms.map((r) => (r.id === roomId ? updated : r)) });
    return { room: updated, before };
  },

  async addMember(roomId: string, member: Omit<Member, 'id'>): Promise<Room | null> {
    const s = await read();
    let updated: Room | null = null;
    const rooms = s.rooms.map((r) => {
      if (r.id !== roomId) return r;
      updated = { ...r, members: [...r.members, { ...member, id: id() }] };
      return updated;
    });
    await write({ ...s, rooms });
    return updated;
  },

  async leaveRoom(roomId: string): Promise<AppState> {
    const s = await read();
    return write({
      ...s,
      rooms: s.rooms.filter((r) => r.id !== roomId),
      wakeRecords: s.wakeRecords.filter((w) => w.roomId !== roomId),
    });
  },

  // MARK: personal alarms

  async addPersonalAlarm(input: Omit<PersonalAlarm, 'id' | 'nativeAlarmId'>): Promise<PersonalAlarm> {
    const s = await read();
    const alarm: PersonalAlarm = { ...input, id: id(), nativeAlarmId: null };
    await write({ ...s, personalAlarms: [...s.personalAlarms, alarm] });
    return alarm;
  },

  async updatePersonalAlarm(alarmId: string, patch: Partial<PersonalAlarm>): Promise<PersonalAlarm | null> {
    const s = await read();
    let updated: PersonalAlarm | null = null;
    const personalAlarms = s.personalAlarms.map((a) => {
      if (a.id !== alarmId) return a;
      updated = { ...a, ...patch };
      return updated;
    });
    await write({ ...s, personalAlarms });
    return updated;
  },

  async deletePersonalAlarm(alarmId: string): Promise<AppState> {
    const s = await read();
    return write({ ...s, personalAlarms: s.personalAlarms.filter((a) => a.id !== alarmId) });
  },

  // MARK: morning log

  /** Idempotent per (room, date, member) — getting up twice on one morning is still one record. */
  async recordWake(record: WakeRecord): Promise<AppState> {
    const s = await read();
    const exists = s.wakeRecords.some(
      (w) => w.roomId === record.roomId && w.date === record.date && w.memberId === record.memberId
    );
    if (exists) return s;
    return write({ ...s, wakeRecords: [...s.wakeRecords, record] });
  },

  // MARK: mock content (design prototype only — see lib/mock.ts)

  async loadMockData(): Promise<AppState> {
    const s = await read();
    return write(mockState(s.me.id));
  },
};

export const store = serialize(operations);

/**
 * Which roommate's voice rings for `myId` in this room.
 *
 * Uniform among members other than me who have actually recorded. Returns null when nobody
 * qualifies and the caller must fall back to the bundled sound — an alarm that does not ring is
 * the one unacceptable outcome.
 */
export function pickVoiceFor(room: Room | null, myId: string): Member | null {
  if (!room) return null;
  const candidates = room.members.filter((m) => m.id !== myId && m.voiceUri);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** A day's wake records for a room, in the order people actually got up. */
export function morningLog(state: AppState, roomId: string, date = today()): WakeRecord[] {
  return state.wakeRecords
    .filter((w) => w.roomId === roomId && w.date === date)
    .sort((a, b) => a.wokeAt.localeCompare(b.wokeAt));
}

/** Distinct past dates for a room, newest first — the room's history. */
export function pastMornings(state: AppState, roomId: string, excludeDate = today()): string[] {
  const dates = new Set(
    state.wakeRecords.filter((w) => w.roomId === roomId && w.date !== excludeDate).map((w) => w.date)
  );
  return [...dates].sort((a, b) => b.localeCompare(a));
}
