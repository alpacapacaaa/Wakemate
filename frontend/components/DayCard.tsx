import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, tabular, type, type CardColor } from '../lib/theme';

/** Height of a card in the deck. Its bottom `radius.card` is covered by the card below. */
export const CARD_H = 120;

/** How far a card has to travel before the swipe counts as a toggle. */
const TOGGLE_AT = 64;
/** The card stops moving past this, so a long drag does not tear it off the deck. */
const MAX_SLIDE = 96;
/** Days in the deck — a dragged card lifts above all of them. */
const DAY_COUNT = 7;

/**
 * One day in the deck.
 *
 * Dragging it sideways turns that morning off — the fastest possible "not tomorrow", without
 * opening the day or hunting for a switch. Either direction does the same thing: at this size the
 * card is a single object, and making left and right mean different things would only make people
 * pause to remember which.
 *
 * Off is drawn as a pale grey card rather than a faded colour one, because the deck's colours are
 * identity: a washed-out green still reads as "Monday's colour, badly rendered", where grey reads
 * as "off".
 */
export function DayCard({
  dayName,
  index,
  color,
  isLast,
  isToday,
  time,
  on,
  onOpen,
  onToggle,
}: {
  dayName: string;
  /** Position in the deck, which is also its resting stacking order. */
  index: number;
  color: CardColor;
  isLast: boolean;
  isToday: boolean;
  /** My wake-up time for this day, or null if I have no schedule in this room at all. */
  time: string | null;
  on: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);

  // The PanResponder below is built once and keeps whatever callback it was created with, so it
  // must not close over `onToggle` directly: it would go on calling the very first render's
  // handler, computing every swipe from the schedule as it looked when the deck first appeared.
  const toggleRef = useRef(onToggle);
  toggleRef.current = onToggle;

  const pan = useRef(
    PanResponder.create({
      // Claim the gesture only once it is clearly horizontal, so the deck still scrolls.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderGrant: () => setDragging(true),
      onPanResponderMove: (_, g) => {
        const clamped = Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, g.dx));
        slide.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > TOGGLE_AT) toggleRef.current();
        setDragging(false);
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        setDragging(false);
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        // The deck's own stacking: each card overlaps the one above by its corner radius, and later
        // cards sit on top. A card being dragged is lifted clear of both, so it slides as one object
        // instead of disappearing under its neighbours.
        { zIndex: dragging ? DAY_COUNT + 1 : index, marginTop: index > 0 ? -radius.card : 0 },
        dragging && styles.lifted,
        { transform: [{ translateX: slide }] },
      ]}
      {...pan.panHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${dayName}${time ? `, ${time}` : ''}${on ? '' : ', alarm off'}${isToday ? ', today' : ''}`}
        accessibilityHint="Swipe sideways to turn this morning off"
        onPress={onOpen}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: on ? color.base : colors.cardOff },
          isLast && styles.lastCard,
          isToday && (on ? styles.todayOn : styles.todayOff),
          pressed && styles.pressed,
        ]}>
        <View style={[styles.label, !on && styles.off]}>
          <Text style={styles.name} numberOfLines={1}>
            {dayName}
          </Text>
          {time && (
            <Text style={[styles.time, tabular]} numberOfLines={1}>
              {time}
            </Text>
          )}
        </View>
        <View style={[styles.arrow, !on && styles.off]}>
          <Text style={styles.arrowGlyph}>↗</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Every card carries the outline, transparent unless it is today's — otherwise today's text
    // would sit a few pixels further in than the rest of the week.
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingLeft: 28,
    paddingRight: 20,
    height: CARD_H,
    paddingBottom: radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  lastCard: { height: 168, alignItems: 'flex-start', paddingTop: 24, paddingBottom: 0 },
  /**
   * Today wears a thin outline — the same off-white as the arrow circles, which reads cleanly on
   * all seven colours. It vanishes on the pale grey of a day that is switched off, so that one case
   * takes ink instead; either way today is always marked.
   *
   * Its bottom edge sits under the next card, so this reads as a top and sides, not a full box.
   */
  todayOn: { borderColor: colors.paperLight },
  todayOff: { borderColor: colors.ink },
  pressed: { opacity: 0.88 },
  /** Only while dragging, so the deck stays flat at rest. */
  lifted: {
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  off: { opacity: 0.42 },

  label: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  name: { ...type.heading, fontSize: 25, color: colors.ink, flexShrink: 1 },
  time: { ...type.body, fontSize: 15, color: colors.ink, opacity: 0.55 },

  arrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.paperLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGlyph: { fontSize: 16, color: colors.ink, includeFontPadding: false },
});
