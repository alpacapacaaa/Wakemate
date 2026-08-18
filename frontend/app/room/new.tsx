import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Body, Button, Display, RoundButton, Screen } from '../../components/ui';
import { commitRoomAlarm, reportAlarmFailure } from '../../lib/alarm';
import { useAppState } from '../../lib/app-state';
import { store } from '../../lib/store';
import { colors, spacing, type } from '../../lib/theme';

/**
 * Styled after the reference's opening screen: cream page, a big statement headline, one black pill
 * at the bottom.
 *
 * There is no schedule here any more. The person starting a room does not get to set everyone's
 * wake-up time — each member keeps their own, on their own day screen — so all this screen decides
 * is who the room is. Mine starts at the default so the room rings from day one.
 */
export default function NewRoomScreen() {
  const { state, mutate } = useAppState();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('이름이 필요해요', '친구들 덱에 이 이름으로 떠요.');
      return;
    }
    if (!state) return;

    setSaving(true);
    try {
      const result = await mutate(async () => {
        const created = await store.createRoom(trimmed);
        const synced = await commitRoomAlarm(created, {}, state.me.id);
        // A brand-new room has no earlier schedule to roll back to, so a refusal has to leave the
        // alarm off rather than showing one the device never took.
        if (!synced.ok) await store.updateMyAlarm(created.id, state.me.id, { enabled: false });
        return synced;
      });
      reportAlarmFailure(result);
      router.back();
    } catch {
      Alert.alert('방을 못 만들었어요', '잠시 뒤 다시 해봐요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="닫기" size={38} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headline}>
          <Display kr>같이 깰{'\n'}새 방</Display>
          <Body muted>
            서로의 목소리로 깨우는 사이가 돼요. 시간은 각자 정해요 — 내 건 평일 07:00으로 시작하고,
            요일 카드에서 바꿔요.
          </Body>
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="방 이름"
          placeholderTextColor={colors.lineStrong}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="만들기" variant="primary" onPress={() => void create()} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xl },
  headline: { gap: spacing.sm },
  // headingKr, not heading: room names are usually Korean, and Figtree has no Hangul.
  input: {
    ...type.headingKr,
    fontSize: 24,
    color: colors.ink,
    backgroundColor: colors.paperLight,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
