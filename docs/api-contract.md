**실 구현은 §9 「구현 순서」부터 읽으면 됩니다.** 만들 것만 모은 작업 시트는 `api-implement.md`.

---

## 1. 먼저 읽을 것: 서버는 아무것도 울리지 않는다

**알람 스케줄링, 스누즈 처리, "07:00에 알림 보내기"를 만들지 말 것.**
클라이언트가 이미 다 처리함.

### 서버가 주고받아서는 안 되는 필드

| 필드 | 이유 |
| --- | --- |
| `Room.nativeAlarmId` | **이 기기에서의** AlarmKit 알람 id. 다른 어디서도 의미가 없음. |
| `Member.voiceSoundName` | **이 기기에서의** 오디오 파일명. 서버는 URL을 주고, 파일명은 클라이언트가 정함. |
| `PersonalAlarm.*` | 방 없는 알람. 완전히 로컬이고 폰을 떠나지 않음. |

---

## 2. 서버로 옮겨야 하는 규칙 하나

지금은 클라이언트가 예약 시점에 무작위로 목소리를 고른다(`lib/store.ts`의 `pickVoiceFor`). 두 가지로
틀렸고 서버만 고칠 수 있다.

- **기기마다 따로 뽑는다.** 누가 누구를 깨웠는지에 대해 아무도 같은 답을 갖지 않는다.
- **공개되는 목소리가 실제로 울린 목소리와 다르다.** 알람은 A로 예약됐는데 기상 화면이 다시 뽑아
  B를 공개할 수 있다. 클라이언트가 혼자 고칠 수 없다 — AlarmKit은 며칠 전에 파일명을 확정해야 하고,
  그래서 선택이 **미리 내려져 고정되어 있어야** 한다.

**서버가 `(room, member, date)`마다 어느 멤버의 목소리가 울릴지 정하고, 한 번 정한 것은 바꾸지 않는다.**
클라이언트는 앞으로 며칠치를 받아 예약한다.

규칙: **녹음을 마쳤고 내가 아닌** 멤버 중 균등 랜덤. v1 필수는 아니지만 있으면 좋은 것 — 어제와 같은
사람은 피한다.

### 미리 만들지 말고 요청받을 때 만든다

**크론을 만들지 말 것.** `GET /rooms/{id}/assignments`가 들어왔을 때 요청된 날짜 범위를 훑어서, 배정이
없는 날짜만 그 자리에서 뽑아 저장하고 전부 반환하면 된다.

```
for date in [from ... from+days):
    row = SELECT * FROM assignment WHERE room_id=? AND member_id=? AND date=?
    if not row:
        row = 뽑아서 INSERT  (유니크 제약이 경쟁 조건을 막는다 → §8)
    결과에 담기
```

이 방식이 중요한 이유는 두 가지.

- **서버가 "지금 몇 시인지" 몰라도 된다.** 날짜는 클라이언트가 `from`으로 준다. 사용자 시간대를
  저장할 필요도, 자정에 무언가 돌릴 필요도 없다.
- **아무도 요청하지 않은 방의 배정을 만들지 않는다.**

이미 만들어진 배정을 **다시 뽑아서는 안 된다.** 그 순간 기상 화면이 거짓말을 한다.

한 가지 받아들이는 대가: 배정 시점에 녹음을 안 했던 사람은 그날 배정 대상에서 빠졌고, 나중에 녹음해도
그 날짜는 바뀌지 않는다. 다음 날부터 포함된다.

---

## 3. 타입

JSON, camelCase, `lib/model.ts`와 같은 모양. 시각은 **기기 로컬 벽시계**이고 UTC가 아니다 — 07:00은
폰이 어디 있든 07:00이다.

```jsonc
// AlarmSchedule — 한 사람의, 한 방에서의 기상 설정
{
  "time": "07:00",          // "HH:MM", 24시간, 로컬 벽시계
  "days": 31,               // 비트마스크. bit0=월 … bit6=일. 31=평일, 127=매일, 0=반복 없음(1회성)
  "enabled": true,
  "snoozeEnabled": true,
  "snoozeMinutes": 9        // 5 | 9 | 10 | 15 중 하나
}
```

```jsonc
// Member — 방 안의 누구에게나 이렇게 보인다
{
  "id": "usr_01H…",
  "name": "Sam",
  "voiceUrl": "https://…/voice/usr_01H….caf",  // 녹음 전에는 null
  "voiceDurationMs": 7400,                      // 녹음 전에는 null
  "voiceUpdatedAt": "2026-08-15T09:12:00Z",     // 다시 내려받을 시점을 판단하는 근거
  "alarm": { /* AlarmSchedule */ }               // 설정하지 않았으면 null
}
```

```jsonc
// Room — 최대 5명
{
  "id": "rm_01H…",
  "name": "Study crew",
  "code": "K7QM3P",                         // 6자, 0/O/1/I 제외 — 소리내어 읽고 타이핑하는 값
  "codeExpiresAt": "2026-08-17T09:00:00Z",  // 발급 후 7일. 방장이 재발급 가능
  "ownerId": "usr_01H…",                    // 만든 사람. 강퇴·재발급·이관을 할 수 있는 유일한 멤버
  "createdAt": "2026-08-10T…Z",
  "members": [ /* Member */ ]               // 참여 순서
}
```

```jsonc
// WakeRecord — 한 사람, 한 아침, 한 방
{
  "roomId": "rm_01H…",
  "date": "2026-08-15",              // YYYY-MM-DD, 일어난 사람의 로컬 날짜
  "memberId": "usr_01H…",
  "wokeAt": "2026-08-15T06:58:00",   // 로컬, 시간대 접미사 없음 — 벽시계다
  "wokenByMemberId": "usr_01H…"      // 기본 사운드로 울렸으면 null
}
```

### 에러 응답

성공이 아닌 모든 응답은 같은 모양이다. 클라이언트가 상태 코드만으로 문구를 정하는 곳이 있어서
(410 vs 404) **상태 코드가 message보다 중요하다.**

```jsonc
{ "code": "CODE_EXPIRED", "message": "이 초대 코드는 만료됐습니다" }
```

`code`는 기계가 분기하는 값, `message`는 사람이 읽는 값이다. 최소한 이만큼:

| 상태 | code | 언제 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 토큰 없음·잘못됨 |
| 403 | `NOT_OWNER` | 방장만 가능한 동작 |
| 404 | `NOT_FOUND` | 그런 방·코드가 없거나, 내가 그 방에 없음 |
| 409 | `ROOM_FULL` | 정원 5명 초과 |
| 409 | `ALREADY_MEMBER` | 이미 그 방에 있음 |
| 409 | `OWNER_MUST_TRANSFER` | 방장이 후임 없이 나가려 함 |
| 410 | `CODE_EXPIRED` | 코드가 만료됨 |
| 413 | `FILE_TOO_LARGE` | 목소리 파일이 너무 큼 |
| 415 | `UNSUPPORTED_FORMAT` | 알람으로 울릴 수 없는 포맷 |

---

## 4. 인증 — v1에는 로그인이 없다

기기가 한 번 등록하고 토큰을 보관한다. 돌려받은 `userId`가 모든 곳의 `Member.id`다.

```
POST  /me                 { } → { userId, token }
PATCH /me                 { name } → Me
```

이름은 온보딩에서 사용자가 직접 입력하므로, `POST /me`는 이름 없는 유저를 만들고 곧바로 `PATCH`가
따라온다.

이후 모든 요청은 `Authorization: Bearer <token>`을 붙인다.

**토큰은 만료되지 않아야 한다.** 클라이언트에 갱신 경로가 없기 때문에, 만료되면 사용자는 방과 기록을
잃고 복구할 방법이 없다. 랜덤 128비트 이상을 DB에 저장하는 불투명 토큰으로 충분하다. JWT를 쓸 이유가
없다 — 폐기할 방법이 필요하고, 유저 수가 적다.

재설치하면 계정이 사라진다. 알고 받아들인 대가다(`docs/MVP.md`). 나중에 Sign in with Apple을 붙일 때
**이렇게 만들어진 유저에 붙일 수 있어야** 하므로, user 행을 특정 인증 수단에 묶지 말 것.

---

## 5. 엔드포인트

### 방

```
GET    /rooms                        → Room[]        // 내가 속한 방 전부, 멤버까지
POST   /rooms                        { name } → Room  // 만든 사람이 ownerId, 기본 07:00 평일
POST   /rooms/join                   { code } → Room  // 404 없음 / 410 만료 / 409 정원·중복
PATCH  /rooms/{id}                   { name } → Room
POST   /rooms/{id}/code              → { code, codeExpiresAt }   // 재발급. 방장 아니면 403
PUT    /rooms/{id}/owner             { memberId } → Room          // 이관. 방장 아니면 403
DELETE /rooms/{id}/members/me        → 204            // 나가기. 방장이 후임 없이 나가면 409
DELETE /rooms/{id}/members/{id}      → 204            // 강퇴. 방장 아니면 403
```

`GET /rooms`가 **포그라운드 갱신 경로**다. 푸시가 없으므로 앱은 이 응답으로만 세상의 변화를 안다.

`POST /rooms/join`이 클라이언트가 가장 기다리는 것이다. 지금 `store.joinRoomByCode`는 같은 코드를 가진
**로컬** 방을 만드는 것으로 흉내만 내고 있어서, 같은 코드를 넣은 두 폰이 서로 무관한 두 방이 된다.
**이게 진짜로 동작하기 전까지 이 제품의 어느 부분도 동작하지 않는다.**

**정원은 5명.** 6번째 참여는 409. 참여할 때만 검사하면 되고 다른 곳은 몰라도 된다.

**초대 코드는 발급 후 7일에 만료된다**(`codeExpiresAt`). 만료된 코드는 **410**이고 404와 구분해야 한다 —
"코드가 만료됐어요"와 "그런 방이 없어요"는 코드를 입력하는 사람에게 전혀 다른 문제다. 재발급은 방장만.

코드 생성: 32자 알파벳 6자리(약 10억 가지)라 충돌이 드물지만 0은 아니다. **활성 방 사이에서 유니크**해야
하고, INSERT가 유니크 제약에 걸리면 다시 뽑아 재시도하면 된다(몇 번 이상 실패하면 500). 만료된 방의
코드는 재사용해도 된다.

**방장.** 만든 사람이 `ownerId`이고, 강퇴·코드 재발급·이관을 할 수 있는 유일한 멤버다.

**이관은 저절로 일어나지 않는다.** 나가려는 방장은 `PUT /rooms/{id}/owner`로 후임을 먼저 지정해야 하고,
그러지 않으면 `DELETE .../members/me`가 **409**로 거부한다. 예외는 하나 — 방장이 마지막 한 명이면 그냥
나가고 방은 삭제된다. 이관을 별도 오퍼레이션으로 둔 덕에 **나가지 않고 방장만 넘기는 것**도 된다.

**강퇴·탈퇴된 사람이 보는 것.** v1에 푸시가 없으므로 그 폰은 다음에 물어볼 때(포그라운드의
`GET /rooms`)에야 안다. 그 시점부터 그 방은 목록에 **없어야** 하고, 개별 엔드포인트는 그 유저에게
**403 또는 404**로 답해야 한다. 그러면 앱이 로컬에서 방을 지우고 알람을 취소한다. 그 전까지 그 폰은 그
방 알람을 한 번 더 울릴 수 있다 — 알고 받아들인 대가고, 그래서 문구보다 **일관되게 사라지는 것**이
중요하다.

### 내 스케줄

```
PUT /rooms/{id}/members/me/alarm     { AlarmSchedule } → Member
```

엔드포인트 하나, 객체 전체, 멱등. 클라이언트는 항상 전체 스케줄을 손에 들고 있으니 PATCH는 어긋날
방법만 늘린다.

다른 멤버의 스케줄은 내게 **읽기 전용**이다. 방은 모두의 시각을 보여주지만 남의 알람을 옮길 수 있는
사람은 없다.

### 목소리

```
POST /me/voice            multipart: file (.caf), durationMs → { voiceUrl, voiceUpdatedAt }
GET  {voiceUrl}                                              → .caf 바이트
```

**오디오는 왕복해도 iOS가 알람으로 울릴 수 있는 포맷이어야 한다.** 여기가 가장 틀어지기 쉽다.

- 클라이언트가 올리는 것: **CAF(.caf), 16-bit linear PCM, mono, 44.1 kHz**
- iOS 알람음이 받는 것: **PCM / µ-law / a-law**를 담은 **.caf, .aiff, .wav만**, **최대 30초**.
  녹음은 클라이언트에서 10초로 제한된다.
- **mp3나 AAC로 변환하지 말 것.** 일반 플레이어에서는 잘 들리고 **알람음으로는 조용히 거부된다.**
  실제로 이 실수 때문에 목소리로 울리지 않던 시기가 있었다.
- 크기: 6.5초에 578 KB로 측정(약 90 KB/s). 하나에 900 KB 정도로 잡으면 된다. 저장할 때 압축하는 것은
  `voiceUrl`이 내려주는 바이트가 PCM이면 상관없다.

**목소리 한 사람당 하나이고 교체된다.** 매일 녹음하는 것이 아니다. 다시 올리면 그 사람이 속한 모든 방에
그대로 쓰이고, `voiceUpdatedAt`이 갱신된다. 이전 파일은 지워도 되지만, **이미 폰에 내려간 사본은 그대로
남아 있다** — 상대의 알람은 그 폰이 다음에 새 파일을 받아 재예약할 때 바뀐다(푸시가 없으니 최대 하루).

**`voiceUrl`은 같은 Bearer 토큰으로 인증한다.** 서명된 공개 URL이 아니다.

- 이건 실제 사람의 목소리 녹음이라 URL을 알면 누구나 듣는 상태로 두면 안 된다.
- 클라이언트는 이 URL을 `Authorization` 헤더와 함께 받아 App Group에 넣는다. 서버가 헤더 없는 요청을
  받아주는지 여부를 **클라이언트가 추측하게 두면 안 된다** — 틀리면 알람이 조용히 기본음으로 울린다.
- 접근 권한: **나와 방을 공유하는 사람의 목소리만.** 아무 `userId`의 목소리나 받아갈 수 있으면 안 된다.
- 편하면 `GET /voice/{userId}`처럼 우리 도메인 경로로 내려도 되고, 객체 스토리지를 쓰면 짧은 수명의
  서명 URL을 `voiceUrl`에 담아도 된다. 후자로 갈 경우 **`voiceUpdatedAt`은 서명이 바뀌어도 그대로**여야
  한다 — 클라이언트가 이 값으로 다시 받을지 결정하기 때문에, 매번 달라지면 매번 다시 내려받는다.

### 내일의 목소리

```
GET /rooms/{id}/assignments?from=2026-08-15&days=7
  → [ { "date": "2026-08-15", "wokenByMemberId": "usr_…", "voiceUrl": "https://…" }, … ]
```

클라이언트는 일주일치를 미리 예약하고, 각 `voiceUrl`을 한 번 내려받아 App Group에 넣어 AlarmKit이
오프라인에서 재생할 수 있게 한다. 만드는 시점과 고정 규칙은 §2에 있다.

방에 녹음한 사람이 아무도 없으면 `wokenByMemberId: null`을 주면 된다. 클라이언트가 시스템 기본
알람음으로 폴백한다.

### 모닝 로그

```
POST /rooms/{id}/wakes    { date, wokeAt, wokenByMemberId } → WakeRecord
GET  /rooms/{id}/wakes?from=2026-08-09&to=2026-08-15        → WakeRecord[]
```

`POST`는 사람이 **"일어났어요"**를 누를 때 쓰인다. 알람이 울린 뒤 몇 분 지나서일 수도 있고
**오프라인일 수도 있다** — 과거의 `wokeAt`을 받아주고, `(room, member, date)`에 대해 멱등이어야 한다.
재시도가 두 번째 아침을 만들면 안 된다.

**나가거나 강퇴되면 그 방에서의 그 사람 기록을 지운다.** 그 사람의 `WakeRecord`를 삭제하고, 그 사람을
가리키던 남은 사람들의 `wokenByMemberId`를 `null`로 만든다. 방에 없는 id를 가리키는 기록은 클라이언트가
그릴 수 없다. 대가는 받아들인 것이다 — 남은 사람에게 그 아침은 "기본 사운드로 깼다"와 구분되지 않는다.
묘비 이름을 대신 넣지 말 것. 흔적을 남기지 않기로 한 결정이다.

### 안전과 계정 — 심사 요건에서 온 것들

```
DELETE /me                       계정 삭제 (5.1.1(v))
POST   /me/blocks/{userId}       차단 — 다음 배정부터 양방향 제외
DELETE /me/blocks/{userId}       차단 해제
POST   /reports                  { memberId, roomId } 신고 접수 → 201
```

처음 범위에서는 "친구 사이라 불필요"로 뺐지만, 심사 기준 1.2가 사용자 녹음이 남에게 전달되는 앱에
신고·차단을 요구한다 (`MVP.md`).

- **차단은 배정에서 양방향으로 뺀다** — 그 사람 목소리가 나를 깨우지 않고, 내 목소리도 그 사람을
  깨우지 않는다. 이미 만들어진 배정은 §2의 고정 규칙대로 두고 다음 배정부터 반영한다.
- **신고는 저장하고 사람이 본다.** 자동 조치는 v1에 없다.
- **계정 삭제는 전부 지운다** — 유저, 멤버십, 기상 기록, 목소리 파일. 방장인 방은 나가기와 같은
  규칙(가장 오래된 멤버에게 이관, 혼자면 삭제)을 따른다. 나가기의 409와 달리 여기서는 서버가 알아서
  이관한다 — 계정을 지우려는 사람에게 방 정리를 시킬 수는 없다.

### 푸시 — **v1 아님**

만들지 말 것(`docs/MVP.md`). 클라이언트에 토큰 등록 경로가 없고 `expo-notifications`도 제거했다.

나중에 붙일 때도 데이터를 최신으로 유지하는 용도이며 **무언가를 울리는 데 쓰지 않는다.**

---

## 6. 오프라인은 예외가 아니라 정상이다

이 앱은 07:00에 폰을 엎어놓은 상태로 쓰인다. 모든 쓰기가 늦게, 순서 뒤바뀌어 도착할 수 있다고 가정할 것.

- 기상 기록은 `(room, member, date)`에 멱등 — 위 참조
- 스케줄 PUT은 멤버 단위 last-write-wins. 한 기기만 편집하므로 괜찮다
- 네트워크가 없으면 클라이언트는 로컬 사본만으로 계속 동작한다. **알람은 서버에 아무것도 의존하지
  않는다**

---

## 7. 해피패스 — 두 대의 폰, 한 방, 하루 아침

이 순서대로 되면 v1은 동작한다. `$A`, `$B`는 두 기기의 토큰이다.

**1. 두 기기가 각각 등록하고 이름을 넣는다**

```bash
curl -X POST $API/me
# → { "userId": "usr_A", "token": "..." }
curl -X PATCH $API/me -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' -d '{"name":"지수"}'
```

**2. A가 방을 만든다** — 만든 사람이 방장, 기본 스케줄 07:00 평일

```bash
curl -X POST $API/rooms -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' -d '{"name":"Study crew"}'
# → { "id":"rm_1", "code":"K7QM3P", "codeExpiresAt":"...", "ownerId":"usr_A",
#     "members":[{ "id":"usr_A", "alarm":{...} }] }
```

**3. B가 코드로 참여한다** — 이게 되면 제품이 성립한다

```bash
curl -X POST $API/rooms/join -H "Authorization: Bearer $B" \
  -H 'Content-Type: application/json' -d '{"code":"K7QM3P"}'
# → 같은 rm_1, members 2명
```

**4. 각자 자기 시각을 정한다** — B는 08:30

```bash
curl -X PUT $API/rooms/rm_1/members/me/alarm -H "Authorization: Bearer $B" \
  -H 'Content-Type: application/json' \
  -d '{"time":"08:30","days":31,"enabled":true,"snoozeEnabled":true,"snoozeMinutes":9}'
```

**5. 각자 목소리를 올린다**

```bash
curl -X POST $API/me/voice -H "Authorization: Bearer $A" \
  -F file=@voice.caf -F durationMs=7400
# → { "voiceUrl": "...", "voiceUpdatedAt": "..." }
```

**6. 각자 일주일치 배정을 받는다** — A는 B 목소리로, B는 A 목소리로

```bash
curl "$API/rooms/rm_1/assignments?from=2026-08-18&days=7" -H "Authorization: Bearer $A"
# → [ { "date":"2026-08-18", "wokenByMemberId":"usr_B", "voiceUrl":"..." }, ... ]
```

**같은 요청을 다시 보내면 같은 답이 와야 한다.** 여기서 다른 답이 오면 기상 화면이 거짓말을 한다 —
이게 가장 중요한 테스트다.

**7. 각자 `.caf`를 내려받는다** — 토큰을 붙여야 한다

```bash
curl "$VOICE_URL" -H "Authorization: Bearer $A" -o voice.caf
file voice.caf   # CoreAudio 여야 한다
```

**8. 아침에 각자 "일어났어요"를 누른다**

```bash
curl -X POST $API/rooms/rm_1/wakes -H "Authorization: Bearer $A" \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-08-18","wokeAt":"2026-08-18T06:58:00","wokenByMemberId":"usr_B"}'
# 같은 요청을 두 번 보내도 기록은 하나여야 한다
```

**9. 양쪽이 같은 로그를 본다** — 이게 이 앱의 산출물이다

```bash
curl "$API/rooms/rm_1/wakes?from=2026-08-18&to=2026-08-18" -H "Authorization: Bearer $B"
# → 두 사람의 기록 모두
```

9번에서 상대의 기록이 보이면 **완료 기준을 통과한 것**이다(`docs/MVP.md`).

---

## 8. 테이블

컬럼 이름은 자유지만 **유니크 제약 세 개는 협상 대상이 아니다.** 이 명세의 핵심 규칙이 그 제약 자체다 —
앱 코드로 구현하면 동시 요청에서 새고, 그게 "어제와 다른 사람이 깨웠다고 나오는" 버그로 돌아온다.

```sql
CREATE TABLE app_user (
  id          TEXT PRIMARY KEY,
  name        TEXT,                       -- 등록 직후에는 NULL
  token       TEXT NOT NULL UNIQUE,       -- 불투명, 만료 없음 (§4)
  voice_path  TEXT,                       -- 저장된 .caf 위치. 녹음 전 NULL
  voice_ms    INTEGER,
  voice_updated_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL
);

CREATE TABLE room (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,       -- ← ① 활성 방 사이에서 유니크
  code_expires_at TIMESTAMP NOT NULL,     -- 발급 +7일
  owner_id    TEXT NOT NULL REFERENCES app_user(id),
  created_at  TIMESTAMP NOT NULL
);

-- 멤버십이 곧 그 사람의 스케줄이다. 방마다 다른 시각을 가질 수 있다.
CREATE TABLE membership (
  room_id     TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES app_user(id),
  joined_at   TIMESTAMP NOT NULL,         -- 참여 순서 = members 배열 순서
  time        TEXT,                       -- "HH:MM". NULL이면 이 방에서 울리지 않음
  days        INTEGER NOT NULL DEFAULT 31,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  snooze_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  snooze_minutes  INTEGER NOT NULL DEFAULT 9,
  PRIMARY KEY (room_id, user_id)
);

-- "그날 아침 이 사람을 깨울 목소리". 한 번 쓰면 다시 뽑지 않는다.
CREATE TABLE assignment (
  room_id     TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,              -- 듣는 사람
  date        DATE NOT NULL,
  woken_by_member_id TEXT,                -- 녹음한 사람이 없으면 NULL
  PRIMARY KEY (room_id, member_id, date)  -- ← ② 고정을 보장하는 것
);

CREATE TABLE wake (
  room_id     TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  date        DATE NOT NULL,
  woke_at     TIMESTAMP NOT NULL,         -- 로컬 벽시계
  woken_by_member_id TEXT,
  PRIMARY KEY (room_id, member_id, date)  -- ← ③ 멱등을 보장하는 것
);
```

- **①** 코드 충돌 시 INSERT가 실패하면 다시 뽑아 재시도(§5)
- **②** 배정을 만들 때 `INSERT ... ON CONFLICT DO NOTHING` 후 다시 SELECT하면, 두 요청이 동시에 와도
  한 명만 이긴다. `SELECT`로 확인하고 `INSERT`하는 방식은 경쟁 조건에 진다
- **③** 기상 기록도 `INSERT ... ON CONFLICT DO NOTHING`. 오프라인에서 쌓인 재시도가 두 번째 아침을
  만들지 않는다

`assignment`와 `wake`의 `member_id`에 FK를 걸지 않은 것은 의도적이다 — 사람이 방을 나가도 남은 사람의
기록이 그 사람을 가리키고 있을 수 있고, 그건 `null`로 지운다(§5 모닝 로그).

목소리 파일은 DB가 아니라 파일시스템이나 객체 스토리지에 둔다. 하나에 약 900 KB다.

---

## 9. 구현 순서

한 번에 16개를 만들지 말 것. **1단계만 끝나도 앱이 지금 못 하는 가장 큰 일이 된다.**
단계별 상세는 `api-implement.md`에 같은 순서로 정리해뒀다.

### 1단계 — 친구가 실제로 방에 들어온다 (엔드포인트 5개)

```
POST /me · PATCH /me · POST /rooms · POST /rooms/join · GET /rooms
```

지금 초대 코드는 로컬에서 흉내만 낸다. 이 단계가 끝나면 두 폰이 **같은 방**에 있게 되고, 그게 이
제품에서 서버가 필요한 첫 번째 이유다. 목소리도 배정도 없이 확인 가능하다.

### 2단계 — 아침이 공유된다 (엔드포인트 3개)

```
PUT /rooms/{id}/members/me/alarm · POST /rooms/{id}/wakes · GET /rooms/{id}/wakes
```

각자 시각을 정하고, 일어났음을 기록하고, **서로의 기록을 본다.** 여기까지가 `docs/MVP.md`의 완료
기준이다. 목소리 없이도 기본 사운드로 전체 흐름이 돈다.

### 3단계 — 목소리로 깬다 (엔드포인트 3개)

```
POST /me/voice · GET /voice/{userId} · GET /rooms/{id}/assignments
```

가장 까다로운 단계다 — 포맷(§5)과 고정 규칙(§2)이 여기 있다. 배정이 불안정하면 기상 화면이 거짓말을
하므로, 같은 요청을 두 번 보내 같은 답이 오는지 반드시 확인할 것.

### 4단계 — 방 관리 (엔드포인트 5개)

```
PATCH /rooms/{id} · POST /rooms/{id}/code · PUT /rooms/{id}/owner
DELETE /rooms/{id}/members/me · DELETE /rooms/{id}/members/{id}
```

이름 변경, 코드 재발급, 방장 이관, 나가기, 강퇴. 없어도 앱이 도는 것들이라 마지막이다.

### 만들면서 확인할 것

```bash
# 구현 전에 목서버로 앱을 붙여볼 수 있다
npx @stoplight/prism-cli mock docs/openapi.yaml

# 특정 상태 코드를 받아보려면
curl -X POST localhost:4010/rooms/join -H 'Prefer: code=410' \
  -H 'Content-Type: application/json' -d '{"code":"K7QM3P"}'
```

목서버의 한계 하나: 에러 응답의 `code` 값을 정확히 흉내내지 못하고 enum 첫 값(`UNAUTHORIZED`)을
채운다. 상태 코드는 맞으니 **어느 코드를 돌려줄지는 §3의 표를 근거로 삼을 것.**

§7의 9단계를 순서대로 통과하면 끝이다.

---

## 10. 아직 열린 것

초대 딥링크는 `voicealarm://join/{CODE}`이고, 이 스킴은 번들 ID와 함께 바뀐다. 번들 ID는 아직
`com.CHANGEME.voicealarm`이다 — **정하기 전에 발급한 코드의 링크는 나중에 앱을 열지 못한다.**

그리고 확인이 필요한 것 하나: **멤버의 스케줄은 방에 공개**다. 방 설정 화면이 모두의 기상 시각을 읽기
전용으로 보여준다. 비공개여야 한다면 말해줄 것.
