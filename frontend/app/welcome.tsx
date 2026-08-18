import { useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Sticker } from '../components/Sticker';
import { Body, Button, Display, Screen } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { useAppState } from '../lib/app-state';
import { store } from '../lib/store';
import { cardColorAt, colors, radius, spacing, type } from '../lib/theme';

/** Name, then voice, then a room — the three things the app is useless without. */
const STEPS = ['name', 'voice', 'room', 'done'] as const;
type Step = (typeof STEPS)[number];

/**
 * The first run.
 *
 * Before this, a new install seeded eight fictional rooms and never asked for anything, so nobody
 * was ever told the one thing the app is about: your voice is what wakes somebody. The recording
 * screen existed and could only be reached by going looking for it.
 *
 * Which step shows is derived from state rather than kept in a counter, so quitting halfway and
 * coming back resumes where it left off. Every step can be skipped — someone who wants to look
 * around first should be allowed to, and the deck's empty state already asks for a room.
 */
export default function WelcomeScreen() {
  const { ready, state, rooms, mutate } = useAppState();
  const [name, setName] = useState('');
  const player = useAudioPlayer(state?.me.voiceUri ?? undefined);

  if (!ready || !state) return <Screen />;

  const named = state.me.name.trim().length > 0 && state.me.name !== 'You';
  const recorded = !!state.me.voiceUri;
  const joined = rooms.length > 0;

  const step: Step = !named ? 'name' : !recorded ? 'voice' : !joined ? 'room' : 'done';
  const index = STEPS.indexOf(step);

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await mutate(() => store.setMyName(trimmed));
  }

  async function finish() {
    await mutate(() => store.completeOnboarding());
    router.replace('/');
  }

  return (
    <Screen>
      <View style={styles.body}>
        {/* One bar per step, filling with the deck's own colours — the week you are about to see. */}
        <View style={styles.progress}>
          {STEPS.slice(0, 3).map((s, i) => (
            <View
              key={s}
              style={[
                styles.tick,
                { backgroundColor: i <= index ? cardColorAt(i * 2).base : colors.line },
              ]}
            />
          ))}
        </View>

        {step === 'name' && (
          <>
            <View style={styles.headline}>
              <Display kr>먼저,{'\n'}이름부터</Display>
              <Body muted>친구가 내 목소리에 깰 때 보이는 이름이에요.</Body>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="이름"
              placeholderTextColor={colors.lineStrong}
              style={styles.input}
              autoFocus
              returnKeyType="done"
              maxLength={40}
              onSubmitEditing={() => void saveName()}
            />
          </>
        )}

        {step === 'voice' && (
          <>
            <View style={styles.headline}>
              <Display kr>다음은,{'\n'}목소리</Display>
              <Body muted>
                5–10초면 돼요. 친구는 알람음 대신 이 목소리에 깨요 — 나는 친구 목소리에 깨고요.
              </Body>
            </View>
            <View style={styles.card}>
              <Waveform festive seed="welcome" height={72} bars={40} amplitude={0.45} />
              <Sticker label="say hi!" color={cardColorAt(5).base} rotate={-5} style={styles.sticker} />
            </View>
          </>
        )}

        {step === 'room' && (
          <>
            <View style={styles.headline}>
              <Display kr>마지막,{'\n'}같이 깰 사람들</Display>
              <Body muted>방은 누구와 함께 일어나느냐예요. 시간은 각자 자기 걸 정해요.</Body>
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.headline}>
              <Display kr>준비{'\n'}끝</Display>
              <Body muted>
                {recorded
                  ? `${rooms[0].name} 방이 덱에 올라왔어요. 요일 카드를 옆으로 밀면 그 아침을 끌 수 있어요.`
                  : `${rooms[0].name} 방이 덱에 올라왔어요. 목소리는 언제든 녹음하면 돼요 — 그 전까지는 기본음으로 울려요.`}
              </Body>
            </View>
            {recorded && (
              <View style={styles.card}>
                <Waveform festive seed={state.me.id} height={72} bars={40} />
                <Text style={styles.cardNote}>누군가를 깨울 내 목소리.</Text>
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.footer}>
        {step === 'name' && (
          <Button label="다음" variant="primary" disabled={!name.trim()} onPress={() => void saveName()} />
        )}

        {step === 'voice' && (
          <>
            <Button label="내 목소리 녹음" variant="primary" onPress={() => router.push('/record')} />
            <Button label="나중에" variant="quiet" onPress={() => void finish()} />
          </>
        )}

        {step === 'room' && (
          <>
            <Button label="방 만들기" variant="primary" onPress={() => router.push('/room/new')} />
            <Button label="코드로 참여" variant="secondary" onPress={() => router.push('/room/join')} />
            <Button label="나중에" variant="quiet" onPress={() => void finish()} />
          </>
        )}

        {step === 'done' && (
          <>
            {recorded && <Button label="들어보기" variant="quiet" onPress={() => player.play()} />}
            <Button label="시작하기" variant="primary" onPress={() => void finish()} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.xl },

  progress: { flexDirection: 'row', gap: spacing.sm },
  tick: { flex: 1, height: 5, borderRadius: 3 },

  headline: { gap: spacing.sm },
  // headingKr, not heading: names typed here are usually Korean, and Figtree has no Hangul.
  input: {
    ...type.headingKr,
    fontSize: 26,
    color: colors.ink,
    backgroundColor: colors.paperLight,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  card: {
    backgroundColor: colors.paperLight,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  cardNote: { ...type.caption, color: colors.inkSoft, textAlign: 'center' },
  sticker: { position: 'absolute', top: -12, right: spacing.lg },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
});
