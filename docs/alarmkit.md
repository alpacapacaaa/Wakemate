# AlarmKit — 확인된 사실과 남은 검증

알람이 실제로 울리는 부분. 이 문서의 API 시그니처는 **Apple 공식 문서 JSON**
(`developer.apple.com/tutorials/data/documentation/alarmkit/…`)에서 2026-08-13에 직접 읽은 것이다.
기억으로 추측해 쓰지 말 것 — AlarmKit은 새 API라 학습 데이터에 잘못된 시그니처가 섞여 있다.

구현은 `frontend/modules/alarm-kit/`(로컬 Expo 모듈, Swift)이고 JS 쪽 사용은
`frontend/lib/alarm.ts`에 모여 있다.

---

## 확인된 시그니처

```swift
// 스케줄링
AlarmManager.shared.schedule<Metadata>(id: Alarm.ID, configuration: AlarmManager.AlarmConfiguration<Metadata>) async throws -> Alarm

AlarmManager.AlarmConfiguration<Metadata>.init(
  countdownDuration: Alarm.CountdownDuration? = nil,
  schedule: Alarm.Schedule? = nil,
  attributes: AlarmAttributes<Metadata>,
  stopIntent: (any LiveActivityIntent)? = nil,
  secondaryIntent: (any LiveActivityIntent)? = nil,
  sound: AlertConfiguration.AlertSound = .default   // ← ActivityKit 타입. import ActivityKit 필요
)

// 반복 스케줄
Alarm.Schedule.relative(Alarm.Schedule.Relative)
Alarm.Schedule.Relative.init(time: .Time, repeats: .Recurrence)
Alarm.Schedule.Relative.Time.init(hour: Int, minute: Int)
Alarm.Schedule.Relative.Recurrence.weekly([Locale.Weekday])   // .never 도 있음

// 사운드
AlertConfiguration.AlertSound.named(_ name: String) -> AlertConfiguration.AlertSound
AlertConfiguration.AlertSound.default

// 권한
AlarmManager.shared.requestAuthorization() async throws -> AlarmManager.AuthorizationState
AlarmManager.shared.authorizationState   // .authorized | .denied | .notDetermined

// UI
AlarmAttributes.init(presentation: AlarmPresentation, metadata: Metadata?, tintColor: Color)
AlarmPresentation.init(alert: .Alert, countdown: .Countdown?, paused: .Paused?)
AlarmButton.init(text: LocalizedStringResource, textColor: Color, systemImageName: String)
```

`import ActivityKit`이 없으면 `AlertConfiguration.AlertSound`를 찾지 못해 컴파일이 깨진다 — 실제로
겪었다.

---

## 빌드 전제: iOS SDK 26.1 이상

`AlarmPresentation.Alert`의 비-deprecated 초기화
`init(title:secondaryButton:secondaryButtonBehavior:)`는 **iOS 26.1에서 추가**됐고, deployment
target은 26.0이다. 그래서 코드가 `if #available(iOS 26.1, *)`로 두 경로를 모두 갖고 있고,
**SDK 26.1 미만(예: Xcode 26.0)에서는 26.1 쪽 심볼 자체가 없어 컴파일되지 않는다.**

팀 전원이 iOS SDK 26.1 이상을 포함한 Xcode를 써야 한다. 26.0 기기를 포기하기로 하면 deployment
target을 26.1로 올리고 분기와 deprecated 경로를 지울 수 있다.

### stop 버튼 카피는 26.1부터 앱이 정할 수 없다

| iOS | 사용 가능한 초기화 | stop 버튼 카피 |
|---|---|---|
| 26.0 | `init(title:stopButton:secondaryButton:secondaryButtonBehavior:)` **만** | 앱이 지정 가능 |
| 26.1+ | 위 초기화가 deprecated (`"stopButton is deprecated and will no longer be used"`) + `init(title:secondaryButton:secondaryButtonBehavior:)` 신설 | **앱이 지정 불가.** 시스템 기본 UI로 추정 |

어느 쪽이든 탭 동작은 `stopIntent`(앱 열기)로 연결된다. 26.1+ 기기에서 alert이 실제로 어떻게
렌더되는지는 아직 못 봤다.

---

## 실기기에서만 답이 나오는 것

**시뮬레이터 결과는 무효다.** 시뮬레이터는 예약을 받아주기 때문에 배선이 맞는지는 확인되지만, 울리는
행위 자체는 확인되지 않는다.

| # | 항목 | 결과 |
|---|---|---|
| 1 | 앱 번들에 포함한 `.caf`가 알람음으로 울리는가 | 미실행 |
| 2 | **런타임에 App Group `Library/Sounds`로 복사한 파일이 알람음으로 울리는가** | 미실행 — **판정 분기점** |
| 3 | 무음 스위치 ON + 집중 모드 ON에서도 울리는가 | 미실행 |
| 4 | 기기 재부팅 후 예약이 유지되는가 | 미실행 |
| 5 | 같은 alarm id로 `schedule`을 다시 호출하면 **교체**인가 에러인가 | 미실행 |
| 6 | 스누즈(`countdownDuration.postAlert`)가 실제로 다시 울리는가 | 미실행 |

**2번이 왜 분기점인가.** iOS 26.0에서 이 경로가 깨져 있었다는 보고가 여럿 있고(FB19779004 등) Apple이
"수정 예정"이라 답한 상태다. 현행 26.x에서 실제로 되는지가 설계를 가른다:

- **성공** → 지금 코드가 가정하는 경로 그대로. 알람음 = 그 사람이 녹음한 목소리 파일.
- **실패** → 알람음은 번들에 넣은 시드 사운드로 울리고, 그날의 진짜 목소리는 알람을 끄고 앱이 열린
  뒤 기상 화면에서 재생한다. `frontend/lib/alarm.ts`가 항상 시드를 넘기도록 바꾸면 되고 나머지
  플로우는 그대로다.

**5번이 틀리면** `cancel` → `schedule` 2단계로 바꿔야 한다. AlarmKit에 "사운드만 변경" API가 문서상
없어서 같은 id로 재-schedule 하는 것으로 갈음하고 있다.

### 테스트 방법

1. 아래 CHANGEME를 팀 계정으로 교체 (셋이 어긋나면 App Group 컨테이너 URL이 nil이 되어 파일 쓰기가
   **조용히** 실패한다)
2. `frontend/`에서 `npx expo prebuild --platform ios` → `npx pod-install` → Xcode로
   `ios/app.xcworkspace` 열기
3. 실기기(iOS 26.x) 실행 → 온보딩 → 목소리 녹음 → 알람 5분 뒤로 → 위 항목 확인

**`docs/fixtures/voice-sample.caf`** — 규격이 확실히 맞는 8초 파일(mono, 44.1kHz, Int16). 앱에서 녹음한
목소리가 울리지 않을 때 이걸 대신 넣어보면 **포맷 문제와 App Group 경로 문제를 구분할 수 있다.** 둘 다
안 울리면 경로(2번), 이것만 울리면 녹음 설정이다.

### CHANGEME — 실기기 전에 반드시

| 위치 | 현재 값 |
|---|---|
| `frontend/app.json` → `ios.bundleIdentifier` | `com.CHANGEME.voicealarm` |
| `frontend/app.json` → `ios.entitlements` App Group | `group.com.CHANGEME.voicealarm` |
| `frontend/modules/alarm-kit/ios/AlarmKitModule.swift` → `appGroupId` | `group.com.CHANGEME.voicealarm` |

`frontend/app.json`의 `scheme`(`voicealarm`)도 번들 ID와 함께 정해야 한다 — 초대 링크
`voicealarm://join/{CODE}`가 여기 걸려 있다.

---

## 알아둘 만한 구현 사실

- **요일 비트마스크는 bit0=월 … bit6=일.** `days == 0`은 "반복 없음"(1회성)이고 `.weekly([])`로
  표현한다.
- **알람 시각은 기기 로컬 벽시계**로만 다룬다. `Alarm.Schedule.Relative`는 문서상 기기 시간대 기준이다.
- **네이티브 경계 앞에서 시각 문자열을 검증한다** (`frontend/lib/time.ts`의 `parseAlarmTime`).
  `Number("string")` → `NaN`이 네이티브 `Int?`로 넘어가면 ExpoModulesCore의 숫자 캐스트 어서션이 터져
  **앱이 SIGTRAP으로 하드 크래시**한다. JS 예외는 복구 가능하지만 네이티브 어서션은 아니다.
- **앱이 추적을 놓친 알람은 아무도 끌 수 없다.** `cancelOrphanedAlarms`가 실행 시 `listAlarmIds()`와
  저장된 id를 비교해 정리한다.
- **App Group의 음성 파일이 아직 누적된다.** `cleanupOldSounds`를 JS에서 아무도 부르지 않고, 파일명
  규칙도 어긋나 있다 (JS는 `voice_<base36>.caf`, Swift는 `voice_YYYYMMDD.caf` 8자리만 인식).
