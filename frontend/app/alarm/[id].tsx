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
      Alert.alert('저장을 못 했어요', '잠시 뒤 다시 해봐요.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('이 알람을 지울까요?', '다시 울리지 않아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
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
        <RoundButton glyph="✕" label="닫기" size={38} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headline}>
          <Display kr>{isNew ? '혼자 쓰는\n알람' : '알람\n수정'}</Display>
        </View>

        {/* The editor sits on its own pastel card, so making an alarm feels like making a thing —
            the plain form on cream read as a settings page. */}
        <View>
          <Sticker label="no crew, just naps" color={CARD_COLORS[3].base} rotate={5} style={styles.badge} />
          <View style={styles.editorCard}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="이름 붙이기 — 낮잠? 헬스?"
            placeholderTextColor={colors.lineStrong}
            style={styles.input}
            returnKeyType="done"
          />
            <ScheduleEditor value={schedule} onChange={setSchedule} />
          </View>
        </View>

        {!isNew && <Button label="알람 지우기" variant="danger" onPress={confirmDelete} />}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={isNew ? '알람 추가' : '저장'} variant="primary" onPress={() => void save()} loading={saving} />
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
  // headingKr, not heading: labels typed here are usually Korean, and Figtree has no Hangul.
  input: {
    ...type.headingKr,
    fontSize: 22,
    color: colors.ink,
    backgroundColor: colors.paperLight,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
