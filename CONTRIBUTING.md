# Contributing

## Running the app

Everything below runs from **`frontend/`**. Wakemate uses a native module (AlarmKit), so it needs a
development build — Expo Go will not work.

```bash
cd frontend
npm install
npm run build:sim   # build the dev client into the simulator (first time, and after native changes)
npm run dev         # start Metro — leave it running
npm run sim         # launch the app in the simulator
```

`expo run:ios` does not work in this project: it resolves a simulator and then asks for code signing.
Use the two scripts above instead.

`npm run build:sim` is only needed after **native** changes — a new native dependency, an edit to
`modules/alarm-kit`, or an `app.json` change touching Info.plist or entitlements. Pure JS/TS edits
are picked up by Metro.

## Requirements

- iOS 26+ — alarms use AlarmKit, which does not exist below it
- Xcode with the iOS 26.1 SDK or newer; the non-deprecated `AlarmPresentation.Alert` initialiser
  landed in 26.1 and is behind an `#available` check. See `docs/alarmkit.md`.
- Alarms only really ring on a device. The simulator will accept and schedule them, which is enough
  to verify the plumbing but not the behaviour.

## The backend

There isn't one yet. `frontend/lib/store.ts` stands in for it — every function is already async and
call-shaped, so swapping it for `fetch` should not touch a single screen. What the server owes the
client is in `docs/api-contract.md`; what belongs in v1 at all is in `docs/MVP.md`.

## Notes

Expo's API changes fast — read the versioned docs for the exact SDK in `frontend/package.json`
(currently <https://docs.expo.dev/versions/v57.0.0/>) rather than the latest ones.
