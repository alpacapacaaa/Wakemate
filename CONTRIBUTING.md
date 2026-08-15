# Contributing

## Running the app

Wakemate uses native modules (AlarmKit), so it needs a development build — Expo Go will not work.

```bash
npm install
npm run build:sim   # build the dev client into the simulator (first time, and after native changes)
npm run dev         # start Metro
npm run sim         # launch the app in the simulator
```

`expo run:ios` does not work in this project: it resolves a simulator and then asks for code signing.
Use the two scripts above instead.

## Requirements

- iOS 26+ — alarms use AlarmKit, which does not exist below it
- Xcode with the iOS 26.1 SDK or newer; the non-deprecated `AlarmPresentation.Alert` initialiser
  landed in 26.1 and is behind an `#available` check
- Alarms only really ring on a device. The simulator will accept and schedule them, which is enough
  to verify the plumbing but not the behaviour.

## Notes

Expo's API changes fast — read the versioned docs for the exact SDK in `package.json`
(currently <https://docs.expo.dev/versions/v57.0.0/>) rather than the latest ones.
