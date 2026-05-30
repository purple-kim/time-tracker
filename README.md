# Time Tracker

고양이 캐릭터가 데스크탑 위에 떠서 작업 시간을 보여주는 포모도로/타임 트래커 프로토타입입니다.

작업을 시작하면 고양이가 노트북을 타이핑하고, 중간중간 표정이나 짧은 액션을 보여줍니다. 다음 일정 정보도 함께 표시할 수 있습니다.

## 주요 기능

- 작업 시간 측정
- 데스크탑 위에 떠 있는 투명 위젯
- 마우스 드래그로 위치 이동
- 고양이 타이핑 애니메이션
- 단일 표정 12종
- 콜라, 졸림, 화남 액션 애니메이션
- 다음 캘린더 일정 표시
- 표정/액션 테스트 모드

## 실행 방법

프로젝트를 처음 받은 경우 의존성을 설치합니다.

```bash
npm install
```

데스크탑 앱으로 실행합니다.

```bash
npm start
```

## 브라우저에서 미리보기

HTML 파일을 직접 열거나 로컬 서버를 사용할 수 있습니다.

```bash
python3 -m http.server 4173
```

그 다음 브라우저에서 아래 주소를 엽니다.

```text
http://localhost:4173
```

## 테스트 모드

단일 표정 12개를 순서대로 확인합니다.

```text
index.html?test=faces
```

액션 애니메이션을 순서대로 확인합니다.

```text
index.html?test=actions
```

액션 테스트 순서:

```text
typing -> cola -> sleepy -> angry
```

## 노출 정책

기본 상태:

- 시작 전: `cat-single-01-idle`
- 작업 중: 타이핑 애니메이션
- 종료 시: `proud` 표정 2초 노출

타이밍:

- 작업 시작 후 첫 이벤트: 14초 뒤
- 이벤트 노출 시간: 2초
- 평소 이벤트 간격: 약 13.3초
- 20분 이상 작업 후 이벤트 간격: 10초

전체 시간 기준 대략적인 노출 비율:

- 평소: 타이핑 85%, 단일 표정 8%, 액션 7%
- 20분 이후: 타이핑 80%, 단일 표정 7%, 액션 13%

캘린더 일정 정책:

- 다음 일정이 10분 이내면 `startled` 표정을 우선 노출합니다.
- `startled` 표정은 10분 쿨다운을 가집니다.

## 주요 에셋

런타임에서 사용하는 에셋:

```text
assets/frames/cat-expression-sprite-manual-single-12-gutter-160.png
assets/frames/cat-typing-sprite-final.png
assets/frames/cat-cola-sprite-final.png
assets/frames/cat-sleepy-sprite-final.png
assets/frames/cat-angry-sprite-final.png
```

단일 표정 원본:

```text
assets/frames/manual-single-expressions/
```

## 프로젝트 구조

```text
index.html
styles.css
main.js
calendar-data.js
electron/
assets/
```

## 참고

- 현재는 로컬 프로토타입입니다.
- Electron으로 작은 데스크탑 위젯처럼 실행됩니다.
- `node_modules/`와 `unused-assets-archive/`는 Git에 포함하지 않습니다.
- 캘린더 데이터는 현재 `calendar-data.js`에서 관리합니다.
