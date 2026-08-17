import { useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AvatarStack } from '../components/Avatar';
import { Sticker } from '../components/Sticker';
import { Button, Display, RoundButton, Screen } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { commitPersonalAlarm, reportAlarmFailure } from '../lib/alarm';
import { useAppState } from '../lib/app-state';
import { myAlarmIn, type PersonalAlarm } from '../lib/model';
import { store } from '../lib/store';
import { cardColorAt, colors, radius, spacing, tabular, type } from '../lib/theme';
import { fmtDaysEN } from '../lib/week';

/**
 * App settings — everything the burger owns, and the only screen that is a list rather than a
 * surface. It answers four questions in order of how often they are asked: who friends hear when
 * you wake them, what rings just for you, which rooms you are in, and how to wipe the demo data.
 *
 * Personal alarms live here rather than on the deck: the deck is one room's week, so an alarm with
 * no room has nowhere to sit on it. This keeps the app a normal alarm clock as well as a shared one.
 */
export default function SettingsScreen() {
  const { ready, state, rooms, mutate } = useAppState();
  const [name, setName] = useState(state?.me.name ?? '');
  const player = useAudioPlayer(state?.me.voiceUri ?? undefined);

  if (!ready || !state) return <Screen />;

  const personals = [...state.personalAlarms].sort((a, b) => a.time.localeCompare(b.time));

  function confirmReset() {
    Alert.alert('Clear everything?', 'Rooms, alarms and your voice will be gone for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await mutate(() => store.reset());
          router.dismissTo('/');
        },
      },
    ]);
  }

  async function togglePersonal(alarm: PersonalAlarm, enabled: boolean) {
    // The switch follows the device, not the tap: commitPersonalAlarm rolls the change back when
    // the alarm is refused, and refreshing puts the switch where reality is.
    const result = await mutate(() => commitPersonalAlarm(alarm, { enabled }));
    reportAlarmFailure(result);
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="Close" size={38} onPress={() => router.back()} />
      </View>

      <ScrollView style={styles.fill} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headline}>
          <Display>Settings</Display>
          <Text style={styles.sub}>Your name, your voice, your alarms</Text>
        </View>

        <View style={styles.sheet}>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>You</Text>

            <View style={styles.stack}>
              <Text style={styles.rowLabel}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                onEndEditing={() => void mutate(() => store.setMyName(name.trim() || 'You'))}
                placeholder="What friends see"
                placeholderTextColor={colors.lineStrong}
                style={styles.input}
                returnKeyType="done"
              />
            </View>

            <View style={styles.stack}>
              <Text style={styles.rowLabel}>Your voice</Text>
              {state.me.voiceUri ? (
                <>
                  <View>
                    <Waveform festive seed={state.me.id} height={36} bars={64} />
                    {/* The one tilted thing on the screen — it marks the row that is actually
                        about other people, not about you. */}
                    <Sticker
                      label="friends hear this"
                      color={cardColorAt(5).base}
                      rotate={-4}
                      style={styles.sticker}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {state.me.voiceDurationMs ? `${(state.me.voiceDurationMs / 1000).toFixed(1)}s` : 'Recorded'}
                    {' · '}rings in {rooms.length} room{rooms.length === 1 ? '' : 's'}
                  </Text>
                  <View style={styles.actions}>
                    <Button label="Listen" variant="quiet" onPress={() => player.play()} />
                    <Button label="Re-record" variant="quiet" onPress={() => router.push('/record')} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.meta}>Record 5–10 seconds and it becomes someone&apos;s alarm.</Text>
                  <Button label="Record your voice" variant="primary" onPress={() => router.push('/record')} />
                </>
              )}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Just for you</Text>
            <Text style={styles.meta}>Alarms with no room — these ring for you alone.</Text>

            {personals.map((alarm) => (
              <Pressable
                key={alarm.id}
                accessibilityRole="button"
                accessibilityLabel={`${alarm.label || 'Alarm'} ${alarm.time}`}
                onPress={() => router.push({ pathname: '/alarm/[id]', params: { id: alarm.id } })}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                <View style={styles.rowText}>
                  <Text style={[styles.time, tabular, !alarm.enabled && styles.off]}>{alarm.time}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {alarm.label || 'Alarm'} · {fmtDaysEN(alarm.days)}
                  </Text>
                </View>
                <Switch
                  value={alarm.enabled}
                  onValueChange={(v) => void togglePersonal(alarm, v)}
                  trackColor={{ true: colors.ink, false: 'rgba(23,22,18,0.12)' }}
                  thumbColor="#ffffff"
                  ios_backgroundColor="rgba(23,22,18,0.12)"
                />
              </Pressable>
            ))}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New alarm"
              onPress={() => router.push({ pathname: '/alarm/[id]', params: { id: 'new' } })}
              style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}>
              <Text style={styles.addLabel}>＋ New alarm</Text>
            </Pressable>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Your rooms</Text>
            {rooms.length === 0 ? (
              <Text style={styles.meta}>None yet — the ⊕ on the deck starts one.</Text>
            ) : (
              rooms.map((room, i) => (
                <Pressable
                  key={room.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${room.name} settings`}
                  onPress={() => router.push({ pathname: '/room/[id]/settings', params: { id: room.id } })}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.swatch, { backgroundColor: cardColorAt(i).base }]} />
                  <View style={styles.rowText}>
                    <Text style={styles.roomName} numberOfLines={1}>
                      {room.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {(() => {
                        const mine = myAlarmIn(room, state.me.id);
                        return mine?.enabled ? `${mine.time} · ${fmtDaysEN(mine.days)}` : 'No alarm set';
                      })()}
                    </Text>
                  </View>
                  <AvatarStack members={room.members} size={22} max={3} />
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Sample data</Text>
            <Text style={styles.meta}>
              There is no server yet, so the rooms and mornings you see are fiction for judging the
              design.
            </Text>
            <View style={styles.actions}>
              <Button label="Refill" variant="quiet" onPress={() => void mutate(() => store.loadMockData())} />
              <Button label="Clear all" variant="quiet" onPress={confirmReset} />
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { paddingTop: spacing.sm, flexGrow: 1 },
  headline: { paddingHorizontal: spacing.lg, gap: spacing.xs, paddingBottom: spacing.lg },
  sub: { ...type.label, fontSize: 16, color: colors.ink },

  // White against the cream, like the reference's sheet; runs off the bottom of the screen.
  sheet: {
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  group: { gap: spacing.sm },
  groupLabel: { ...type.heading, fontSize: 20, color: colors.ink },
  stack: { gap: spacing.sm, paddingTop: spacing.sm },
  rowLabel: { ...type.label, color: colors.inkSoft },
  input: {
    ...type.body,
    fontSize: 17,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  meta: { ...type.caption, color: colors.inkSoft },
  sticker: { position: 'absolute', right: -6, bottom: -18 },
  actions: { flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowPressed: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  time: { ...type.time, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  off: { opacity: 0.35 },
  roomName: { ...type.heading, fontSize: 17, color: colors.ink },
  swatch: { width: 26, height: 26, borderRadius: 8 },
  chevron: { ...type.heading, fontSize: 22, color: colors.lineStrong },

  addRow: { paddingVertical: spacing.md },
  addLabel: { ...type.label, color: colors.ink },
});
