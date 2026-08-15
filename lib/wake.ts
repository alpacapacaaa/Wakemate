import { myAlarmIn, ringsOnWeekday, today, type AppState, type Room } from './model';
import { parseAlarmTime } from './time';
import { todayWeekday } from './week';

/**
 * How long after a ring the morning is still treated as unfinished. Long enough to survive putting
 * the phone down after silencing it from the lock screen, short enough that opening the app at
 * lunchtime does not drag you back to the wake-up screen.
 */
export const RING_WINDOW_MINUTES = 60;

/**
 * The room whose alarm has just rung and that I have not confirmed waking for, or null.
 *
 * AlarmKit rings and is silenced entirely outside the app — on the lock screen, with the app not
 * running — so the app can only find out by looking, on launch and on every return to the
 * foreground. Nothing else reaches the wake-up screen, and `store.recordWake` is only called there,
 * so without this check the morning log never gains a real entry and the deck stays fiction.
 */
export function pendingWakeRoom(state: AppState, rooms: Room[], now = new Date()): Room | null {
  const dayIdx = todayWeekday();
  const date = today();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const room of rooms) {
    const mine = myAlarmIn(room, state.me.id);
    if (!ringsOnWeekday(mine, dayIdx)) continue;

    const parsed = parseAlarmTime(mine!.time);
    if (!parsed) continue;

    const sinceRing = nowMinutes - (parsed.hour * 60 + parsed.minute);
    if (sinceRing < 0 || sinceRing > RING_WINDOW_MINUTES) continue;

    const alreadyUp = state.wakeRecords.some(
      (w) => w.roomId === room.id && w.date === date && w.memberId === state.me.id
    );
    if (!alreadyUp) return room;
  }

  return null;
}
