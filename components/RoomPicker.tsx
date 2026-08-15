import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { myAlarmIn, type Room } from '../lib/model';
import { cardColorAt, colors, radius, spacing, tabular, type } from '../lib/theme';
import { fmtDaysEN } from '../lib/week';

/**
 * The header pill's dropdown: which room's week the deck is showing.
 *
 * Anchored under the pill rather than centred, so it reads as that control opening rather than as
 * a page taking over. Each row wears its room's deck colour, which is the same colour the deck
 * cards take once it is selected.
 */
export function RoomPicker({
  visible,
  rooms,
  selectedId,
  myId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  rooms: Room[];
  selectedId: string | null;
  myId: string;
  onSelect: (roomId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet} pointerEvents="box-none">
        <View style={styles.card}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {rooms.map((room, i) => {
              const selected = room.id === selectedId;
              const mine = myAlarmIn(room, myId);
              return (
                <Pressable
                  key={room.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={room.name}
                  onPress={() => onSelect(room.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.swatch, { backgroundColor: cardColorAt(i).base }]} />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {room.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {room.members.length} people · {mine ? fmtDaysEN(mine.days) : 'no alarm'}
                    </Text>
                  </View>
                  <Text style={[styles.time, tabular]}>{mine?.enabled ? mine.time : '—'}</Text>
                  {selected && <Text style={styles.check}>✓</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(23,22,18,0.25)' },
  // Sits just under the header pill so the dropdown belongs to it.
  sheet: { position: 'absolute', top: 108, left: spacing.lg, right: spacing.lg },
  card: {
    backgroundColor: colors.paperLight,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    maxHeight: 420,
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: colors.paperDeep },
  swatch: { width: 26, height: 26, borderRadius: 8 },
  rowText: { flex: 1, gap: 1 },
  name: { ...type.heading, fontSize: 17, color: colors.ink },
  meta: { ...type.caption, fontSize: 12, color: colors.inkSoft },
  time: { ...type.heading, fontSize: 16, color: colors.ink },
  check: { ...type.label, color: colors.ink },
});
