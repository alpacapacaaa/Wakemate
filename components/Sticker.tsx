import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '../lib/theme';

/**
 * A tilted label, like something peeled off a sheet and pressed on slightly crooked — the kitsch
 * note the reference's world runs on. One per screen: a single crooked thing against everything
 * straight reads as charm, three read as a mess.
 */
export function Sticker({
  label,
  color = colors.paperLight,
  ink = colors.ink,
  rotate = -6,
  style,
}: {
  label: string;
  color?: string;
  ink?: string;
  rotate?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      pointerEvents="none"
      style={[styles.base, { backgroundColor: color, transform: [{ rotate: `${rotate}deg` }] }, style]}>
      <Text style={[styles.label, { color: ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  label: { fontFamily: fonts.latin, fontSize: 13, letterSpacing: 0.2 },
});
