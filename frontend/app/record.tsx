import { useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Sticker } from '../components/Sticker';
import { Banner, Body, Button, Display, RoundButton, Screen } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { saveVoiceAsAlarmSound } from '../lib/alarm';
import { useAppState } from '../lib/app-state';
import { store } from '../lib/store';
import { CARD_COLORS, colors, radius, spacing, type } from '../lib/theme';
import { MAX_SECONDS, MIN_SECONDS, useVoiceRecorder } from '../lib/use-voice-recorder';

export default function RecordScreen() {
  const { mutate } = useAppState();
  const rec = useVoiceRecorder();
  const player = useAudioPlayer(rec.recordedUri ?? undefined);

  async function stopRecording() {
    const take = await rec.stop();
    if (!take) Alert.alert('A little longer', `It needs at least ${MIN_SECONDS} seconds.`);
  }

  async function save() {
    if (!rec.recordedUri) return;
    const soundName = await saveVoiceAsAlarmSound(rec.recordedUri!);
    await mutate(() => store.setMyVoice(rec.recordedUri!, rec.recordedMs, soundName));
    router.back();
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="Close" size={38} onPress={() => router.back()} />
      </View>

      <View style={styles.body}>
        <View style={styles.headline}>
          <Display>Say good{'\n'}morning</Display>
          <Body muted>
            {MIN_SECONDS}–{MAX_SECONDS} seconds. It plays as the alarm for a random friend in your
            rooms.
          </Body>
        </View>

        {rec.permissionDenied ? (
          <Banner
            tone="warn"
            text="Microphone access is off. Enable it in Settings › Privacy › Microphone, then come back."
          />
        ) : (
          /* The voice as a sticker: a slightly crooked pastel card, the take drawn in deck colours
             across it. This is the one emotional screen, so it gets the one crooked thing. */
          <View style={styles.stickerWrap}>
            <View style={styles.stickerCard}>
              <Waveform
                festive
                seed={rec.recordedUri ?? 'recording'}
                progress={
                  rec.isRecording || rec.recordedUri ? Math.min(rec.elapsed / MAX_SECONDS, 1) : undefined
                }
                height={96}
                bars={40}
                amplitude={rec.isRecording || rec.recordedUri ? 1 : 0.4}
              />
              <View style={styles.counterPill}>
                <Text style={styles.counter}>
                  {rec.isRecording
                    ? `${rec.elapsed.toFixed(1)}s`
                    : rec.recordedUri
                      ? `${(rec.recordedMs / 1000).toFixed(1)}s · saved to your sticker`
                      : `press record, say hi`}
                </Text>
              </View>
            </View>
            <Sticker
              label={rec.isRecording ? 'listening…' : rec.recordedUri ? 'so cute!' : 'ring ring!'}
              color={CARD_COLORS[5].base}
              rotate={8}
              style={styles.stickerBadge}
            />
          </View>
        )}
      </View>

      {!rec.permissionDenied && (
        <View style={styles.footer}>
          {rec.isRecording ? (
            <Button
              label={rec.reachedMinimum ? 'Stop here' : `Keep going to ${MIN_SECONDS}s`}
              variant={rec.reachedMinimum ? 'primary' : 'secondary'}
              onPress={() => void stopRecording()}
            />
          ) : rec.recordedUri ? (
            <>
              <Button label="Save this voice" variant="primary" onPress={() => void save()} />
              <View style={styles.quietRow}>
                <Button label="Listen" variant="quiet" onPress={() => player.play()} />
                <Button label="Try again" variant="quiet" onPress={() => void rec.start()} />
              </View>
            </>
          ) : (
            <Button label="Start recording" variant="primary" onPress={() => void rec.start()} />
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  body: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.xxl, paddingTop: spacing.md },
  headline: { gap: spacing.sm },

  stickerWrap: { paddingTop: spacing.md },
  stickerCard: {
    backgroundColor: CARD_COLORS[6].tint,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.lg,
    transform: [{ rotate: '-1.5deg' }],
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  counterPill: {
    alignSelf: 'center',
    backgroundColor: colors.paperLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  counter: { ...type.label, fontSize: 13, color: colors.ink, textAlign: 'center' },
  stickerBadge: { position: 'absolute', top: 0, right: spacing.sm },

  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  quietRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
});
