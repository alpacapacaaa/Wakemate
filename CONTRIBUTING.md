# 개발 안내

## 앱 실행

전부 **`frontend/`**에서 실행한다. 네이티브 모듈(AlarmKit)을 쓰므로 개발 빌드가 필요하다 —
**Expo Go로는 안 된다.**

```bash
cd frontend
npm install
npm run build:sim   # 시뮬레이터에 dev client 빌드 (처음 한 번, 그리고 네이티브 변경 후)
npm run dev         # Metro — 별도 터미널에 띄워둘 것
npm run sim         # 시뮬레이터에서 앱 실행
```

`expo run:ios`는 이 프로젝트에서 동작하지 않는다. 시뮬레이터를 제대로 찾고 나서 코드 서명을 요구하며
실패한다. 위 스크립트를 쓸 것.

`npm run build:sim`은 **네이티브가 바뀔 때만** 필요하다 — 네이티브 의존성 추가, `modules/alarm-kit`
수정, Info.plist나 entitlements에 영향을 주는 `app.json` 변경. 순수 JS/TS 수정은 Metro가 알아서
가져간다.

## 요구 사항

- **iOS 26 이상** — 알람이 AlarmKit을 쓰고, 그 아래 버전에는 존재하지 않는다
- **iOS SDK 26.1 이상을 포함한 Xcode** — 비-deprecated `AlarmPresentation.Alert` 초기화가 26.1에
  추가됐고 `#available` 분기 안에 있다. `docs/alarmkit.md` 참조
- **알람은 실기기에서만 실제로 울린다.** 시뮬레이터는 예약을 받아주므로 배선 확인에는 충분하지만
  동작 확인은 되지 않는다

## 백엔드

아직 없다. `frontend/lib/store.ts`가 그 자리를 대신하고 있고, 모든 함수가 처음부터 async에 API 모양이라
**fetch로 바꿔도 화면은 한 줄도 안 건드린다.**

서버가 무엇을 해줘야 하는지는 `docs/api-contract.md`, v1에 무엇이 들어가는지는 `docs/MVP.md`에 있다.

## 문서

- `docs/MVP.md` — v1 범위. 다른 문서와 어긋나면 이게 이긴다
- `docs/api-implement.md` — **서버를 만들 사람이 볼 것.** 만들어야 하는 것만 모은 작업 시트
- `docs/api-contract.md` — 같은 계약에 *왜 그런지*까지. DDL·해피패스 포함
- `docs/openapi.yaml` — 기계용 버전. 목서버·코드젠에 그대로 쓸 수 있다
- `docs/alarmkit.md` — 알람이 실제로 울리는 부분. 확인된 API 사실과 실기기에서만 답이 나오는 것들

## 참고

Expo API는 빠르게 바뀐다. 최신 문서가 아니라 `frontend/package.json`에 적힌 **정확한 SDK 버전의**
문서를 볼 것 (현재 <https://docs.expo.dev/versions/v57.0.0/>).
