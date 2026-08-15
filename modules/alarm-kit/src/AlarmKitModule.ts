import { NativeModule, requireNativeModule } from 'expo';

import { AlarmAuthorizationState, AlarmKitModuleEvents, ScheduleAlarmParams } from './AlarmKitModule.types';

declare class AlarmKitModule extends NativeModule<AlarmKitModuleEvents> {
  requestAuthorization(): Promise<AlarmAuthorizationState>;
  getAuthorizationState(): AlarmAuthorizationState;

  /** Creates (or, with alarmId set, re-schedules) the app's single repeating alarm. Returns the alarm id. */
  scheduleDailyAlarm(params: ScheduleAlarmParams): Promise<string>;
  /** Re-schedules an existing alarm with a new sound file. params.alarmId is required. */
  updateAlarmSound(params: ScheduleAlarmParams): Promise<string>;
  cancelAlarm(alarmId: string): Promise<void>;

  /** Copies a locally-downloaded file into the App Group Library/Sounds container under `filename`. Returns the destination path. */
  saveSoundToAppGroup(sourceFilePath: string, filename: string): Promise<string>;
  appGroupSoundsDirectory(): string;
  /** Deletes voice_YYYYMMDD.caf files older than keepAfterDate (YYYY-MM-DD). Returns removed filenames. */
  cleanupOldSounds(keepAfterDate: string): Promise<string[]>;
}

export default requireNativeModule<AlarmKitModule>('AlarmKitModule');
