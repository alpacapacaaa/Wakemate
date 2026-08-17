import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CARD_COLORS, colors } from '../lib/theme';

/**
 * The app's one ornament, and it does real work.
 *
 * Every piece of content here is a 5–10 second voice clip, so its own shape is the motif. The same
 * component is the section rule on the home screen, the level meter while recording, and the
 * playback progress on the wake screen — one form, three jobs, instead of three unrelated widgets.
 *
 * Bars are derived deterministically from `seed`, so a given day's voice always draws the same
 * figure: the rule under "내일 아침" genuinely differs from the one under "오늘 아침" rather than
 * being decorative noise.
 */
type Props = {
  /** Any stable string — assignment date, filename. Same seed ⇒ same figure. */
  seed?: string;
  /** 0–1. Bars up to this point are drawn in `tone`; the rest stay as unfilled line. */
  progress?: number;
  height?: number;
  bars?: number;
  tone?: 'signal' | 'text' | 'muted';
  /** Scales every bar — used by the recorder so the figure grows as the take gets longer. */
  amplitude?: number;
  /** Colour bars from the deck palette instead of ink — the kitsch voice, for the record screen. */
  festive?: boolean;
};

function makeBars(seed: string, count: number): number[] {
  // FNV-1a, then a small LCG — enough spread for a figure, and stable across renders/devices.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  return Array.from({ length: count }, (_, i) => {
    // An utterance rises and falls; pure noise reads as static. The envelope keeps it legible
    // as *speech* rather than as a generic audio squiggle.
    const envelope = Math.sin((Math.PI * (i + 0.5)) / count) ** 0.6;
    return 0.14 + next() * 0.86 * envelope;
  });
}

export function Waveform({
  seed = 'voice',
  progress,
  height = 34,
  bars = 42,
  tone = 'text',
  amplitude = 1,
  festive = false,
}: Props) {
  const values = useMemo(() => makeBars(seed, bars), [seed, bars]);
  const filledUpTo = progress == null ? bars : Math.round(progress * bars);
  const activeColor = tone === 'signal' ? colors.ink : tone === 'muted' ? colors.lineStrong : colors.ink;

  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            marginHorizontal: 1,
            borderRadius: 1,
            height: Math.max(2, v * height * amplitude),
            backgroundColor:
              i < filledUpTo
                ? festive
                  ? CARD_COLORS[i % CARD_COLORS.length].base
                  : activeColor
                : colors.line,
            // Unprogressed figures are rules, not content — they sit well back.
            opacity: progress == null ? 0.7 : 1,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
});
