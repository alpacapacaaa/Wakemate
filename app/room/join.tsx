import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Body, Button, Display, RoundButton, Screen } from '../../components/ui';
import { useAppState } from '../../lib/app-state';
import { parseInviteCode } from '../../lib/invite';
import { store } from '../../lib/store';
import { colors, fonts, radius, spacing, type } from '../../lib/theme';

/**
 * Joining by code or by link. The field takes either — paste the whole invite message and the
 * code is lifted out of it — because an invite arrives as a link in a chat as often as it arrives
 * read aloud.
 *
 * `code` arrives as a route param when the screen is opened from an invite link
 * (voicealarm://join/ABC123 → app/join/[code].tsx).
 */
export default function JoinRoomScreen() {
  const { code: incoming } = useLocalSearchParams<{ code?: string }>();
  const { mutate } = useAppState();
  const [text, setText] = useState(incoming ?? '');
  const [busy, setBusy] = useState(false);

  const parsed = parseInviteCode(text);

  async function join() {
    if (!parsed) {
      Alert.alert('Check the code', 'Invite codes are 6 characters, or paste the invite link.');
      return;
    }
    setBusy(true);
    try {
      await mutate(() => store.joinRoomByCode(parsed, `Room ${parsed}`));
      router.dismissTo('/');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.topRow}>
        <RoundButton glyph="✕" label="Close" size={38} onPress={() => router.back()} />
      </View>

      <View style={styles.body}>
        <View style={styles.headline}>
          <Display>Got a{'\n'}code?</Display>
          <Body muted>Type the six characters, or paste the invite link a friend sent you.</Body>
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
            {text.trim().length === 0 ? ' ' : parsed ? `Joining ${parsed}` : 'No code in there yet'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Join room" variant="primary" onPress={() => void join()} loading={busy} />
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
