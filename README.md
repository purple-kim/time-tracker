# Time Tracker

작업 시간을 재면서 데스크탑 위에 작은 고양이 캐릭터를 띄워두는 앱입니다.

고양이는 작업 중 노트북을 타이핑하고, 시간이 지나면 가끔 표정이나 액션이 바뀝니다. Google Calendar를 연결하면 다음 일정도 함께 볼 수 있습니다.

## 준비물

이 앱은 GitHub에서 프로젝트를 내려받아 직접 실행하는 방식입니다.

먼저 아래 프로그램이 필요합니다.

- macOS
- Node.js
- Google 계정

Node.js가 없다면 [Node.js 공식 사이트](https://nodejs.org/)에서 LTS 버전을 설치해 주세요.

## 1. 프로젝트 다운로드하기

GitHub 페이지에서 초록색 `Code` 버튼을 누른 뒤 `Download ZIP`을 선택합니다.

ZIP 파일을 압축 해제한 뒤 원하는 위치에 폴더를 둡니다.

터미널을 열고 프로젝트 폴더로 이동합니다.

```bash
cd 다운로드한_폴더_경로
```

예시:

```bash
cd ~/Downloads/time-tracker-main
```

## 2. 필요한 파일 설치하기

프로젝트 폴더 안에서 아래 명령어를 실행합니다.

```bash
npm install
```

설치가 끝날 때까지 기다립니다.

## 3. Google Calendar 설정하기

Google Calendar를 연결하려면 본인 Google 계정으로 OAuth 설정을 만들어야 합니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속합니다.
2. 새 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
3. `API 및 서비스`에서 `Google Calendar API`를 사용 설정합니다.
4. `OAuth 동의 화면`을 설정합니다.
5. 사용자 유형은 `외부`를 선택합니다.
6. 테스트 사용자에 본인 Google 이메일을 추가합니다.
7. `사용자 인증 정보`에서 `OAuth 클라이언트 ID`를 만듭니다.
8. 애플리케이션 유형은 `데스크톱 앱`을 선택합니다.
9. 생성된 `클라이언트 ID`와 `클라이언트 보안 비밀번호`를 복사합니다.

## 4. 캘린더 설정 파일 만들기

프로젝트 폴더에서 `google-calendar-config.example.json` 파일을 복사해 `google-calendar-config.json` 파일을 만듭니다.

`google-calendar-config.json`을 열고 아래 값들을 본인이 발급받은 값으로 바꿉니다.

```json
{
  "clientId": "여기에_클라이언트_ID",
  "clientSecret": "여기에_클라이언트_보안_비밀번호"
}
```

`google-calendar-config.json`은 개인 설정 파일입니다. GitHub에 올리지 마세요.

## 5. 앱 실행하기

프로젝트 폴더에서 아래 명령어를 실행합니다.

```bash
npm start
```

고양이 위젯이 데스크탑 위에 나타나면 실행된 것입니다.

## 6. Google Calendar 연결하기

1. 고양이 위젯에 마우스를 올립니다.
2. 아래쪽 버튼 중 캘린더 아이콘을 누릅니다.
3. Google 로그인 화면이 열리면 본인 계정을 선택합니다.
4. 경고 화면이 나오면 `계속`을 누릅니다.
5. Calendar 읽기 권한을 허용합니다.
6. 연결이 완료되면 위젯에 다음 일정이 표시됩니다.

앱은 일정을 수정하지 않습니다. 다음 일정을 보여주기 위해 읽기 권한만 사용합니다.

## 사용 방법

- `시작`: 작업 시간을 측정합니다.
- `일시정지`: 작업 시간을 잠시 멈춥니다.
- `끝내기`: 작업을 종료합니다.
- 캘린더 아이콘: Google Calendar를 연결하거나 해제합니다.
- 위젯 드래그: 원하는 위치로 옮깁니다.

## 앱 파일로 만들기

매번 터미널에서 실행하지 않고 앱 파일로 만들고 싶다면 아래 명령어를 실행합니다.

```bash
npm run pack:mac
```

생성된 앱은 아래 위치에서 확인할 수 있습니다.

```text
dist/mac-arm64/Time Tracker.app
```

## 참고

- `google-calendar-config.json`은 개인 설정 파일이라 GitHub에 올리지 않습니다.
- Google Calendar 권한 토큰은 각 사용자 컴퓨터에만 저장됩니다.
- 앱이 제대로 실행되지 않으면 `npm install`을 다시 실행한 뒤 `npm start`를 실행해 보세요.
