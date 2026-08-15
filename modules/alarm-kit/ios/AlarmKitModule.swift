import ExpoModulesCore
import ActivityKit // AlertConfiguration.AlertSound — AlarmConfiguration's `sound` parameter type
import AlarmKit
import AppIntents
import SwiftUI

// MARK: - Metadata

// AlarmMetadata requires only Decodable & Encodable & Hashable & Sendable and is
// explicitly documented as allowed to be empty when no custom alarm-UI data is needed:
// https://developer.apple.com/documentation/alarmkit/alarmmetadata
struct VoiceAlarmMetadata: AlarmMetadata {}

// MARK: - Stop button App Intent

// Opens the app when the alarm's stop button is tapped, so the app can show which friend's voice
// just rang. LiveActivityIntent + openAppWhenRun has been stable since iOS 17 (ActivityKit), so
// this part is lower-risk than the AlarmKit-specific APIs below. Still UNVERIFIED against a real
// AlarmKit alert on-device — confirm in Spike #1 that Stop actually foregrounds the app.
struct VoiceAlarmStopIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "일어났어요"
  static var openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

// Snooze. AlarmKit drives the re-alert itself from `countdownDuration.postAlert`; the intent only
// needs to exist so the secondary button has something to run, and must NOT open the app.
struct VoiceAlarmSnoozeIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "다시 울림"
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    return .result()
  }
}

// MARK: - Errors

enum AlarmKitModuleError: Error, CustomStringConvertible {
  case invalidAlarmId(String)
  case appGroupContainerUnavailable(String)
  case fileOperationFailed(String)

  var description: String {
    switch self {
    case .invalidAlarmId(let id): return "Invalid alarm id: \(id)"
    case .appGroupContainerUnavailable(let groupId): return "App Group container unavailable for \(groupId)"
    case .fileOperationFailed(let message): return message
    }
  }
}

// MARK: - Module

public class AlarmKitModule: Module {
  // App Group ID — must match spec-v1.1.md §3 (팀 도메인 확정 전까지 CHANGEME).
  // Kept in sync with app.json ios.entitlements "com.apple.security.application-groups" by the
  // app config (see app.config.ts). If these two ever diverge, file writes will silently fail
  // because the container URL will resolve to nil.
  private static let appGroupId = "group.com.CHANGEME.voicealarm"

  public func definition() -> ModuleDefinition {
    Name("AlarmKitModule")

    Events("onAuthorizationChange")

    // MARK: Authorization

    AsyncFunction("requestAuthorization") { () -> String in
      let state = try await AlarmManager.shared.requestAuthorization()
      return Self.authorizationStateToString(state)
    }

    Function("getAuthorizationState") { () -> String in
      return Self.authorizationStateToString(AlarmManager.shared.authorizationState)
    }

    // MARK: Scheduling
    //
    // NOTE on stop-button copy: AlarmPresentation.Alert.init(title:stopButton:secondaryButton:secondaryButtonBehavior:)
    // was deprecated in iOS 26.1 ("stopButton is deprecated and will no longer be used" — confirmed
    // via Apple's live doc JSON on 2026-08-13). We therefore use the non-deprecated
    // init(title:secondaryButton:secondaryButtonBehavior:), which has NO stopButton parameter.
    // This means the spec's custom stop-button label ("일어났어요") may no longer be settable through
    // AlarmPresentation.Alert on current (26.1+) devices — the system may render its own fixed stop
    // control instead, with the actual tap-behavior wired via `stopIntent` below regardless of label.
    // UNVERIFIED on real device — flag in SPIKE.md and re-check Xcode 26 headers/release notes.
    AsyncFunction("scheduleDailyAlarm") { (params: ScheduleAlarmParams) -> String in
      return try await Self.scheduleAlarm(params: params)
    }

    // Re-schedules the same alarm id with a new sound file. AlarmKit exposes no dedicated
    // "update sound" call — `schedule(id:configuration:)` is documented as the single entry point,
    // so re-invoking it with the existing id is the only mechanism found in the docs to swap the
    // alarm's sound after the night prefetch downloads a new .caf. UNVERIFIED that this actually
    // replaces (vs. errors on) an already-scheduled alarm — confirm in Spike #1.
    AsyncFunction("updateAlarmSound") { (params: ScheduleAlarmParams) -> String in
      guard params.alarmId != nil else {
        throw AlarmKitModuleError.fileOperationFailed("alarmId required for update")
      }
      return try await Self.scheduleAlarm(params: params)
    }

    AsyncFunction("cancelAlarm") { (alarmId: String) in
      guard let uuid = UUID(uuidString: alarmId) else {
        throw AlarmKitModuleError.invalidAlarmId(alarmId)
      }
      try AlarmManager.shared.cancel(id: uuid)
    }

    // MARK: App Group file storage (Library/Sounds)
    //
    // spec-v1.1.md §3: caf 저장 경로 = App Group 컨테이너 `/Library/Sounds/{caf_filename}`.
    // Filenames are server-assigned (voice_YYYYMMDD.caf) — never invented client-side.

    AsyncFunction("saveSoundToAppGroup") { (sourceFilePath: String, filename: String) -> String in
      let destURL = try Self.soundsDirectoryURL().appendingPathComponent(filename)
      let sourceURL = URL(fileURLWithPath: sourceFilePath)

      if FileManager.default.fileExists(atPath: destURL.path) {
        try FileManager.default.removeItem(at: destURL)
      }
      try FileManager.default.copyItem(at: sourceURL, to: destURL)
      return destURL.path
    }

    Function("appGroupSoundsDirectory") { () -> String in
      return try Self.soundsDirectoryURL().path
    }

    // Deletes cached .caf files whose date-derived filename is older than `keepAfterDate`
    // (YYYY-MM-DD), per spec-v1.1.md §1.5: "배정일 +2일 지난 caf를 로컬에서도 정리." Bundle seed
    // files (seed_01.caf..) are never touched — only files matching voice_YYYYMMDD.caf.
    AsyncFunction("cleanupOldSounds") { (keepAfterDate: String) -> [String] in
      let dir = try Self.soundsDirectoryURL()
      let files = try FileManager.default.contentsOfDirectory(atPath: dir.path)
      var removed: [String] = []
      for file in files {
        guard let date = Self.extractDate(fromVoiceFilename: file), date < keepAfterDate else { continue }
        try? FileManager.default.removeItem(at: dir.appendingPathComponent(file))
        removed.append(file)
      }
      return removed
    }
  }

  // MARK: - Helpers

  private static func scheduleAlarm(params: ScheduleAlarmParams) async throws -> String {
    guard let hour = params.hour, let minute = params.minute else {
      throw AlarmKitModuleError.fileOperationFailed("hour/minute required")
    }

    // days == 0 means "no repeat" — a one-shot alarm, which `.weekly([])` expresses.
    let weekdays: [Locale.Weekday] = Self.weekdays(fromBitmask: params.daysBitmask)

    let schedule = Alarm.Schedule.relative(
      Alarm.Schedule.Relative(
        time: Alarm.Schedule.Relative.Time(hour: hour, minute: minute),
        repeats: .weekly(weekdays)
      )
    )

    // Snooze is expressed as a secondary button whose behavior is `.countdown`; AlarmKit then
    // re-alerts after `countdownDuration.postAlert` seconds on its own.
    let snoozeSeconds = params.snoozeMinutes > 0 ? TimeInterval(params.snoozeMinutes * 60) : nil
    let snoozeButton = snoozeSeconds == nil
      ? nil
      : AlarmButton(text: "\(params.snoozeMinutes)분 뒤에", textColor: .white, systemImageName: "zzz")

    // The stopButton parameter exists in iOS 26.0 and is deprecated in 26.1
    // ("stopButton is deprecated and will no longer be used"). Since the deployment target is
    // 26.0, both forms are needed: on 26.0 the deprecated init is the ONLY one available, and it
    // is what lets us set the stop-button copy. On 26.1+ the system renders its own stop control.
    let title = LocalizedStringResource(stringLiteral: params.title)
    let alert: AlarmPresentation.Alert
    if #available(iOS 26.1, *) {
      alert = AlarmPresentation.Alert(
        title: title,
        secondaryButton: snoozeButton,
        secondaryButtonBehavior: snoozeButton == nil ? nil : .countdown
      )
    } else {
      alert = AlarmPresentation.Alert(
        title: title,
        stopButton: AlarmButton(text: "일어났어요", textColor: .white, systemImageName: "sun.max.fill"),
        secondaryButton: snoozeButton,
        secondaryButtonBehavior: snoozeButton == nil ? nil : .countdown
      )
    }
    let presentation = AlarmPresentation(alert: alert, countdown: nil, paused: nil)
    let attributes = AlarmAttributes<VoiceAlarmMetadata>(
      presentation: presentation,
      metadata: VoiceAlarmMetadata(),
      tintColor: Color.accentColor
    )

    let sound: AlertConfiguration.AlertSound = params.soundFilename.map { .named($0) } ?? .default

    // Using the full initializer rather than the `.alarm(...)` convenience because snooze needs
    // `countdownDuration.postAlert` — documented as "the duration applied after the alarm has
    // alerted at least once and moves back to the countdown state", i.e. the snooze interval.
    let configuration = AlarmManager.AlarmConfiguration<VoiceAlarmMetadata>(
      countdownDuration: snoozeSeconds.map { Alarm.CountdownDuration(preAlert: nil, postAlert: $0) },
      schedule: schedule,
      attributes: attributes,
      stopIntent: VoiceAlarmStopIntent(),
      secondaryIntent: snoozeSeconds == nil ? nil : VoiceAlarmSnoozeIntent(),
      sound: sound
    )

    let alarmId = params.alarmId.flatMap { UUID(uuidString: $0) } ?? UUID()
    let alarm = try await AlarmManager.shared.schedule(id: alarmId, configuration: configuration)
    return alarm.id.uuidString
  }

  private static func soundsDirectoryURL() throws -> URL {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      throw AlarmKitModuleError.appGroupContainerUnavailable(appGroupId)
    }
    let soundsURL = containerURL.appendingPathComponent("Library/Sounds", isDirectory: true)
    if !FileManager.default.fileExists(atPath: soundsURL.path) {
      try FileManager.default.createDirectory(at: soundsURL, withIntermediateDirectories: true)
    }
    return soundsURL
  }

  private static func authorizationStateToString(_ state: AlarmManager.AuthorizationState) -> String {
    switch state {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .notDetermined: return "notDetermined"
    @unknown default: return "notDetermined"
    }
  }

  // bit0=월(1)...bit6=일(64) — spec-v1.1.md §1.2
  private static func weekdays(fromBitmask mask: Int) -> [Locale.Weekday] {
    var days: [Locale.Weekday] = []
    if mask & 1 != 0 { days.append(.monday) }
    if mask & 2 != 0 { days.append(.tuesday) }
    if mask & 4 != 0 { days.append(.wednesday) }
    if mask & 8 != 0 { days.append(.thursday) }
    if mask & 16 != 0 { days.append(.friday) }
    if mask & 32 != 0 { days.append(.saturday) }
    if mask & 64 != 0 { days.append(.sunday) }
    return days
  }

  // "voice_20260814.caf" -> "2026-08-14"
  private static func extractDate(fromVoiceFilename filename: String) -> String? {
    guard filename.hasPrefix("voice_"), filename.hasSuffix(".caf") else { return nil }
    let digits = filename.dropFirst("voice_".count).dropLast(".caf".count)
    guard digits.count == 8 else { return nil }
    let y = digits.prefix(4)
    let m = digits.dropFirst(4).prefix(2)
    let d = digits.dropFirst(6).prefix(2)
    return "\(y)-\(m)-\(d)"
  }
}

// MARK: - Records

struct ScheduleAlarmParams: Record {
  @Field var alarmId: String?
  @Field var hour: Int?
  @Field var minute: Int?
  /** bit0=월(1)…bit6=일(64). 0 = no repeat. */
  @Field var daysBitmask: Int = 127
  @Field var title: String = "알람"
  @Field var soundFilename: String?
  /** 0 disables snooze; otherwise the snooze interval in minutes. */
  @Field var snoozeMinutes: Int = 0
}
