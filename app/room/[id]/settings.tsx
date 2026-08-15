import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Display, RoundButton, Screen } from '../../../components/ui';
import { cancelNativeAlarm } from '../../../lib/alarm';
import { useAppState } from '../../../lib/app-state';
import { inviteMessage } from '../../../lib/invite';
import { store } from '../../../lib/store';
import { colors, radius, spacing, tabular, type } from '../../../lib/theme';
import { fmtDaysEN } from '../../../lib/week';

/**
 * What the room is, not when it rings. Nobody sets anyone else's alarm any more, so this screen
 * holds only what the whole room shares: its name, its invite code, and who is in it. Each person's
 * own time lives on their day screen, and is shown here read-only so the room's shape is legible.
 */
export default function RoomSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rooms, state, mutate } = useAppState();
  const room = useMemo(() => rooms.find((r) => r.id === id) ?? null, [rooms, id]);
  const [name, setName] = useState(room?.name ?? '');

  useEffect(() => {
    if (room) setName(room.name);
  }, [room]);

  if (!room || !state) {
    return (
      <Screen style={styles.centered}>
        <Body muted>This room is gone.</Body>
      </Screen>
    );
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === room!.name) {
      setName(room!.name);
      return;
    }
    await mutate(() => store.updateRoom(room!.id, { name: trimmed }));
  }

  function confirmLeave() {
    Alert.alert('Leave this room?', 'Its mornings disappear from this phone, and your alarm for it stops.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await mutate(async () => {
            await cancelNativeAlarm(room!.nativeAlarmId);
            await store.leaveRoom(room!.id);
          });
          router.dismissTo('/');
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
          <Display small>{room.name}</Display>
        </View>

        <View style={styles.sheet}>
          <View style={styles.block}>
            <Text style={styles.rowLabel}>Room name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onEndEditing={() => void saveName()}
              placeholder="Room name"
              placeholderTextColor={colors.lineStrong}
              style={styles.input}
              returnKeyType="done"
            />
            <Text style={styles.meta}>Everyone in the room sees this.</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.rowLabel}>Invite code</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share invite code"
              onPress={() =>
                void Share.share({ message: inviteMessage(room!.name, room!.code) }).catch(() => {})
              }
              style={styles.codeRow}>
              <Text style={styles.code}>{room.code}</Text>
              <Text style={styles.meta}>Share</Text>
            </Pressable>
          </View>

          <View style={styles.block}>
            <Text style={styles.rowLabel}>People · {room.members.length}</Text>
            <Text style={styles.meta}>Everyone keeps their own wake-up time.</Text>
            {room.members.map((member) => (
              <View key={member.id} style={styles.memberRow}>
                <View style={styles.memberText}>
                  <Text style={styles.memberName}>{member.id === state.me.id ? 'You' : member.name}</Text>
                  <Text style={styles.meta}>{member.voiceUri ? 'Voice ready' : 'No voice yet'}</Text>
                </View>
                {member.alarm?.enabled ? (
                  <View style={styles.memberWhen}>
                    <Text style={[styles.memberTime, tabular]}>{member.alarm.time}</Text>
                    <Text style={styles.meta}>{fmtDaysEN(member.alarm.days)}</Text>
                  </View>
                ) : (
                  <Text style={styles.meta}>No alarm</Text>
                )}
              </View>
            ))}
          </View>

          <Button label="Leave room" variant="danger" onPress={confirmLeave} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center', alignItems: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  content: { paddingBottom: spacing.lg },
  headline: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  rowLabel: { ...type.heading, fontSize: 18, color: colors.ink },
  meta: { ...type.caption, color: colors.inkSoft },

  block: { gap: spacing.sm },
  input: {
    ...type.body,
    fontSize: 17,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  codeRow: {
    backgroundColor: colors.paperDeep,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  code: { ...type.heading, fontSize: 22, letterSpacing: 4, color: colors.ink },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  memberText: { flex: 1, gap: 1 },
  memberName: { ...type.body, fontSize: 16, color: colors.ink },
  memberWhen: { alignItems: 'flex-end', gap: 1 },
  memberTime: { ...type.heading, fontSize: 17, color: colors.ink },
});
