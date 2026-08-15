# Wakemate — API contract

What the iOS client needs from the server. Written against the client as it stands today; the
source of truth for shapes is `lib/model.ts`, and `lib/store.ts` is the seam these endpoints
replace — it is already async and call-shaped, so swapping it for `fetch` should not touch a
single screen.

`docs/openapi.yaml` is the machine-readable version of everything below — same endpoints, same
shapes, lint-clean OpenAPI 3.1, ready for codegen or a mock server. This file is the one that
explains *why*.

**This supersedes the old `openapi.yaml` / `spec-v1.1.md` at the project root.** Those describe the previous product (anonymous
strangers, one server-assigned alarm). Ignore them.

---

## 1. Read this first: the server never rings anything

Alarms are scheduled **on the device**, by iOS AlarmKit. They fire with the phone offline, in
airplane mode, with the app killed. The server is never in the ringing path and must never be
relied on to wake anyone.

So the server's job is only to answer three questions:

1. **Who is in this room** — and what time each of them gets up
2. **Whose voice wakes me tomorrow**, and where that audio file is
3. **Who actually got up** — the shared morning log

Everything else is local. In particular, **do not** build alarm scheduling, snooze handling, or
"send a notification at 07:00". The client already does all of it.

### Fields the server must never receive or send

| Field | Why |
| --- | --- |
| `Room.nativeAlarmId` | AlarmKit's id for my alarm **on this device**. Meaningless anywhere else. |
| `Member.voiceSoundName` | Filename of the audio **on this device**. The server sends a URL; the client decides the filename. |
| `PersonalAlarm.*` | Alarms with no room. Purely local; never leaves the phone. |

---

## 2. The one rule that has to move to the server

Right now the client picks which roommate's voice rings, at random, at scheduling time
(`pickVoiceFor` in `lib/store.ts`). This is wrong in two ways and only the server can fix it:

- **Every device picks separately**, so nobody agrees on who woke whom.
- **The reveal does not match.** The alarm is scheduled with one voice, and the "누가 깨웠는지"
  screen re-rolls and may name somebody else. The client cannot fix this alone: AlarmKit needs a
  concrete filename days in advance, so the pick must be decided ahead of time and be stable.

**The server must assign, per (room, member, date), which other member's voice rings** — and keep
it fixed once assigned. The client asks for the next few days and schedules them.

Uniform-at-random among members who have recorded and are not me. Nice to have, not required for
v1: avoid repeating the same voice two mornings running.

---

## 3. Types

JSON, camelCase, matching `lib/model.ts`. Times are **device-local wall clock**, never UTC — an
alarm at 07:00 means 07:00 wherever the phone is.

```jsonc
// AlarmSchedule — one person's own wake-up in one room
{
  "time": "07:00",          // "HH:MM", 24h, local wall clock
  "days": 31,               // bitmask, bit0=Mon … bit6=Sun. 31 = weekdays, 127 = every day, 0 = one-shot
  "enabled": true,
  "snoozeEnabled": true,
  "snoozeMinutes": 9        // one of 5 | 9 | 10 | 15
}
```

```jsonc
// Member — as seen by anyone in the room
{
  "id": "usr_01H…",
  "name": "Sam",
  "voiceUrl": "https://…/voice/usr_01H….caf",  // null until they record
  "voiceDurationMs": 7400,                      // null until they record
  "voiceUpdatedAt": "2026-08-15T09:12:00Z",     // so the client knows to re-download
  "alarm": { /* AlarmSchedule */ }               // null if they have not set one
}
```

```jsonc
// Room
{
  "id": "rm_01H…",
  "name": "Study crew",
  "code": "K7QM3P",         // 6 chars, no 0/O/1/I — read aloud and typed
  "createdAt": "2026-08-10T…Z",
  "members": [ /* Member */ ]
}
```

```jsonc
// WakeRecord — one person, one morning, one room
{
  "roomId": "rm_01H…",
  "date": "2026-08-15",     // YYYY-MM-DD, the waker's local date
  "memberId": "usr_01H…",
  "wokeAt": "2026-08-15T06:58:00",   // local, no zone suffix — it is a wall clock
  "wokenByMemberId": "usr_01H…"      // null if it rang with the default sound
}
```

---

## 4. Endpoints

### Auth

The app has `expo-apple-authentication` installed and **no login screen yet** — this is greenfield,
so the shape is yours to choose. What the client needs is: Sign in with Apple → a durable user id
and a bearer token. The user id becomes `Member.id` everywhere.

```
POST /auth/apple          { identityToken } → { userId, token, name? }
PATCH /me                 { name } → Me
```

Apple only gives a name on the *first* authorisation, so store it then or the user is nameless
forever.

### Rooms

```
GET    /rooms                        → Room[]        // everything I am in, with all members
POST   /rooms                        { name } → Room  // creator gets the default 07:00 weekdays
POST   /rooms/join                   { code } → Room  // 404 if no such code, 409 if already in
PATCH  /rooms/{id}                   { name } → Room
DELETE /rooms/{id}/members/me        → 204            // leave
```

`POST /rooms/join` is the one the client is waiting on most: `store.joinRoomByCode` currently fakes
it by creating a *local* room carrying that code, so two phones with the same code are two
unrelated rooms. Nothing about the product works until this is real.

### My schedule in a room

```
PUT /rooms/{id}/members/me/alarm     { AlarmSchedule } → Member
```

One endpoint, whole object, idempotent. The client edits `time`, `days` and `enabled` and always has
the full schedule in hand, so a PATCH would only add ways to disagree.

Other members' schedules are **read-only** to me — the room shows everyone's time, and nobody can
move anyone else's alarm.

### Voice

```
POST /me/voice            multipart: file (.caf), durationMs → { voiceUrl, voiceUpdatedAt }
GET  {voiceUrl}                                              → the .caf bytes
```

**The audio must survive the round trip byte-exact, or at least stay a format iOS can ring.**
This is the part most likely to go wrong:

- The client uploads **CoreAudio Format (.caf), 16-bit linear PCM, mono, 44.1 kHz**.
- iOS alert sounds accept **PCM / µ-law / a-law in .caf, .aiff or .wav only**, and **30 seconds
  maximum**. Recordings are capped at 10s client-side.
- **Do not transcode to mp3 or AAC.** They play fine in a normal audio player and are silently
  refused as an alarm sound. This exact mistake is why the app never rang with a voice until now.
- Size: measured 578 KB for 6.5 s, so ~90 KB/s — budget ~900 KB per voice. Compressing for storage
  is fine as long as what `voiceUrl` serves is PCM.

### Tomorrow's voices

```
GET /rooms/{id}/assignments?from=2026-08-15&days=7
  → [ { "date": "2026-08-15", "wokenByMemberId": "usr_…", "voiceUrl": "https://…" }, … ]
```

The client schedules a week ahead, downloads each `voiceUrl` once, and stores it in the App Group so
AlarmKit can play it offline. Assignments must be **stable** — a device that fetched Monday's voice
must get the same answer tomorrow, or the reveal lies.

Return `wokenByMemberId: null` when nobody in the room has recorded; the client falls back to the
system alarm sound.

### Morning log

```
POST /rooms/{id}/wakes    { date, wokeAt, wokenByMemberId } → WakeRecord
GET  /rooms/{id}/wakes?from=2026-08-09&to=2026-08-15        → WakeRecord[]
```

`POST` is written when the person taps **I'm up**, which can be minutes after the alarm and
**possibly offline** — accept a `wokeAt` in the past and make it idempotent per
(room, member, date), so a retry does not create a second morning.

### Push

Only to keep data fresh; never to ring anything.

```
POST /me/devices          { apnsToken } → 204
```

Worth a silent push when: someone joins or leaves a room, a member records or replaces a voice, or
assignments change. Without it the app only notices on next foreground, which is usually fine but
makes a new member's voice take a day to arrive.

---

## 5. Offline is normal, not an edge case

This app is used at 07:00 with the phone face-down. Assume every write can arrive late and out of
order:

- Wake records must be idempotent per (room, member, date) — see above.
- The schedule PUT is last-write-wins per member; that is fine, only one device edits it.
- The client keeps working entirely from its local copy when the network is gone. Nothing about the
  alarm depends on you.

---

## 6. Open questions for whoever builds this

1. **Do invite codes expire or rotate?** The client shows a room's code indefinitely and shares it as
   `voicealarm://join/{CODE}` (the URL scheme is still the old one — it changes with the bundle
   identifier, which needs a real one before release). If codes rotate, the client needs to know so it can stop showing a
   stale one.
2. **Room size cap?** The deck and the day screen are laid out for roughly 3–8 people. A 40-person
   room would not break, but it would not read well either.
3. **What happens to a room's log when someone leaves?** Currently the client just drops the room
   locally. Do their past mornings stay in everyone else's log?
4. **Is a member's schedule really public to the room?** The room settings screen lists everyone's
   wake-up time today. Say so if that should be private.
