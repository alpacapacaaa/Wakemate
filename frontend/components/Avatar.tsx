import { StyleSheet, Text, View } from 'react-native';

import { cardColorFor, fonts, colors, radius, type } from '../lib/theme';

/**
 * Identity mark for a room member.
 *
 * No photos: there is no account system to carry one, and a fake stock face would misrepresent a
 * real person. An initial on a colour derived from the member's id gives every face in the room a
 * stable, distinguishable identity, which is what the morning log needs to be readable at a glance.
 *
 * Colours come from the same deck palette the room cards use, so a room of eight people still
 * reads as one page rather than eight unrelated stickers.
 */
function colorFor(seed: string) {
  // Reuses the card deck's palette so a face never introduces a hue the page does not already
  // have. `deep` on `tint` keeps the initial legible on a card of any colour.
  const c = cardColorFor(seed);
  return { bg: c.tint, fg: c.deep };
}

/** Korean names read best by their last syllable; Latin ones by the first letter. */
function initial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return /[가-힣]/.test(trimmed) ? trimmed.slice(-1) : trimmed[0].toUpperCase();
}

export function Avatar({
  id,
  name,
  size = 40,
  dimmed,
  ring,
}: {
  id: string;
  name: string;
  size?: number;
  /** Members who have not woken yet sit back. */
  dimmed?: boolean;
  /** White ring, for avatars overlapping in a stack. */
  ring?: boolean;
}) {
  const c = colorFor(id);
  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.bg,
          opacity: dimmed ? 0.45 : 1,
          borderWidth: ring ? 2 : 0,
          borderColor: colors.paper,
        },
      ]}>
      <Text style={[styles.initial, { color: c.fg, fontSize: size * 0.42 }]}>{initial(name)}</Text>
    </View>
  );
}

/** Overlapping row of avatars, for showing a room's members compactly. */
export function AvatarStack({
  members,
  size = 28,
  max = 5,
}: {
  members: { id: string; name: string }[];
  size?: number;
  max?: number;
}) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((m, i) => (
        <View key={m.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar id={m.id} name={m.name} size={size} ring />
        </View>
      ))}
      {rest > 0 && (
        <View
          style={[
            styles.rest,
            { width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.3 },
          ]}>
          <Text style={[styles.restLabel, { fontSize: size * 0.34 }]}>+{rest}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: fonts.numeric, includeFontPadding: false },
  stack: { flexDirection: 'row', alignItems: 'center' },
  rest: {
    backgroundColor: colors.paperDeep,
    borderWidth: 2,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restLabel: { fontFamily: fonts.numeric, color: colors.inkSoft },
});
