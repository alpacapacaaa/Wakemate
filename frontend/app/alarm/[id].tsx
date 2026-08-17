import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ScheduleEditor } from '../../components/ScheduleEditor';
import { Sticker } from '../../components/Sticker';
import { Button, Display, RoundButton, Screen } from '../../components/ui';
import { cancelNativeAlarm, commitPersonalAlarm, reportAlarmFailure } from '../../lib/alarm';
import { useAppState } from '../../lib/app-state';
import { DEFAULT_ALARM, type AlarmSchedule } from '../../lib/model';
import { store } from '../../lib/store';
import { CARD_COLORS, colors, radius, spacing, type } from '../../lib/theme';

export default function PersonalAlarmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, mutate } = useAppState();
  const isNew = id === 'new';
  const existing = useMemo(() => state?.personalAlarms.find((a) => a.id === id) ?? null, [state, id]);

  const [schedule, setSchedule] = useState<AlarmSchedule>(existing ?? DEFAULT_ALARM);
  const [label, setLabel] = useState(existing?.label ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const result = await mutate(async () => {
        const alarm = isNew
          ? await store.addPersonalAlarm({ ...schedule, label })
          : await store.updatePersonalAlarm(id!, { ...schedule, label });
        if (!alarm) return { ok: false, reason: 'failed', detail: 'That alarm is gone.' } as const;
        const synced = await commitPersonalAlarm(alarm, {});
        // Nothing to roll back to on a brand-new alarm; refusal leaves it off.
        if (!synced.ok && isNew) await store.updatePersonalAlarm(alarm.id, { enabled: false });
        return synced;
      });
      if (!result.ok) {
        reportAlarmFailure(result);
        return;
      }
      router.back();
    } catch {
      Alert.alert("Couldn't save", 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this alarm?', "It won't ring again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await mutate(async () => {
            await cancelNativeAlarm(existing?.nativeAlarmId ?? null);
            await store.deletePersonalAlarm(id!);
          });
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="Close" size={38} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headline}>
          <Display>{isNew ? 'Just for\nyou' : 'Edit\nalarm'}</Display>
        </View>

        {/* The editor sits on its own pastel card, so making an alarm feels like making a thing —
            the plain form on cream read as a settings page. */}
        <View>
          <Sticker label="no crew, just naps" color={CARD_COLORS[3].base} rotate={5} style={styles.badge} />
          <View style={styles.editorCard}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Name it — Nap? Gym?"
            placeholderTextColor={colors.lineStrong}
            style={styles.input}
            returnKeyType="done"
          />
            <ScheduleEditor value={schedule} onChange={setSchedule} />
          </View>
        </View>

        {!isNew && <Button label="Delete alarm" variant="danger" onPress={confirmDelete} />}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={isNew ? 'Add alarm' : 'Save'} variant="primary" onPress={() => void save()} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.lg },
  headline: { gap: spacing.sm },
  badge: { position: 'absolute', top: -12, right: spacing.lg, zIndex: 1 },

  editorCard: {
    backgroundColor: CARD_COLORS[2].tint,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  input: {
    ...type.heading,
    fontSize: 22,
    color: colors.ink,
    backgroundColor: colors.paperLight,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
