import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Display, RoundButton, Screen } from '../../components/ui';
import { useAppState } from '../../lib/app-state';
import { parseInviteCode } from '../../lib/invite';
import { store, StoreError } from '../../lib/store';
import { colors, fonts, radius, spacing, type } from '../../lib/theme';

/**
 * Joining by code or by link. The field takes either — paste the whole invite message and the
 * code is lifted out of it — because an invite arrives as a link in a chat as often as it arrives
 * read aloud.
 *
 * `code` arrives as a route param when the screen is opened from an invite link
 * (voicealarm://join/ABC123 → app/join/[code].tsx).
 */

/**
 * A dead code and a wrong code are different problems for the person typing — one needs the owner,
 * the other needs a second look. Keyed by the server's `code` (docs/api-contract.md §3), which the
 * local store already throws.
 */
const JOIN_ERRORS: Record<string, [string, string]> = {
  CODE_EXPIRED: ['코드가 만료됐어요', '방장이 새 코드를 만들면 다시 참여할 수 있어요.'],
  NOT_FOUND: ['이 코드의 방이 없어요', '한 글자씩 다시 확인해봐요.'],
  ROOM_FULL: ['방이 가득 찼어요', '한 방은 다섯 명까지예요.'],
};

export default function JoinRoomScreen() {
  const { code: incoming } = useLocalSearchParams<{ code?: string }>();
  const { mutate } = useAppState();
  const [text, setText] = useState(incoming ?? '');
  const [busy, setBusy] = useState(false);

  const parsed = parseInviteCode(text);

  async function join() {
    if (!parsed) {
      Alert.alert('코드를 확인해요', '여섯 글자 코드를 입력하거나, 받은 초대 링크를 붙여넣어요.');
      return;
    }
    setBusy(true);
    try {
      await mutate(() => store.joinRoomByCode(parsed, `Room ${parsed}`));
      router.dismissTo('/');
    } catch (e) {
      const [title, message] =
        (e instanceof StoreError && JOIN_ERRORS[e.code]) || ['참여하지 못했어요', '잠시 뒤 다시 해봐요.'];
      Alert.alert(title, message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="닫기" size={38} onPress={() => router.back()} />
      </View>

      <View style={styles.body}>
        <View style={styles.headline}>
          <Display kr>초대 코드{'\n'}받았어요?</Display>
          <Body muted>여섯 글자를 입력하거나, 친구가 보낸 링크를 통째로 붙여넣어요.</Body>
        </View>

        <View style={styles.field}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="ABC123"
            placeholderTextColor={colors.lineStrong}
            style={styles.input}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void join()}
          />
          {/* Confirms the code was recognised before committing — pasted links look nothing like
              a code until they are parsed. */}
          <Text style={styles.hint}>
            {text.trim().length === 0 ? ' ' : parsed ? `${parsed} 방으로 들어가요` : '아직 코드가 안 보여요'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="참여하기" variant="primary" onPress={() => void join()} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  body: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.xl, paddingTop: spacing.md },
  headline: { gap: spacing.sm },
  field: { gap: spacing.sm },
  input: {
    fontFamily: fonts.numeric,
    fontSize: 40,
    letterSpacing: 6,
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: colors.paperLight,
    borderRadius: radius.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  hint: { ...type.caption, color: colors.inkSoft, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
