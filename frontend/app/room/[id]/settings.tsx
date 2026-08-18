import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Display, RoundButton, Screen } from '../../../components/ui';
import { cancelNativeAlarm } from '../../../lib/alarm';
import { useAppState } from '../../../lib/app-state';
import { codeDaysLeft, inviteMessage } from '../../../lib/invite';
import type { Member } from '../../../lib/model';
import { store } from '../../../lib/store';
import { colors, radius, spacing, tabular, type } from '../../../lib/theme';
import { fmtDaysKR } from '../../../lib/week';

/**
 * What the room is, not when it rings. Nobody sets anyone else's alarm any more, so this screen
 * holds only what the whole room shares: its name, its invite code, and who is in it. Each person's
 * own time lives on their day screen, and is shown here read-only so the room's shape is legible.
 *
 * The owner's tools (remove someone, reissue the code, hand the room over) live here too, but only
 * appear for the owner — everyone else sees the same screen minus the power.
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
        <Body muted>이 방은 사라졌어요.</Body>
      </Screen>
    );
  }

  const iOwn = room.ownerId === state.me.id;
  const daysLeft = codeDaysLeft(room.codeExpiresAt);
  const codeExpired = daysLeft <= 0;

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === room!.name) {
      setName(room!.name);
      return;
    }
    await mutate(() => store.updateRoom(room!.id, { name: trimmed }));
  }

  async function reissue() {
    const updated = await mutate(() => store.reissueCode(room!.id));
    if (updated) Alert.alert('새 코드가 나왔어요', `${updated.code} — 이전 코드는 이제 안 돼요.`);
  }

  /**
   * One sheet per member, holding everything doable to them. Block and report exist for everyone
   * (App Store 1.2 — recordings travel between users); removal is the owner's alone.
   */
  function memberActions(member: Member) {
    if (member.id === state!.me.id) return;
    const blocked = state!.blockedIds.includes(member.id);

    const buttons = [
      {
        text: blocked ? '목소리 차단 해제' : '목소리 차단',
        onPress: () => {
          void mutate(() => store.setBlocked(member.id, !blocked));
        },
      },
      {
        text: '신고',
        onPress: () => {
          Alert.alert(
            `${member.name} 님을 신고할까요?`,
            '녹음이 불쾌하거나 부적절했다면 알려줘요. 확인하고 조치할게요.',
            [
              { text: '취소', style: 'cancel' },
              {
                text: '신고',
                style: 'destructive',
                onPress: async () => {
                  await mutate(() => store.reportMember(member.id, room!.id));
                  Alert.alert('신고를 접수했어요', '확인하는 동안 이 사람 목소리를 차단해둘 수도 있어요.');
                },
              },
            ]
          );
        },
      },
      ...(iOwn
        ? [
            {
              text: '내보내기',
              style: 'destructive' as const,
              onPress: () => {
                Alert.alert(
                  `${member.name} 님을 내보낼까요?`,
                  '이 방에 남긴 아침 기록도 함께 지워져요. 되돌릴 수 없어요.',
                  [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '내보내기',
                      style: 'destructive',
                      onPress: () => void mutate(() => store.removeMember(room!.id, member.id)),
                    },
                  ]
                );
              },
            },
          ]
        : []),
      { text: '취소', style: 'cancel' as const },
    ];

    Alert.alert(member.name, undefined, buttons);
  }

  async function leaveNow() {
    await mutate(async () => {
      await cancelNativeAlarm(room!.nativeAlarmId);
      await store.leaveRoom(room!.id);
    });
    router.dismissTo('/');
  }

  /**
   * An owner does not get to leave a room ownerless — pick the successor first, in the same flow.
   * The room caps at 5 people, so the candidate list always fits a native alert.
   */
  function confirmLeave() {
    const others = room!.members.filter((m) => m.id !== state!.me.id);

    if (iOwn && others.length > 0) {
      Alert.alert('나가기 전에', '방장을 넘길 사람을 골라요.', [
        ...others.map((m) => ({
          text: m.name,
          onPress: () => {
            Alert.alert(`${m.name} 님에게 방장을 넘기고 나갈까요?`, '이 방의 아침 기록이 이 폰에서 사라져요.', [
              { text: '취소', style: 'cancel' },
              {
                text: '나가기',
                style: 'destructive',
                onPress: async () => {
                  await mutate(() => store.transferOwner(room!.id, m.id));
                  await leaveNow();
                },
              },
            ]);
          },
        })),
        { text: '취소', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert(
      iOwn ? '방을 없애고 나갈까요?' : '이 방을 나갈까요?',
      iOwn
        ? '마지막 사람이 나가면 방도 사라져요.'
        : '이 방의 아침 기록이 이 폰에서 사라지고, 이 방 알람도 멈춰요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: () => void leaveNow() },
      ]
    );
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="닫기" size={38} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headline}>
          <Display small>{room.name}</Display>
        </View>

        <View style={styles.sheet}>
          <View style={styles.block}>
            <Text style={styles.rowLabel}>방 이름</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onEndEditing={() => void saveName()}
              placeholder="방 이름"
              placeholderTextColor={colors.lineStrong}
              style={styles.input}
              returnKeyType="done"
            />
            <Text style={styles.meta}>방에 있는 모두에게 보여요.</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.rowLabel}>초대 코드</Text>
            {codeExpired ? (
              <>
                <View style={styles.codeRow}>
                  <Text style={[styles.code, styles.codeDead]}>{room.code}</Text>
                  <Text style={styles.meta}>만료됨</Text>
                </View>
                {iOwn ? (
                  <Button label="새 코드 만들기" variant="secondary" onPress={() => void reissue()} />
                ) : (
                  <Text style={styles.meta}>방장이 새 코드를 만들 수 있어요.</Text>
                )}
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="초대 코드 공유"
                  onPress={() =>
                    void Share.share({ message: inviteMessage(room!.name, room!.code) }).catch(() => {})
                  }
                  style={styles.codeRow}>
                  <Text style={styles.code}>{room.code}</Text>
                  <Text style={styles.meta}>공유</Text>
                </Pressable>
                <Text style={styles.meta}>
                  {daysLeft}일 남음{iOwn ? ' — 새 코드는 아래에서 언제든 만들 수 있어요.' : ''}
                </Text>
                {iOwn && <Button label="새 코드 만들기" variant="quiet" onPress={() => void reissue()} />}
              </>
            )}
          </View>

          <View style={styles.block}>
            <Text style={styles.rowLabel}>사람 · {room.members.length}</Text>
            <Text style={styles.meta}>일어나는 시간은 각자 정해요.</Text>
            {room.members.map((member) => {
              const isMe = member.id === state.me.id;
              const blocked = state.blockedIds.includes(member.id);
              return (
                <Pressable
                  key={member.id}
                  disabled={isMe}
                  accessibilityRole={isMe ? undefined : 'button'}
                  accessibilityLabel={isMe ? undefined : `${member.name}, 차단·신고${iOwn ? '·내보내기' : ''}`}
                  onPress={() => memberActions(member)}
                  style={({ pressed }) => [styles.memberRow, pressed && !isMe && styles.rowPressed]}>
                  <View style={styles.memberText}>
                    <View style={styles.nameRow}>
                      <Text style={styles.memberName}>{isMe ? '나' : member.name}</Text>
                      {member.id === room.ownerId && (
                        <View style={styles.ownerChip}>
                          <Text style={styles.ownerChipText}>방장</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.meta, blocked && styles.blockedText]}>
                      {blocked
                        ? '차단함 — 이 목소리로는 깨지 않아요'
                        : member.voiceUri
                          ? '목소리 준비됨'
                          : '목소리 없음'}
                    </Text>
                  </View>
                  {member.alarm?.enabled ? (
                    <View style={styles.memberWhen}>
                      <Text style={[styles.memberTime, tabular]}>{member.alarm.time}</Text>
                      <Text style={styles.meta}>{fmtDaysKR(member.alarm.days)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.meta}>알람 없음</Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          <Button label="방 나가기" variant="danger" onPress={confirmLeave} />
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
  rowLabel: { ...type.headingKr, fontSize: 18, color: colors.ink },
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
  codeDead: { textDecorationLine: 'line-through', opacity: 0.4 },

  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowPressed: { opacity: 0.55 },
  memberText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberName: { ...type.body, fontSize: 16, color: colors.ink },
  ownerChip: {
    backgroundColor: colors.paperDeep,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  ownerChipText: { ...type.eyebrowKr, fontSize: 11, color: colors.inkSoft },
  blockedText: { color: colors.alert },
  memberWhen: { alignItems: 'flex-end', gap: 1 },
  memberTime: { ...type.heading, fontSize: 17, color: colors.ink },
});
