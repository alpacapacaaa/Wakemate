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
              <Display>First,{'\n'}your name</Display>
              <Body muted>It is what your friends see when your voice wakes them.</Body>
            </View>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
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
              <Display>Now,{'\n'}your voice</Display>
              <Body muted>
                Five to ten seconds. A friend wakes up to this instead of to a beep — and you wake up
                to theirs.
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
              <Display>Last,{'\n'}your crew</Display>
              <Body muted>
                A room is who you wake up with, not when — everyone in it keeps their own time.
              </Body>
            </View>
          </>
        )}

        {step === 'done' && (
          <>
            <View style={styles.headline}>
              <Display>That is{'\n'}everything</Display>
              <Body muted>
                {recorded
                  ? `${rooms[0].name} is on your deck. Swipe a day sideways to skip that morning.`
                  : `${rooms[0].name} is on your deck. Record your voice whenever you like — until then it rings with the default sound.`}
              </Body>
            </View>
            {recorded && (
              <View style={styles.card}>
                <Waveform festive seed={state.me.id} height={72} bars={40} />
                <Text style={styles.cardNote}>Your voice, ready to wake somebody.</Text>
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.footer}>
        {step === 'name' && (
          <Button label="Continue" variant="primary" disabled={!name.trim()} onPress={() => void saveName()} />
        )}

        {step === 'voice' && (
          <>
            <Button label="Record my voice" variant="primary" onPress={() => router.push('/record')} />
            <Button label="Not now" variant="quiet" onPress={() => void finish()} />
          </>
        )}

        {step === 'room' && (
          <>
            <Button label="Create a room" variant="primary" onPress={() => router.push('/room/new')} />
            <Button label="Join with a code" variant="secondary" onPress={() => router.push('/room/join')} />
            <Button label="Not now" variant="quiet" onPress={() => void finish()} />
          </>
        )}

        {step === 'done' && (
          <>
            {recorded && <Button label="Listen" variant="quiet" onPress={() => player.play()} />}
            <Button label="Open Wakemate" variant="primary" onPress={() => void finish()} />
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
  input: {
    ...type.heading,
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
