import DateTimePicker from '@react-native-community/datetimepicker';
import { useAudioPlayer } from 'expo-audio';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar } from '../../../../components/Avatar';
import { GlassCard } from '../../../../components/Glass';
import { Sticker } from '../../../../components/Sticker';
import { Button, RoundButton, Screen } from '../../../../components/ui';
import { Waveform } from '../../../../components/Waveform';
import {
  commitRoomAlarm,
  commitWeekdayToggle,
  reportAlarmFailure,
  saveVoiceAsAlarmSound,
} from '../../../../lib/alarm';
import { useAppState } from '../../../../lib/app-state';
import { DEFAULT_ALARM, myAlarmIn, ringsOnWeekday, today } from '../../../../lib/model';
import { morningLog, store } from '../../../../lib/store';
import { cardColorAt, colors, radius, spacing, tabular, type } from '../../../../lib/theme';
import { MAX_SECONDS, MIN_SECONDS, useVoiceRecorder } from '../../../../lib/use-voice-recorder';
import { DAY_NAMES, dateOfWeekday, todayWeekday } from '../../../../lib/week';

function hhmm(iso: string): string {
  return (iso.split('T')[1] ?? '').slice(0, 5);
}

/** "07:00" → a Date today at that time, which is all the iOS time wheel understands. */
function timeToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 7, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * One morning, in that day's colour. Tapping a card on the deck lands here instead of expanding it
 * in place: the accordion had to shrink six cards to make room for one, so a day never got a whole
 * screen and its colour never got to be the ground.
 *
 * It answers the three things a morning is made of, in the order they are decided: when it rings,
 * who it rings for, and what they hear. The alarm sits on liquid glass — the one iOS material in an
 * otherwise flat app, kept for the one thing that is actually a system alarm.
 */
export default function DayScreen() {
  const { id, weekday } = useLocalSearchParams<{ id: string; weekday: string }>();
  const { ready, state, rooms, mutate } = useAppState();

  const [pickingTime, setPickingTime] = useState(false);
  const rec = useVoiceRecorder();

  const room = rooms.find((r) => r.id === id) ?? null;
  const myVoice = state?.me.voiceUri ?? null;
  // The take just recorded here plays back before it is saved; otherwise the saved voice does.
  const player = useAudioPlayer(rec.recordedUri ?? myVoice ?? undefined);

  if (!ready || !state) return <Screen />;

  const parsed = Number(weekday);
  const dayIdx = Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : todayWeekday();
  const color = cardColorAt(dayIdx);

  if (!room) {
    return (
      <Screen style={{ backgroundColor: color.base }}>
        <View style={styles.topRow}>
          <RoundButton glyph="←" label="뒤로" size={38} onPress={() => router.back()} />
        </View>
        <View style={styles.gone}>
          <Text style={styles.goneText}>방이{'\n'}사라졌어요</Text>
        </View>
      </Screen>
    );
  }

  const date = dateOfWeekday(dayIdx);
  const isToday = date === today();
  const isFuture = date > today();
  // My schedule in this room — nobody else's alarm is mine to move.
  const mine = myAlarmIn(room, state.me.id);
  const myTime = mine?.time ?? DEFAULT_ALARM.time;
  const rings = ringsOnWeekday(mine, dayIdx);

  const log = morningLog(state, room.id, date);
  const recordByMember = new Map(log.map((w) => [w.memberId, w]));
  // Whoever got up first leads; the still-asleep trail behind in their original order.
  const ordered = [...room.members].sort((a, b) => {
    const wa = recordByMember.get(a.id)?.wokeAt ?? '￿';
    const wb = recordByMember.get(b.id)?.wokeAt ?? '￿';
    return wa.localeCompare(wb);
  });

  // A morning only happened if the room rang and the day has been. Otherwise the list is just who
  // is in the room, and nobody is "asleep" or has "missed" anything.
  const noMorning = !rings || isFuture;
  const wokeCount = ordered.filter((m) => recordByMember.has(m.id)).length;
  const peopleHeading = !rings
    ? `이 방 사람들 · ${room.members.length}`
    : isFuture
      ? `일어날 사람 · ${room.members.length}`
      : `일어난 사람 · ${wokeCount}/${room.members.length}`;

  /**
   * Room alarm edits have to reach AlarmKit too, or the screen and the device disagree. A refusal
   * rolls the change back, so the switch and the time always show what will actually ring.
   */
  async function saveAlarm(patch: { time?: string; days?: number; enabled?: boolean }) {
    const result = await mutate(() => commitRoomAlarm(room!, patch, state!.me.id));
    reportAlarmFailure(result);
  }

  /** The switch owns this weekday alone — the same atomic path as swiping the card on the deck. */
  async function toggleThisDay() {
    const result = await mutate(() => commitWeekdayToggle(room!.id, dayIdx, state!.me.id));
    reportAlarmFailure(result);
  }

  async function stopRecording() {
    const take = await rec.stop();
    if (!take) {
      Alert.alert('조금만 더', `최소 ${MIN_SECONDS}초는 돼야 해요.`);
      return;
    }
    const soundName = await saveVoiceAsAlarmSound(take.uri);
    await mutate(() => store.setMyVoice(take.uri, take.ms, soundName));
  }

  return (
    <Screen style={{ backgroundColor: color.base }}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <RoundButton glyph="←" label="주간 덱으로" size={38} onPress={() => router.back()} />
          {isToday && (
            <View style={styles.todayPill}>
              <Text style={styles.todayText}>TODAY</Text>
            </View>
          )}
        </View>

        <View style={styles.head}>
          <Text style={styles.headline}>
            {DAY_NAMES[dayIdx]}
            {'\n'}morning
          </Text>
          <Text style={styles.room}>{room.name}</Text>
        </View>

        <GlassCard contentStyle={styles.alarmCard}>
          <View style={styles.alarmTop}>
            <Text style={styles.eyebrow}>내 알람</Text>
            <Switch
              value={rings}
              onValueChange={() => void toggleThisDay()}
              trackColor={{ true: colors.ink, false: 'rgba(23,22,18,0.14)' }}
              thumbColor="#ffffff"
              ios_backgroundColor="rgba(23,22,18,0.14)"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`내 알람 ${myTime}, 변경`}
            onPress={() => setPickingTime((v) => !v)}
            style={({ pressed }) => pressed && styles.pressed}>
            <Text style={[styles.time, tabular, !rings && styles.dim]}>{myTime}</Text>
          </Pressable>

          {pickingTime ? (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={timeToDate(myTime)}
                mode="time"
                display="spinner"
                textColor={colors.ink}
                style={styles.picker}
                onChange={(_, picked) => picked && void saveAlarm({ time: dateToTime(picked) })}
              />
              <Button label="완료" variant="onCard" onPress={() => setPickingTime(false)} />
            </View>
          ) : (
            <Text style={styles.alarmNote}>
              {rings
                ? `내 알람이에요 — ${room.name} 사람들은 각자 정해요. 시각을 누르면 바꿀 수 있어요.`
                : '이 요일엔 알람이 없어요. 스위치로 이 아침을 켜요.'}
            </Text>
          )}
        </GlassCard>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>{peopleHeading}</Text>
          <View style={styles.people}>
            {ordered.map((member) => {
              const record = recordByMember.get(member.id);
              const asleep = !record && !noMorning;
              return (
                <View key={member.id} style={styles.person}>
                  <Avatar id={member.id} name={member.name} size={34} dimmed={asleep} />
                  <Text style={[styles.personName, asleep && styles.dim]} numberOfLines={1}>
                    {member.id === state.me.id ? 'You' : member.name}
                  </Text>
                  <Text style={[styles.personMeta, tabular, !record && styles.dim]}>
                    {record ? hhmm(record.wokeAt) : noMorning ? '—' : isToday ? '아직' : '놓침'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>내 목소리</Text>
          <View style={styles.recordCard}>
            <Waveform
              festive
              seed={rec.recordedUri ?? myVoice ?? 'silence'}
              progress={rec.isRecording ? Math.min(rec.elapsed / MAX_SECONDS, 1) : undefined}
              height={64}
              bars={44}
              amplitude={rec.isRecording || rec.recordedUri || myVoice ? 1 : 0.35}
            />

            <Text style={styles.recordNote}>
              {rec.permissionDenied
                ? '마이크 접근이 꺼져 있어요 — 설정 › 개인정보 보호 › 마이크에서 켜요.'
                : rec.isRecording
                  ? `${rec.elapsed.toFixed(1)}s — 계속 말해요`
                  : rec.recordedUri
                    ? '저장됐어요. 이 중 누군가 이 소리에 깨요.'
                    : myVoice
                      ? `${room.name}의 누군가 이 목소리에 깰 수 있어요.`
                      : `${MIN_SECONDS}–${MAX_SECONDS}초. 아침에 들려주고 싶은 말로.`}
            </Text>

            {!rec.permissionDenied &&
              (rec.isRecording ? (
                <Button
                  label={rec.reachedMinimum ? '여기까지' : `${MIN_SECONDS}초까지 이어서`}
                  variant={rec.reachedMinimum ? 'primary' : 'secondary'}
                  onPress={() => void stopRecording()}
                />
              ) : (
                <View style={styles.recordActions}>
                  <Button
                    label={myVoice || rec.recordedUri ? '다시 녹음' : '녹음'}
                    variant="primary"
                    onPress={() => void rec.start()}
                  />
                  {(myVoice || rec.recordedUri) && (
                    <Button label="들어보기" variant="quiet" onPress={() => player.play()} />
                  )}
                </View>
              ))}

            <Sticker label="ring ring!" color={color.base} rotate={7} style={styles.sticker} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayPill: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  todayText: { ...type.eyebrow, fontSize: 11, color: colors.onInk },

  head: { gap: spacing.xs },
  headline: { ...type.display, color: colors.ink },
  room: { ...type.label, fontSize: 16, color: colors.ink, opacity: 0.7 },
  gone: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  goneText: { ...type.displayKr, color: colors.ink },

  alarmCard: { padding: spacing.xl, gap: spacing.sm },
  alarmTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // eyebrowKr, not eyebrow: these are Korean now, and the eyebrow face has no Hangul.
  eyebrow: { ...type.eyebrowKr, color: colors.inkSoft },
  time: { ...type.timeLg, fontSize: 72, letterSpacing: -3, color: colors.ink },
  alarmNote: { ...type.caption, color: colors.inkSoft },
  pickerWrap: { gap: spacing.sm },
  // Left to fill, the wheel's columns drift off-centre in the card.
  picker: { alignSelf: 'center', width: 280 },
  pressed: { opacity: 0.6 },
  dim: { opacity: 0.4 },

  section: { gap: spacing.sm },
  people: { gap: 2 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.paperLight,
    borderRadius: radius.pillRow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  personName: { ...type.label, fontSize: 16, color: colors.ink, flex: 1 },
  personMeta: { ...type.body, fontSize: 15, color: colors.ink },

  recordCard: {
    backgroundColor: colors.paperLight,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  recordNote: { ...type.caption, color: colors.inkSoft },
  recordActions: { flexDirection: 'row', gap: spacing.md },
  sticker: { position: 'absolute', top: -14, right: spacing.md },
});
