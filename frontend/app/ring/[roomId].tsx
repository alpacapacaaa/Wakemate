import { useAudioPlayer } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../../components/Glass';
import { Button, Screen } from '../../components/ui';
import { useAppState } from '../../lib/app-state';
import { today } from '../../lib/model';
import { pickVoiceFor, store } from '../../lib/store';
import { cardColorAt, colors, spacing, tabular, type } from '../../lib/theme';

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The wake-up moment, after the system alarm is stopped and the app opens. The room's own colour
 * floods the screen and the content sits on liquid glass over it — the iOS-alarm feel the rest of
 * the app's flat cards deliberately avoid, reserved for the one moment that is actually about
 * waking up. Confirming writes the wake record that fills the morning log.
 */
export default function RingScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { rooms, state, mutate } = useAppState();

  const index = useMemo(() => rooms.findIndex((r) => r.id === roomId), [rooms, roomId]);
  const room = index >= 0 ? rooms[index] : null;
  const color = cardColorAt(Math.max(index, 0));

  // Re-rolled for the in-app replay; matching the voice that actually rang needs the server to own
  // the pick, per (room, member, date) — `docs/MVP.md`.
  const [speaker] = useState(() => pickVoiceFor(room, state?.me.id ?? ''));
  const [revealed, setRevealed] = useState(false);
  const [recorded, setRecorded] = useState(false);

  const player = useAudioPlayer(speaker?.voiceUri ?? undefined);

  async function wakeUp() {
    if (room && state && !recorded) {
      setRecorded(true);
      await mutate(() =>
        store.recordWake({
          roomId: room.id,
          date: today(),
          memberId: state.me.id,
          wokeAt: new Date().toISOString(),
          wokenByMemberId: speaker?.id ?? null,
        })
      );
    }
    router.replace('/');
  }

  return (
    <Screen style={{ ...styles.screen, backgroundColor: color.base }}>
      <View style={styles.top}>
        <Text style={styles.clock}>{nowHHMM()}</Text>
        <Text style={styles.headline}>Good{'\n'}morning!</Text>
        {room && <Text style={styles.room}>{room.name}</Text>}
      </View>

      <View style={styles.middle}>
        <GlassCard contentStyle={styles.glassContent}>
          {speaker ? (
            <>
              <Text style={styles.whoLabel}>WOKEN BY</Text>
              <Text style={styles.who}>{revealed ? speaker.name : '???'}</Text>
              <View style={styles.glassActions}>
                <Button label="Replay" variant="onCard" onPress={() => player.play()} />
                {!revealed && <Button label="Reveal" variant="onCard" onPress={() => setRevealed(true)} />}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.whoLabel}>THIS MORNING</Text>
              <Text style={styles.whoSmall}>Default sound — voices join in as friends record.</Text>
            </>
          )}
        </GlassCard>
      </View>

      <View style={styles.footer}>
        <Button label="I'm up" variant="primary" onPress={() => void wakeUp()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.sm },
  clock: { ...type.timeLg, ...tabular, fontSize: 64, color: colors.ink },
  headline: { ...type.display, color: colors.ink },
  room: { ...type.label, fontSize: 16, color: colors.ink, opacity: 0.75 },

  middle: { paddingHorizontal: spacing.lg },
  glassContent: { padding: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  whoLabel: { ...type.eyebrow, color: colors.inkSoft },
  who: { ...type.display, fontSize: 40, lineHeight: 46, color: colors.ink },
  whoSmall: { ...type.body, color: colors.ink, textAlign: 'center' },
  glassActions: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.sm },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
});
