# Wakemate — API contract

What the iOS client needs from the server. Written against the client as it stands today; the
source of truth for shapes is `lib/model.ts`, and `lib/store.ts` is the seam these endpoints
replace — it is already async and call-shaped, so swapping it for `fetch` should not touch a
single screen.

> Client paths in this document are relative to **`frontend/`** — `lib/model.ts` means
> `frontend/lib/model.ts`.

`docs/openapi.yaml` is the machine-readable version of everything below — same endpoints, same
shapes, lint-clean OpenAPI 3.1, ready for codegen or a mock server. This file is the one that
explains *why*.

`docs/MVP.md` decides **which of the endpoints below are in v1** and which are deferred; where the
two disagree, MVP.md wins. Read it first.

(Some early drafts of this project described a different product — anonymous strangers, one
server-assigned alarm. Those files were never committed here. Nothing in this repo describes that
product.)

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
// Room — at most 5 members
{
  "id": "rm_01H…",
  "name": "Study crew",
  "code": "K7QM3P",                        // 6 chars, no 0/O/1/I — read aloud and typed
  "codeExpiresAt": "2026-08-17T09:00:00Z",  // 7 days after issue; the owner can reissue
  "ownerId": "usr_01H…",                    // creator; only member who can remove, reissue, hand over
  "createdAt": "2026-08-10T…Z",
  "members": [ /* Member */ ]               // join order
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

**v1 has no login.** The app registers the device and gets back an id and a bearer token; the id
becomes `Member.id` everywhere. Sign in with Apple is deferred (see `docs/MVP.md`) — the client has
no login screen, and `expo-apple-authentication` is being removed.

```
POST  /me                 { } → { userId, token }
PATCH /me                 { name } → Me
```

The name is typed by the person during onboarding, so `POST /me` can create a nameless user and the
`PATCH` follows immediately.

The cost of this choice is known and accepted: a reinstall loses the account. When SIWA lands it
must be able to *attach* to an existing device-created user rather than replace it, so keep the
user row identity-agnostic.

### Rooms

```
GET    /rooms                        → Room[]        // everything I am in, with all members
POST   /rooms                        { name } → Room  // creator gets the default 07:00 weekdays
                                                      // and becomes ownerId
POST   /rooms/join                   { code } → Room  // 404 unknown, 410 expired, 409 full/already in
PATCH  /rooms/{id}                   { name } → Room
POST   /rooms/{id}/code              → { code, codeExpiresAt }   // reissue; 403 unless ownerId
PUT    /rooms/{id}/owner             { memberId } → Room          // hand over; 403 unless ownerId
DELETE /rooms/{id}/members/me        → 204            // leave; 409 if owner with no successor named
DELETE /rooms/{id}/members/{id}      → 204            // remove someone; 403 unless I am ownerId
```

`POST /rooms/join` is the one the client is waiting on most: `store.joinRoomByCode` currently fakes
it by creating a *local* room carrying that code, so two phones with the same code are two
unrelated rooms. Nothing about the product works until this is real.

**Room size is capped at 5.** The sixth join gets 409. Checked at join time only; nothing else needs
to know.

**Ownership.** The creator is `ownerId` and is the only member who may remove another, reissue the
code, or hand the room over.

Ownership **never transfers by itself** — an owner leaving must name a successor through
`PUT /rooms/{id}/owner` first, and `DELETE /rooms/{id}/members/me` answers **409** if the owner tries
to leave a room that still has other members. The one exception: an owner who is the last member
leaves normally and the room is deleted. Keeping transfer as its own operation also means an owner
can hand the room over *without* leaving.

**Invite codes expire 7 days after they are issued** (`Room.codeExpiresAt`). Joining with an expired
one is **410**, distinct from 404 — the client says "this code has expired" rather than "no such
room", and those are different problems for the person typing it. Only the owner can reissue.

**What a removed member sees.** There is no push in v1, so a phone finds out it is no longer in a
room only when it next asks — which is `GET /rooms` on foreground. From then on that room must be
**absent from `GET /rooms`**, and its own endpoints must answer **403 or 404** for that user. The
client deletes the room locally and cancels its alarm. Until that next foreground the removed phone
can still ring once for the room — known and accepted, but it is why being consistently absent
matters more than any message.

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

**Leaving or being removed erases that person's mornings in that room.** Delete their `WakeRecord`s,
and set `wokenByMemberId` to `null` on everyone else's records that pointed at them — a record that
names an id no longer in the room is one the client cannot draw. The cost is accepted: for the people
who stay, those mornings become indistinguishable from ones that rang with the default sound. Do not
substitute a tombstone name; the decision was to leave no trace.

### Push — **not in v1**

Deferred (`docs/MVP.md`). Do not build it yet; the client has no token-registration path and
`expo-notifications` is being removed.

When it does land it is only ever to keep data fresh, **never to ring anything**:

```
POST /me/devices          { apnsToken } → 204
```

Worth a silent push when: someone joins, leaves or is removed from a room, a member replaces their
voice, or assignments change. Without it the app notices on next foreground, so a new or replaced
voice takes up to a day to arrive and a removed member can ring once more. That is the accepted cost
of leaving push out.

---

## 5. Offline is normal, not an edge case

This app is used at 07:00 with the phone face-down. Assume every write can arrive late and out of
order:

- Wake records must be idempotent per (room, member, date) — see above.
- The schedule PUT is last-write-wins per member; that is fine, only one device edits it.
- The client keeps working entirely from its local copy when the network is gone. Nothing about the
  alarm depends on you.

---

## 6. Settled, and the one thing still open

The four questions that used to live here were decided on 2026-08-17 and are now rules above:

1. **Invite codes expire after 7 days** and only the owner reissues them (`POST /rooms/{id}/code`).
   Expired is 410, not 404.
2. **Rooms hold at most 5 people.** The sixth join is 409.
3. **Leaving erases that person's mornings** in that room, and nulls `wokenByMemberId` on everyone
   else's records that pointed at them.
4. **Ownership never transfers by itself** — the owner names a successor before leaving, or gets 409.

Still open, and only a real device can answer it: the invite deep link is `voicealarm://join/{CODE}`,
and that scheme changes with the bundle identifier, which is still `com.CHANGEME.voicealarm`. Codes
issued before the identifier is settled will produce links that no longer open the app.

One thing worth confirming rather than assuming: **a member's schedule is public to the room.** The
room settings screen lists everyone's wake-up time, read-only. Say so if it should be private.
