import { Alert, Linking } from 'react-native';

import AlarmKitModule from '../modules/alarm-kit';
import { myAlarmIn, type AlarmSchedule, type AppState, type PersonalAlarm, type Room } from './model';
import { pickVoiceFor, store } from './store';
import { parseAlarmTime } from './time';

/**
 * AlarmKit plays a sound by filename out of the App Group's Library/Sounds directory, so a voice
 * has to be *copied there* before it can ring — an alarm scheduled with a name that has no file
 * behind it is refused outright.
 *
 * This is the step that was missing: the app recorded a voice, kept it in its own sandbox, and
 * handed AlarmKit a filename that never existed anywhere.
 */
export async function saveVoiceAsAlarmSound(voiceUri: string): Promise<string | null> {
  try {
    // The recorder hands back a file:// URL; the native side copies by path.
    const path = voiceUri.startsWith('file://') ? decodeURI(voiceUri.slice('file://'.length)) : voiceUri;
    // One deterministic name, overwritten in place (the native side removes before copying) — a
    // re-record replaces the file instead of adding a timestamped sibling forever. Downloaded
    // roommate voices will get `voice_<memberId>.caf` the same way.
    const name = 'voice_me.caf';
    await AlarmKitModule.saveSoundToAppGroup(path, name);
    return name;
  } catch {
    // Losing the copy costs the voice, not the alarm: it falls back to the system sound.
    return null;
  }
}

/**
 * What the device did with an alarm. The app used to throw this away, which meant a refused alarm
 * left the switch on and the person woke up late believing the app had them covered — the one
 * failure an alarm clock cannot have.
 */
export type AlarmSyncResult =
  | { ok: true; nativeAlarmId: string | null }
  | { ok: false; reason: 'denied' | 'unavailable' | 'failed'; detail: string };

/**
 * AlarmKit refuses to schedule until the user has allowed alarms, and asking is the app's job —
 * nothing else in the system prompts for it. Asked here, at the moment an alarm is actually being
 * set, which is the only point the request makes sense to the person answering it.
 */
export async function alarmAuthorization(): Promise<'authorized' | 'denied' | 'unavailable'> {
  // Both calls reach AlarmKit, which is absent below iOS 26 and on the simulator. A throw here used
  // to escape as an unhandled rejection and the caller saw nothing at all — no alarm, no message.
  try {
    if (AlarmKitModule.getAuthorizationState() === 'authorized') return 'authorized';
    return (await AlarmKitModule.requestAuthorization()) === 'authorized' ? 'authorized' : 'denied';
  } catch {
    return 'unavailable';
  }
}

async function schedule(
  nativeAlarmId: string | null,
  s: AlarmSchedule,
  title: string,
  /** Null uses AlarmKit's own alert sound. */
  soundFilename: string | null
): Promise<AlarmSyncResult> {
  if (!s.enabled) {
    await cancelNativeAlarm(nativeAlarmId);
    return { ok: true, nativeAlarmId: null };
  }

  // Guard the native boundary: a malformed time would send NaN into an Int? field and crash the
  // app inside ExpoModulesCore's number cast. See lib/time.ts.
  const parsed = parseAlarmTime(s.time);
  if (!parsed) return { ok: false, reason: 'failed', detail: `Bad time: ${JSON.stringify(s.time)}` };

  const auth = await alarmAuthorization();
  if (auth !== 'authorized') {
    return {
      ok: false,
      reason: auth,
      detail: auth === 'denied' ? 'Alarm permission is off.' : 'AlarmKit is not available here.',
    };
  }

  const params = {
    hour: parsed.hour,
    minute: parsed.minute,
    daysBitmask: s.days,
    title,
    ...(soundFilename ? { soundFilename } : {}),
    snoozeMinutes: s.snoozeEnabled ? s.snoozeMinutes : 0,
  };

  try {
    const id = await AlarmKitModule.scheduleDailyAlarm({ ...params, alarmId: nativeAlarmId ?? undefined });
    return { ok: true, nativeAlarmId: id };
  } catch (e) {
    // Re-scheduling an id AlarmKit no longer knows throws, and the app stores that id forever — so
    // one lost alarm (a reinstall, or the alarm deleted from the system) would silently stop every
    // future alarm from being set. Start a fresh one instead of staying broken.
    if (!nativeAlarmId) {
      return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) };
    }
    try {
      const id = await AlarmKitModule.scheduleDailyAlarm(params);
      return { ok: true, nativeAlarmId: id };
    } catch (retry) {
      return { ok: false, reason: 'failed', detail: retry instanceof Error ? retry.message : String(retry) };
    }
  }
}

/**
 * Schedules this device's alarm for a room.
 *
 * The random pick happens here, at scheduling time, because AlarmKit needs a concrete filename up
 * front — it cannot ask the app for a sound when the alarm fires. Re-scheduling (any edit) is
 * therefore what re-rolls which roommate wakes you. Making it a genuinely different friend each
 * morning needs the server to fix tomorrow's voice ahead of time; see `docs/MVP.md`.
 *
 * A room with no usable voice still schedules, with a bundled seed sound — an alarm that fails to
 * ring is the one unacceptable outcome.
 */
export async function syncRoomAlarm(room: Room, myId: string): Promise<AlarmSyncResult> {
  const mine = myAlarmIn(room, myId);
  // No schedule of my own in this room means nothing should ring for me, whatever the others set.
  if (!mine) {
    await cancelNativeAlarm(room.nativeAlarmId);
    return { ok: true, nativeAlarmId: null };
  }
  // Only a voice whose file is on this device can ring; everyone else falls back to the system
  // sound rather than to a filename that would make the whole alarm fail. Blocked members are
  // never picked — that is what blocking means here.
  const { blockedIds } = await store.getState();
  const picked = pickVoiceFor(room, myId, blockedIds);
  return schedule(room.nativeAlarmId, mine, room.name, picked?.voiceSoundName ?? null);
}

/** Personal alarms have no room and no roommate to borrow a voice from — system sound. */
export async function syncPersonalAlarm(alarm: PersonalAlarm): Promise<AlarmSyncResult> {
  return schedule(alarm.nativeAlarmId, alarm, alarm.label || '알람', null);
}

/**
 * Cancels every system alarm this app owns that no room or personal alarm points at.
 *
 * The app can only cancel ids it has stored, so anything it loses track of keeps ringing with
 * nothing able to stop it — a crash between scheduling and saving the id, a reinstall over an old
 * install, or a debug build that scheduled directly. Those alarms belong to nobody and are
 * unreachable from any screen.
 *
 * Run at launch. Returns how many it removed.
 */
export async function cancelOrphanedAlarms(state: AppState): Promise<number> {
  let live: string[];
  try {
    live = AlarmKitModule.listAlarmIds();
  } catch {
    return 0;
  }

  const owned = new Set(
    [...state.rooms.map((r) => r.nativeAlarmId), ...state.personalAlarms.map((a) => a.nativeAlarmId)].filter(
      (id): id is string => !!id
    )
  );

  const orphans = live.filter((id) => !owned.has(id));
  for (const id of orphans) await cancelNativeAlarm(id);
  return orphans.length;
}

export async function cancelNativeAlarm(nativeAlarmId: string | null): Promise<void> {
  if (!nativeAlarmId) return;
  await AlarmKitModule.cancelAlarm(nativeAlarmId).catch(() => {});
}

/**
 * The only way a room's alarm changes: write it, hand it to AlarmKit, and put the write back if the
 * device refused. Screens must not do these three steps themselves — that is how the rollback gets
 * forgotten in one of them and the app starts showing alarms that do not exist.
 */
export async function commitRoomAlarm(
  room: Room,
  patch: Partial<AlarmSchedule>,
  myId: string
): Promise<AlarmSyncResult> {
  const before = myAlarmIn(room, myId);
  const updated = await store.updateMyAlarm(room.id, myId, patch);
  if (!updated) return { ok: false, reason: 'failed', detail: 'That room is gone.' };

  const result = await syncRoomAlarm(updated, myId);
  if (result.ok) await store.updateRoom(room.id, { nativeAlarmId: result.nativeAlarmId });
  else if (before) await store.updateMyAlarm(room.id, myId, before);
  return result;
}

/**
 * Turning one weekday on or off. The store decides the new schedule inside its own queue, so two
 * swipes in quick succession both land instead of the second overwriting the first with what it
 * read a moment earlier.
 */
export async function commitWeekdayToggle(
  roomId: string,
  weekday: number,
  myId: string
): Promise<AlarmSyncResult> {
  const applied = await store.toggleMyWeekday(roomId, myId, weekday);
  if (!applied) return { ok: false, reason: 'failed', detail: 'That room is gone.' };

  const result = await syncRoomAlarm(applied.room, myId);
  if (result.ok) await store.updateRoom(roomId, { nativeAlarmId: result.nativeAlarmId });
  else if (applied.before) await store.updateMyAlarm(roomId, myId, applied.before);
  return result;
}

/** The personal-alarm counterpart of commitRoomAlarm, with the same rollback. */
export async function commitPersonalAlarm(
  alarm: PersonalAlarm,
  patch: Partial<PersonalAlarm>
): Promise<AlarmSyncResult> {
  const updated = await store.updatePersonalAlarm(alarm.id, patch);
  if (!updated) return { ok: false, reason: 'failed', detail: 'That alarm is gone.' };

  const result = await syncPersonalAlarm(updated);
  if (result.ok) await store.updatePersonalAlarm(alarm.id, { nativeAlarmId: result.nativeAlarmId });
  else await store.updatePersonalAlarm(alarm.id, alarm);
  return result;
}

/**
 * Says so when the device did not take the alarm. One message for every screen: a refusal that is
 * loud in one place and silent in another is worse than either.
 */
export function reportAlarmFailure(result: AlarmSyncResult): void {
  if (result.ok) return;

  if (result.reason === 'unavailable') {
    Alert.alert(
      '이 기기에서는 알람이 울리지 않아요',
      '알람은 iOS 26 실기기에서만 울려요. 다른 기능은 그대로 쓸 수 있지만, 실제로 울리지는 않아요.'
    );
    return;
  }

  if (result.reason === 'denied') {
    Alert.alert('알람 권한이 꺼져 있어요', 'iOS 설정에서 알람을 허용한 뒤, 알람을 다시 설정해요.', [
      { text: '나중에', style: 'cancel' },
      { text: '설정 열기', onPress: () => void Linking.openSettings() },
    ]);
    return;
  }

  Alert.alert('알람이 설정되지 않았어요', `기기가 알람을 거부해서 울리지 않아요.\n\n${result.detail}`);
}
