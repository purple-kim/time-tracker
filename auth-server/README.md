# Time Tracker Auth Server

Time Tracker의 Google Calendar OAuth 토큰 교환만 담당하는 Vercel 서버입니다.

이 서버에는 아래 환경변수가 필요합니다.

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

앱 DMG에는 `GOOGLE_CLIENT_SECRET`을 포함하지 않습니다.
