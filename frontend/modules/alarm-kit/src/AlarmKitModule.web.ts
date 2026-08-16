import { registerWebModule, NativeModule } from 'expo';

import { AlarmKitModuleEvents } from './AlarmKitModule.types';

// AlarmKit is iOS 26+ only (기술 전제, 변경 금지 — spec-v1.1.md). Every method throws on web
// so callers fail loudly in dev/web preview instead of silently no-op'ing.
class AlarmKitModule extends NativeModule<AlarmKitModuleEvents> {
  private unsupported(): never {
    throw new Error('AlarmKitModule is only available on iOS 26+.');
  }

  requestAuthorization = () => this.unsupported();
  getAuthorizationState = () => this.unsupported();
  scheduleDailyAlarm = () => this.unsupported();
  updateAlarmSound = () => this.unsupported();
  cancelAlarm = () => this.unsupported();
  saveSoundToAppGroup = () => this.unsupported();
  appGroupSoundsDirectory = () => this.unsupported();
  cleanupOldSounds = () => this.unsupported();
}

export default registerWebModule(AlarmKitModule, 'AlarmKitModule');
