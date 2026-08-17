import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '../lib/theme';

export function Screen({ children, style }: { children?: React.ReactNode; style?: ViewStyle }) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

/** Small pill marker, like the reference's "This week ▾". */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/** The chunky editorial headline the reference is built around. */
export function Display({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return <Text style={small ? styles.displaySm : styles.display}>{children}</Text>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <Text style={muted ? styles.caption : styles.body}>{children}</Text>;
}

/**
 * `primary` is the solid black pill — one per screen. `secondary` is an outline on cream, `quiet`
 * is plain text, `onCard` is a translucent white pill for use on top of a coloured card.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'onCard';
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        variant === 'danger' && styles.buttonDanger,
        variant === 'onCard' && styles.buttonOnCard,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.paper : colors.ink} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && styles.buttonLabelPrimary,
            variant === 'danger' && styles.buttonLabelDanger,
            variant === 'quiet' && styles.buttonLabelQuiet,
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Round icon-sized button — the ↗ on each card, the ← / → on the detail screen. */
export function RoundButton({
  glyph,
  onPress,
  size = 40,
  tone = 'cream',
  label,
}: {
  glyph: string;
  onPress: () => void;
  size?: number;
  tone?: 'cream' | 'ink';
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone === 'ink' ? colors.ink : colors.paper,
        },
        pressed && styles.buttonPressed,
      ]}>
      <Text style={[styles.roundGlyph, { color: tone === 'ink' ? colors.paper : colors.ink, fontSize: size * 0.42 }]}>
        {glyph}
      </Text>
    </Pressable>
  );
}

/** Soft pill row that sits inside a coloured card. */
export function PillRow({
  children,
  tint,
  style,
}: {
  children: React.ReactNode;
  tint: string;
  style?: ViewStyle;
}) {
  return <View style={[styles.pillRow, { backgroundColor: tint }, style]}>{children}</View>;
}

export function Banner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' }) {
  return (
    <View style={[styles.banner, tone === 'warn' && styles.bannerWarn]}>
      <Text style={[styles.bannerText, tone === 'warn' && styles.bannerTextWarn]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },

  eyebrow: { ...type.eyebrow, color: colors.inkSoft },
  display: { ...type.display, color: colors.ink },
  displaySm: { ...type.displaySm, color: colors.ink },
  heading: { ...type.heading, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  caption: { ...type.caption, color: colors.inkSoft },

  button: {
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonSecondary: { borderColor: colors.ink },
  buttonQuiet: { height: 44 },
  buttonDanger: { borderColor: colors.alert },
  buttonOnCard: { backgroundColor: 'rgba(255,255,255,0.75)' },
  buttonDisabled: { opacity: 0.35 },
  buttonPressed: { opacity: 0.65 },
  buttonLabel: { ...type.label, color: colors.ink },
  buttonLabelPrimary: { color: colors.paper },
  buttonLabelDanger: { color: colors.alert },
  buttonLabelQuiet: { color: colors.inkSoft },

  round: { alignItems: 'center', justifyContent: 'center' },
  roundGlyph: { fontWeight: '700', includeFontPadding: false },

  pillRow: {
    borderRadius: radius.pillRow,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },

  banner: { backgroundColor: colors.paperDeep, borderRadius: radius.md, padding: spacing.md },
  bannerWarn: { backgroundColor: '#f8e3df' },
  bannerText: { ...type.caption, color: colors.inkSoft },
  bannerTextWarn: { color: colors.alert },
});
