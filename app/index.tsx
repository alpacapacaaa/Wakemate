import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DayCard } from '../components/DayCard';
import { RoomPicker } from '../components/RoomPicker';
import { Body, Button, Display, Screen } from '../components/ui';
import { commitWeekdayToggle, reportAlarmFailure } from '../lib/alarm';
import { useAppState } from '../lib/app-state';
import { myAlarmIn, today } from '../lib/model';
import { cardColorAt, colors, radius, spacing, type } from '../lib/theme';
import { pendingWakeRoom } from '../lib/wake';
import { DAY_NAMES, todayWeekday } from '../lib/week';

/**
 * The deck is the week itself — seven cards, seven colours, always full no matter how many rooms
 * exist. That is what lets the reference layout survive contact with real data: a deck of rooms
 * goes sparse at two rooms, but every week has seven mornings.
 *
 * Tapping a day opens it as its own screen (room/[id]/day/[weekday]), flooded in that day's colour;
 * swiping one sideways turns that morning off. The deck never rearranges either way.
 *
 * Cards overlap by `radius.card` so each rounded top reveals the colour of the card above — the
 * card's own geometry lives in components/DayCard.
 */
export default function WeekScreen() {
  const { ready, state, rooms, mutate } = useAppState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  // One trip to the wake-up screen per morning per room: the check re-runs on every state change,
  // and without this it would push again the moment anything else saved.
  const sentTo = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !state) return;

    function check() {
      const room = pendingWakeRoom(state!, rooms);
      if (!room) return;
      const morning = `${room.id}:${today()}`;
      if (sentTo.current === morning) return;
      sentTo.current = morning;
      router.push({ pathname: '/ring/[roomId]', params: { roomId: room.id } });
    }

    check();
    // The alarm is silenced outside the app, so coming back to the foreground is the moment the
    // app gets to notice the morning happened.
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [ready, state, rooms]);

  if (!ready || !state) return <Screen />;

  // The deck shows one room's week. Falls back to the first room so the screen is never empty
  // just because nothing has been picked yet.
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0] ?? null;
  const tailColor = cardColorAt(DAY_NAMES.length - 1).base;
  const mine = room ? myAlarmIn(room, state.me.id) : null;
  const nowDay = todayWeekday();

  /** Swiping a card flips that weekday in my own schedule — the same bit the day screen's switch owns. */
  async function toggleDay(roomId: string, dayIdx: number) {
    const result = await mutate(() => commitWeekdayToggle(roomId, dayIdx, state!.me.id));
    reportAlarmFailure(result);
  }

  return (
    <Screen>
      {/* The last card's colour continues behind the deck, so bouncing past the end reveals more
          pink rather than a strip of bare page. */}
      {rooms.length > 0 && <View pointerEvents="none" style={[styles.tail, { backgroundColor: tailColor }]} />}

      <RoomPicker
        visible={pickerOpen}
        rooms={rooms}
        selectedId={room?.id ?? null}
        myId={state.me.id}
        onSelect={(id) => {
          setRoomId(id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={room ? `${room.name}, switch room` : 'Rooms'}
          disabled={rooms.length === 0}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [styles.datePill, pressed && styles.pillPressed]}>
          <Text style={styles.datePillText} numberOfLines={1}>
            {room ? `${room.name} ▾` : 'No rooms'}
          </Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New room"
            hitSlop={10}
            onPress={() => router.push('/room/new')}
            style={({ pressed }) => pressed && styles.pillPressed}>
            <SymbolView name="plus.circle" tintColor={colors.ink} size={26} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Join a room"
            hitSlop={10}
            onPress={() => router.push('/room/join')}
            style={({ pressed }) => pressed && styles.pillPressed}>
            <SymbolView name="door.left.hand.open" tintColor={colors.ink} size={26} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={10}
            onPress={() => router.push('/settings')}>
            <View style={styles.burger}>
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
            </View>
          </Pressable>
        </View>
      </View>

      {rooms.length === 0 || !room ? (
        <View style={styles.empty}>
          <Display>Nothing{'\n'}here yet</Display>
          <Body muted>Create a room and your friends will wake you with their voices.</Body>
          <View style={styles.emptyActions}>
            <Button label="Create a room" variant="primary" onPress={() => router.push('/room/new')} />
            <Button label="Join with a code" variant="quiet" onPress={() => router.push('/room/join')} />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headline}>
            <Display>Who wakes{'\n'}you this week?</Display>
          </View>

          {/* Cream under the cards: the pink tail is only meant to show past the end of the deck,
              and without this a card sliding sideways uncovers it mid-week. */}
          <View style={styles.deck}>
            {DAY_NAMES.map((dayName, i) => (
                <DayCard
                  key={dayName}
                  dayName={dayName}
                  index={i}
                  color={cardColorAt(i)}
                  isLast={i === DAY_NAMES.length - 1}
                  isToday={i === nowDay}
                  time={mine ? mine.time : null}
                  on={!!mine?.enabled && ((mine.days >> i) & 1) === 1}
                  onOpen={() =>
                    router.push({
                      pathname: '/room/[id]/day/[weekday]',
                      params: { id: room.id, weekday: i },
                    })
                  }
                  onToggle={() => void toggleDay(room.id, i)}
                />
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    height: 52,
  },
  datePill: {
    backgroundColor: colors.paperLight,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillPressed: { opacity: 0.7 },
  datePillText: { ...type.eyebrow, fontSize: 14, color: colors.ink, maxWidth: 220 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  burger: { gap: 4, paddingVertical: 4 },
  burgerLine: { width: 22, height: 2.5, borderRadius: 2, backgroundColor: colors.ink },

  content: { paddingTop: spacing.sm, paddingBottom: 0 },
  tail: { position: 'absolute', left: 0, right: 0, top: '55%', bottom: 0 },
  headline: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  emptyActions: { gap: spacing.sm, paddingTop: spacing.md },

  deck: { backgroundColor: colors.paper },
});
