# 구현할 API 목록

만들어야 하는 것만 모은 작업 시트. **왜 그런지는 `api-contract.md`**, 정확한 스키마는
`openapi.yaml`, 범위는 `MVP.md`.

- 전부 `Authorization: Bearer <token>` 필요. 예외는 `POST /me` 하나
- 시각·날짜는 **기기 로컬 벽시계**. UTC로 변환하면 남의 아침이 옮겨짐
- 에러는 `{ "code": "...", "message": "..." }`. 상태 코드가 message보다 중요함
- **서버는 알람을 울리지 않음.** 스케줄링·스누즈·"07:00에 푸시"를 만들지 말 것

---

## 1단계 — 친구가 방에 들어온다 (5개)

이것만 끝나도 지금 못 하는 가장 큰 일이 됨. 초대 코드가 현재 로컬 흉내여서 같은 코드를 넣은 두 폰이
서로 무관한 두 방이 됨.

### `POST /me` — 기기 등록 · 인증 없음

```jsonc
→ 201 { "userId": "usr_01H8XK", "token": "..." }
```

- 이름 없는 유저를 만들고 토큰 발급. 랜덤 128비트 이상 불투명 토큰
- **토큰 만료 없음.** 클라이언트에 갱신 경로가 없어서 만료되면 방·기록을 잃음
- user 행을 특정 인증 수단에 묶지 말 것 (나중에 SIWA를 여기에 붙임)

### `PATCH /me` — 이름

```jsonc
{ "name": "지수" }        // maxLength 40
→ 200 Me
```

### `POST /rooms` — 방 만들기

```jsonc
{ "name": "Study crew" }  // maxLength 40
→ 201 Room
```

- 만든 사람이 `ownerId`, 스케줄은 `07:00` / `days: 31`(평일) / enabled
- `code` 6자 발급 + `codeExpiresAt` = 지금 +7일
- 코드 알파벳: `ABCDEFGHJKLMNPQRSTUVWXYZ2-9` (0/O/1/I 제외)
- **활성 방 사이에서 유니크.** INSERT가 유니크 제약에 걸리면 다시 뽑아 재시도

### `POST /rooms/join` — 코드로 참여

```jsonc
{ "code": "K7QM3P" }
→ 200 Room
```

| 상태 | code | 조건 |
|---|---|---|
| 404 | `NOT_FOUND` | 그런 코드가 없음 |
| 410 | `CODE_EXPIRED` | `codeExpiresAt` 지남 |
| 409 | `ROOM_FULL` | 이미 5명 |
| 409 | `ALREADY_MEMBER` | 이미 그 방에 있음 |

- **404와 410을 반드시 구분.** 클라이언트가 다른 문구를 보여줌
- 정원 5명과 만료 검사는 **여기서만** 하면 됨
- 참여 시 그 사람 스케줄은 기본값(07:00 평일)으로 생성

### `GET /rooms` — 내 방 전부

```jsonc
→ 200 [ Room, ... ]      // members 전원 + 각자 voiceUrl · alarm 포함
```

- **포그라운드 갱신 경로.** 푸시가 없어서 앱은 이 응답으로만 변화를 앎
- 내가 강퇴·탈퇴된 방은 **이 목록에서 사라져야 함**. 그러면 앱이 로컬 방을 지우고 알람을 취소함

---

## 2단계 — 아침이 공유된다 (3개)

여기까지가 `MVP.md`의 완료 기준. 목소리 없이 기본 사운드로도 전체 흐름이 돌아감.

### `PUT /rooms/{id}/members/me/alarm` — 내 시각·요일

```jsonc
{ "time": "07:00", "days": 31, "enabled": true,
  "snoozeEnabled": true, "snoozeMinutes": 9 }
→ 200 Member
```

- 객체 전체, 멱등. 부분 갱신 없음
- `days` 비트마스크: bit0=월 … bit6=일. 31=평일, 96=주말, 127=매일, **0=반복 없음(1회성)**
- `time` 정규식 `^([01][0-9]|2[0-3]):[0-5][0-9]$`
- `snoozeMinutes` ∈ {5, 9, 10, 15}
- **남의 스케줄은 수정 불가.** 읽기만

### `POST /rooms/{id}/wakes` — 기상 기록

```jsonc
{ "date": "2026-08-18", "wokeAt": "2026-08-18T06:58:00",
  "wokenByMemberId": "usr_B" }              // 기본 사운드였으면 null
→ 200 WakeRecord
```

- **`(room, member, date)`에 멱등.** 같은 요청을 두 번 받아도 기록은 하나
- **과거 `wokeAt`을 받아줄 것.** 오프라인에서 쌓였다 늦게 도착함
- `INSERT ... ON CONFLICT DO NOTHING` 하나로 끝남

### `GET /rooms/{id}/wakes?from&to` — 모닝 로그

```jsonc
→ 200 [ WakeRecord, ... ]
```

- **방 전원의 기록.** 내 것만 보이면 절반만 동작하는 것

---

## 3단계 — 목소리로 깬다 (3개)

가장 까다로운 단계.

### `POST /me/voice` — 목소리 업로드

```
multipart/form-data: file=<.caf>, durationMs=7400
→ 201 { "voiceUrl": "...", "voiceUpdatedAt": "2026-08-17T09:12:00Z" }
```

- **변환하지 말 것.** 들어오는 건 `.caf` / 16-bit linear PCM / mono / 44.1 kHz이고,
  `voiceUrl`이 내려주는 바이트도 그대로여야 함
- mp3·AAC로 바꾸면 플레이어에서는 들리고 **알람음으로는 조용히 거부됨**
- iOS 알람음 허용: PCM·µ-law·a-law를 담은 `.caf`·`.aiff`·`.wav`, 최대 30초
- 크기 약 900 KB. 초과 시 413 `FILE_TOO_LARGE`, 포맷 틀리면 415 `UNSUPPORTED_FORMAT`
- **사람당 하나이고 교체됨.** 다시 올리면 그 사람이 속한 모든 방에 그대로 쓰이고
  `voiceUpdatedAt` 갱신
- 파일은 DB 아니고 파일시스템·객체 스토리지

### `GET /voice/{userId}` — .caf 바이트

```
→ 200 audio/x-caf
```

- **Bearer 토큰 필요.** 공개 URL 아님 — 실제 사람 목소리
- **나와 방을 공유하는 사람만.** 아무 `userId`나 받아가면 안 됨 → 403
- 서명 URL을 쓸 경우 **`voiceUpdatedAt`은 서명이 바뀌어도 그대로**여야 함. 매번 달라지면
  클라이언트가 매번 다시 내려받음

### `GET /rooms/{id}/assignments?from=YYYY-MM-DD&days=7` — 누가 나를 깨우나

```jsonc
→ 200 [ { "date": "2026-08-18", "wokenByMemberId": "usr_B", "voiceUrl": "..." }, ... ]
```

- 뽑는 규칙: **녹음을 마쳤고 내가 아닌** 멤버 중 균등 랜덤
- 아무도 녹음 안 했으면 `wokenByMemberId: null` (클라이언트가 기본 사운드로 폴백)
- **크론 만들지 말 것.** 요청받은 범위에서 배정이 없는 날짜만 그 자리에서 뽑아 저장

```
for date in [from ... from+days):
    없으면 INSERT ... ON CONFLICT DO NOTHING → 다시 SELECT
    결과에 담기
```

- **한 번 정한 배정을 다시 뽑으면 안 됨.** 그 순간 기상 화면이 거짓말을 함
- 같은 요청을 두 번 보내 **같은 답이 오는지 반드시 확인.** 이게 이 단계의 핵심 테스트
- 있으면 좋은 것(필수 아님): 어제와 같은 사람 피하기

---

## 4단계 — 방 관리 (5개)

없어도 앱이 돌아감.

### `PATCH /rooms/{id}` — 방 이름

```jsonc
{ "name": "새 이름" } → 200 Room
```

### `POST /rooms/{id}/code` — 코드 재발급 · 방장만

```jsonc
→ 200 { "code": "...", "codeExpiresAt": "..." }   // 방장 아니면 403 NOT_OWNER
```

- 이전 코드는 즉시 무효

### `PUT /rooms/{id}/owner` — 방장 이관 · 방장만

```jsonc
{ "memberId": "usr_B" } → 200 Room                // 방장 아니면 403
```

- `memberId`는 이미 그 방에 있어야 함
- **방장은 저절로 바뀌지 않음.** 나가려는 방장이 이걸 먼저 호출

### `DELETE /rooms/{id}/members/me` — 나가기

```
→ 204
→ 409 OWNER_MUST_TRANSFER    // 방장인데 다른 멤버가 남아 있음
```

- 방장이 **마지막 한 명**이면 그냥 나가고 방 삭제
- 아래 「나갈 때 지우는 것」 수행

### `DELETE /rooms/{id}/members/{memberId}` — 강퇴 · 방장만

```
→ 204                        // 방장 아니면 403 NOT_OWNER
```

- 나가기와 같은 삭제 수행

### 나갈 때 / 강퇴할 때 지우는 것

1. 그 사람의 그 방 `wake` 행 **삭제**
2. 그 사람을 가리키던 남은 사람들의 `wokenByMemberId`를 **`null`로**

방에 없는 id를 가리키는 기록은 클라이언트가 그릴 수 없음. 묘비 이름을 대신 넣지 말 것 — 흔적을
남기지 않기로 한 결정.

---

## 테이블

**유니크 제약 세 개가 이 명세의 핵심 규칙.** 앱 코드로 구현하면 동시 요청에서 샘.

```sql
CREATE TABLE app_user (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  token       TEXT NOT NULL UNIQUE,       -- 만료 없음
  voice_path  TEXT,
  voice_ms    INTEGER,
  voice_updated_at TIMESTAMP,
  created_at  TIMESTAMP NOT NULL
);

CREATE TABLE room (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,       -- ① 코드 유일성
  code_expires_at TIMESTAMP NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES app_user(id),
  created_at  TIMESTAMP NOT NULL
);

-- 멤버십이 곧 스케줄. 방마다 다른 시각을 가질 수 있음
CREATE TABLE membership (
  room_id     TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES app_user(id),
  joined_at   TIMESTAMP NOT NULL,         -- 참여 순서 = members 배열 순서
  time        TEXT,
  days        INTEGER NOT NULL DEFAULT 31,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  snooze_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  snooze_minutes  INTEGER NOT NULL DEFAULT 9,
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE assignment (
  room_id     TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,              -- 듣는 사람
  date        DATE NOT NULL,
  woken_by_member_id TEXT,
  PRIMARY KEY (room_id, member_id, date)  -- ② 배정 고정
);

CREATE TABLE wake (
  room_id     TEXT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL,
  date        DATE NOT NULL,
  woke_at     TIMESTAMP NOT NULL,
  woken_by_member_id TEXT,
  PRIMARY KEY (room_id, member_id, date)  -- ③ 기상 기록 멱등
);
```

`assignment`·`wake`의 `member_id`에 FK를 걸지 않은 것은 의도 — 나간 사람을 가리키는 기록이 남을 수
있고, 그건 `null`로 지움.

---

## 응답 객체

```jsonc
// Room — 최대 5명
{ "id": "rm_1", "name": "Study crew", "code": "K7QM3P",
  "codeExpiresAt": "2026-08-24T09:00:00Z", "ownerId": "usr_A",
  "createdAt": "2026-08-10T…Z", "members": [ Member, ... ] }   // 참여 순서

// Member
{ "id": "usr_B", "name": "Sam",
  "voiceUrl": "…", "voiceDurationMs": 7400,      // 녹음 전 null
  "voiceUpdatedAt": "2026-08-15T09:12:00Z",
  "alarm": { AlarmSchedule } }                    // 미설정 null

// WakeRecord
{ "roomId": "rm_1", "date": "2026-08-18",
  "memberId": "usr_A", "wokeAt": "2026-08-18T06:58:00",
  "wokenByMemberId": "usr_B" }
```

**절대 내려주지 말 것**: `nativeAlarmId`, `voiceSoundName`, 개인 알람 — 전부 기기 로컬 값.

---

## 에러 코드

| 상태 | code |
|---|---|
| 401 | `UNAUTHORIZED` |
| 403 | `NOT_OWNER` |
| 404 | `NOT_FOUND` |
| 409 | `ROOM_FULL` · `ALREADY_MEMBER` · `OWNER_MUST_TRANSFER` |
| 410 | `CODE_EXPIRED` |
| 413 | `FILE_TOO_LARGE` |
| 415 | `UNSUPPORTED_FORMAT` |
| 400 | `VALIDATION_ERROR` |
| 500 | `INTERNAL` |

---

## 만들지 않는 것

로그인(SIWA) · 푸시(`/me/devices`) · 오디오 변환 · 알람 스케줄링 · 스누즈 처리 · 신고/차단 ·
크론/배치.

---

## 확인 순서

`api-contract.md` §7의 curl 9단계를 그대로 통과하면 끝. 특히:

1. 두 폰이 같은 코드로 **같은 방**에 들어오는가
2. 같은 `assignments` 요청에 **같은 답**이 오는가
3. `wakes`를 두 번 POST해도 기록이 **하나**인가
4. 상대의 기상 기록이 **내 로그에 보이는가**

```bash
# 구현 전에 프론트를 붙여볼 목서버
npx @stoplight/prism-cli mock docs/openapi.yaml

# 특정 상태 코드 받아보기
curl -X POST localhost:4010/rooms/join -H 'Prefer: code=410' \
  -H 'Content-Type: application/json' -d '{"code":"K7QM3P"}'
```

목서버는 에러 `code` 값을 정확히 흉내내지 못하고 enum 첫 값을 채움. 상태 코드는 맞으니 code는 위 표를
근거로 삼을 것.
