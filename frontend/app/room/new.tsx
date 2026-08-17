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
      Alert.alert('Give it a name', 'Your friends will see it on their deck.');
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
      Alert.alert("Couldn't create the room", 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="Close" size={38} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headline}>
          <Display>A new{'\n'}morning crew</Display>
          <Body muted>
            Everyone here wakes each other with their own voice. You each set your own time — yours
            starts at 07:00 on weekdays, and the day cards are where you change it.
          </Body>
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Room name"
          placeholderTextColor={colors.lineStrong}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={() => void create()}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Create room" variant="primary" onPress={() => void create()} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xl },
  headline: { gap: spacing.sm },
  input: {
    ...type.heading,
    fontSize: 24,
    color: colors.ink,
    backgroundColor: colors.paperLight,
    borderRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
