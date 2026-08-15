// REFERENCE ONLY — not wired into any build target.
//
// A Notification Service Extension is a separate Xcode target (its own bundle id, Info.plist,
// entitlements) that must be added via Xcode's "File > New > Target" or by hand-editing the
// .xcodeproj/project.pbxproj. `expo prebuild` regenerates the ios/ directory from app.json and
// does not create NSE targets on its own — this needs a config plugin (withXcodeProject) or a
// manual Xcode step after prebuild. This file documents the exact parsing/save logic per
// spec-v1.1.md §1.5 so that step is a copy-paste, not a re-design.
//
// Requirements this file satisfies once wired into a real NSE target:
//   - Parse the push payload's custom keys: type, assignment_id, date, caf_url, caf_filename
//   - On type == "assignment_ready": download caf_url, save to App Group Library/Sounds/{caf_filename}
//   - Never attempt to reconfigure the AlarmKit alarm here — spec-v1.1.md §1.5: "NSE는 알람 재구성을
//     시도하지 않는다. 알람 사운드 재설정은 앱 포그라운드 진입 시 앱 책임."
//   - Show the notification regardless of download success/failure.
//
// The App Group id below must match AlarmKitModule.swift's `appGroupId` and app.json's
// ios.entitlements — currently CHANGEME pending team domain (spec-v1.1.md §7).

import UserNotifications

class NotificationService: UNNotificationServiceExtension {
  private static let appGroupId = "group.com.CHANGEME.voicealarm"

  var contentHandler: ((UNNotificationContent) -> Void)?
  var bestAttemptContent: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
    bestAttemptContent = content

    let userInfo = request.content.userInfo
    guard
      let type = userInfo["type"] as? String,
      type == "assignment_ready",
      let cafUrlString = userInfo["caf_url"] as? String,
      let cafUrl = URL(string: cafUrlString),
      let cafFilename = userInfo["caf_filename"] as? String
    else {
      // rerecord_required has no caf payload, or fields are missing — just show the alert as-is.
      contentHandler(content)
      return
    }

    let task = URLSession.shared.downloadTask(with: cafUrl) { [weak self] tempURL, _, _ in
      defer { contentHandler((self?.bestAttemptContent ?? content)) }
      guard let tempURL else { return }
      try? Self.saveToAppGroupSounds(tempFileURL: tempURL, filename: cafFilename)
    }
    task.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    if let contentHandler, let bestAttemptContent {
      contentHandler(bestAttemptContent)
    }
  }

  private static func saveToAppGroupSounds(tempFileURL: URL, filename: String) throws {
    guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      return
    }
    let soundsDir = containerURL.appendingPathComponent("Library/Sounds", isDirectory: true)
    try FileManager.default.createDirectory(at: soundsDir, withIntermediateDirectories: true)
    let destURL = soundsDir.appendingPathComponent(filename)
    if FileManager.default.fileExists(atPath: destURL.path) {
      try FileManager.default.removeItem(at: destURL)
    }
    try FileManager.default.moveItem(at: tempFileURL, to: destURL)
  }
}
