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
    if (!take) Alert.alert('조금만 더', `최소 ${MIN_SECONDS}초는 돼야 해요.`);
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
        <RoundButton glyph="✕" label="닫기" size={38} onPress={() => router.back()} />
      </View>

      <View style={styles.body}>
        <View style={styles.headline}>
          <Display kr>목소리로{'\n'}굿모닝</Display>
          <Body muted>
            {MIN_SECONDS}–{MAX_SECONDS}초. 방 친구 중 한 명이 알람 대신 이 소리에 깨요.
          </Body>
        </View>

        {rec.permissionDenied ? (
          <Banner tone="warn" text="마이크 접근이 꺼져 있어요. 설정 › 개인정보 보호 › 마이크에서 켠 뒤 다시 와요." />
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
                      ? `${(rec.recordedMs / 1000).toFixed(1)}초 · 잘 나왔어요`
                      : '녹음을 누르고, 한마디'}
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
              label={rec.reachedMinimum ? '여기까지' : `${MIN_SECONDS}초까지 이어서`}
              variant={rec.reachedMinimum ? 'primary' : 'secondary'}
              onPress={() => void stopRecording()}
            />
          ) : rec.recordedUri ? (
            <>
              <Button label="이 목소리로 저장" variant="primary" onPress={() => void save()} />
              <View style={styles.quietRow}>
                <Button label="들어보기" variant="quiet" onPress={() => player.play()} />
                <Button label="다시 녹음" variant="quiet" onPress={() => void rec.start()} />
              </View>
            </>
          ) : (
            <Button label="녹음 시작" variant="primary" onPress={() => void rec.start()} />
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
