import DateTimePicker from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { EVERYDAY, isDaySelected, toggleDay, WEEKDAYS, WEEKEND } from '../lib/days';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
import { SNOOZE_OPTIONS, type AlarmSchedule, type SnoozeMinutes } from '../lib/model';
import { CARD_COLORS, colors, fonts, radius, spacing, type } from '../lib/theme';
import { parseAlarmTimeOrDefault } from '../lib/time';

function timeToDate(time: string): Date {
  const { hour, minute } = parseAlarmTimeOrDefault(time);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function dateToTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const PRESETS = [
  { label: '한 번만', value: 0 },
  { label: '평일', value: WEEKDAYS },
  { label: '주말', value: WEEKEND },
  { label: '매일', value: EVERYDAY },
];

/** Time + repeat + snooze. Shared by the room alarm and personal alarms so they behave identically. */
export function ScheduleEditor({
  value,
  onChange,
}: {
  value: AlarmSchedule;
  onChange: (next: AlarmSchedule) => void;
}) {
  return (
    <View style={styles.container}>
      <DateTimePicker
        value={timeToDate(value.time)}
        mode="time"
        display="spinner"
        themeVariant="light"
        locale="en_US"
        onChange={(_, date) => date && onChange({ ...value, time: dateToTime(date) })}
      />

      <View style={styles.block}>
        <Text style={styles.eyebrowKr}>반복</Text>
        <View style={styles.days}>
          {DAY_LABELS.map((label, index) => {
            const selected = isDaySelected(value.days, index);
            return (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange({ ...value, days: toggleDay(value.days, index) })}
                style={[
                  styles.day,
                  selected && {
                    backgroundColor: CARD_COLORS[index].base,
                    borderColor: CARD_COLORS[index].base,
                  },
                ]}>
                <Text style={[styles.dayLabel, selected && styles.dayLabelSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              accessibilityState={{ selected: value.days === preset.value }}
              onPress={() => onChange({ ...value, days: preset.value })}>
              <Text style={[styles.preset, value.days === preset.value && styles.presetOn]}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.snoozeHead}>
          <Text style={styles.eyebrowKr}>다시 울림</Text>
          <Switch
            value={value.snoozeEnabled}
            onValueChange={(v) => onChange({ ...value, snoozeEnabled: v })}
            trackColor={{ true: colors.ink, false: colors.paperDeep }}
            thumbColor={colors.paper}
            ios_backgroundColor={colors.paperDeep}
          />
        </View>
        {value.snoozeEnabled && (
          <View style={styles.snoozeRow}>
            {SNOOZE_OPTIONS.map((minutes: SnoozeMinutes) => (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                accessibilityState={{ selected: value.snoozeMinutes === minutes }}
                onPress={() => onChange({ ...value, snoozeMinutes: minutes })}
                style={[styles.chip, value.snoozeMinutes === minutes && styles.chipOn]}>
                <Text style={[styles.chipLabel, value.snoozeMinutes === minutes && styles.chipLabelOn]}>
                  {minutes}분
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  eyebrowKr: { ...type.eyebrowKr, color: colors.inkSoft },
  block: { gap: spacing.md },
  days: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  day: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: { ...type.caption, color: colors.inkSoft },
  dayLabelSelected: { color: colors.ink, fontFamily: fonts.strong },
  presets: { flexDirection: 'row', gap: spacing.lg },
  preset: { ...type.caption, color: colors.inkSoft },
  presetOn: { color: colors.ink },
  snoozeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  snoozeRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { borderColor: colors.ink },
  chipLabel: { ...type.caption, color: colors.inkSoft },
  chipLabelOn: { color: colors.ink },
});
