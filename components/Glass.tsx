import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '../lib/theme';

/**
 * Liquid-glass surface, iOS-style: a real blur of whatever sits behind it, warmed with a milky
 * overlay and rimmed with a light border so the edge catches like glass.
 *
 * Glass only reads as glass when there is something to refract — on a flat cream page it just
 * looks grey. Screens using this put soft colour behind it first (see Blobs below), the way iOS
 * glass always sits over wallpaper.
 *
 * Shadow lives on an outer wrapper because the inner view must clip the blur (overflow hidden),
 * and iOS drops shadows on clipped views.
 */
export function GlassCard({
  children,
  style,
  contentStyle,
  radius = 26,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  radius?: number;
}) {
  return (
    <View style={[styles.shadow, style]}>
      <View style={[styles.clip, { borderRadius: radius }]}>
        <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.overlay} />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

/** Soft out-of-focus colour fields for glass to refract. Position via `style`. */
export function Blob({ color, size, style }: { color: string; size: number; style?: ViewStyle }) {
  return (
    <View
      pointerEvents="none"
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.55 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  clip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,252,245,0.4)',
  },
});
