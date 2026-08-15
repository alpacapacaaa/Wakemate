Pod::Spec.new do |s|
  s.name           = 'AlarmKitModule'
  s.version        = '1.0.0'
  s.summary        = 'Native AlarmKit bridge for voice alarm scheduling and App Group sound file management'
  s.description    = 'Wraps AlarmKit (iOS 26+) to schedule/update the app\'s single repeating alarm and to move downloaded .caf files into the App Group Library/Sounds container.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # AlarmKit requires iOS 26+ (see spec-v1.1.md — 기술 전제, 변경 금지). No tvOS: AlarmKit is not
  # available there and this module is iOS-only.
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # NotificationServiceExtension-reference/ holds a reference implementation for a separate NSE
  # Xcode target. It must not be compiled into this module — see the file's header comment.
  s.source_files         = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.exclude_files        = "NotificationServiceExtension-reference/**/*"
end
