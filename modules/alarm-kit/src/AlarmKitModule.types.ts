export type AlarmAuthorizationState = 'authorized' | 'denied' | 'notDetermined';

export type AlarmKitModuleEvents = {
  onAuthorizationChange: (state: { state: AlarmAuthorizationState }) => void;
};

export type ScheduleAlarmParams = {
  /** Pass an existing AlarmKit alarm UUID to re-schedule it in place; omit to create a new one. */
  alarmId?: string;
  hour: number;
  minute: number;
  /** bit0=월(1)…bit6=일(64). 0 = no repeat. */
  daysBitmask: number;
  title?: string;
  /** Filename already saved under App Group Library/Sounds. Omit for AlertSound.default. */
  soundFilename?: string;
  /** 0 disables snooze; otherwise the snooze interval in minutes. */
  snoozeMinutes?: number;
};
