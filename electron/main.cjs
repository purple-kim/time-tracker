const { app, BrowserWindow, ipcMain, Menu, screen, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const WINDOW_SIZE = { width: 240, height: 300 };
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const DEFAULT_GOOGLE_CLIENT_ID = "283154573553-tkdvcr8nlkd2f1vm86tspilsrhdn5aoq.apps.googleusercontent.com";
const DEFAULT_GOOGLE_TOKEN_PROXY_URL = "";

let mainWindow;

function getInitialBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    x: Math.round(workArea.x + workArea.width - WINDOW_SIZE.width - 56),
    y: Math.round(workArea.y + workArea.height - WINDOW_SIZE.height - 56)
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...getInitialBounds(),
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    frame: false,
    hasShadow: false,
    resizable: false,
    show: false,
    transparent: true,
    title: "Time Tracker",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, "..", "index.html"), {
    query: { desktop: "1", v: "desktop" }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("move-window-by", (_event, delta) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  mainWindow.setBounds({
    ...bounds,
    x: Math.round(bounds.x + delta.x),
    y: Math.round(bounds.y + delta.y)
  });
});

ipcMain.on("window:set-mode", (_event, mode) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setSize(WINDOW_SIZE.width, WINDOW_SIZE.height);
});

ipcMain.on("context-menu:show", (event, state = {}) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) return;

  const send = (command) => {
    if (!window.isDestroyed()) window.webContents.send("context-menu:command", command);
  };

  const menu = Menu.buildFromTemplate([
    {
      label: "고양이 테마",
      submenu: [
        {
          label: "치즈",
          type: "radio",
          checked: state.selectedThemeId === "brown-cat",
          click: () => send({ type: "select-theme", themeId: "brown-cat" })
        },
        {
          label: "까망",
          type: "radio",
          checked: state.selectedThemeId === "black-cat",
          click: () => send({ type: "select-theme", themeId: "black-cat" })
        },
        {
          label: "삼색이",
          type: "radio",
          checked: state.selectedThemeId === "calico-cat",
          click: () => send({ type: "select-theme", themeId: "calico-cat" })
        },
        {
          label: "샴",
          type: "radio",
          checked: state.selectedThemeId === "siamese-cat",
          click: () => send({ type: "select-theme", themeId: "siamese-cat" })
        }
      ]
    },
    {
      label: `타이핑 소리: ${state.typingSoundEnabled ? "ON" : "OFF"}`,
      enabled: Boolean(state.running),
      click: () => send({ type: "toggle-sound" })
    },
    {
      label: state.calendarConnected ? "캘린더 연결 해제" : "캘린더 연결",
      enabled: !state.calendarLoading,
      click: () => send({ type: "toggle-calendar" })
    },
    {
      label: state.running ? "일시정지" : state.elapsed > 0 ? "다시 시작" : "시작",
      click: () => send({ type: "toggle-timer" })
    },
    {
      label: "끝내기",
      click: () => send({ type: "quit" })
    }
  ]);

  menu.popup({ window });
});

ipcMain.on("app:quit", () => {
  app.quit();
});

function getTokenPath() {
  return path.join(app.getPath("userData"), "google-calendar-token.json");
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function readGoogleConfig() {
  const candidates = [
    path.join(app.getPath("userData"), "google-calendar-config.json"),
    path.join(app.getAppPath(), "google-calendar-build-config.json"),
    path.join(process.cwd(), "google-calendar-config.json")
  ];

  for (const candidate of candidates) {
    const config = await readJsonFile(candidate);
    if (config?.clientId && !config.clientId.includes("YOUR_GOOGLE")) {
      return {
        clientId: config.clientId,
        clientSecret: config.clientSecret || "",
        tokenProxyUrl: config.tokenProxyUrl || "",
        path: candidate
      };
    }
    if (config?.installed?.client_id && !config.installed.client_id.includes("YOUR_GOOGLE")) {
      return {
        clientId: config.installed.client_id,
        clientSecret: config.installed.client_secret || "",
        tokenProxyUrl: config.tokenProxyUrl || "",
        path: candidate
      };
    }
  }

  if (DEFAULT_GOOGLE_CLIENT_ID) {
    return {
      clientId: DEFAULT_GOOGLE_CLIENT_ID,
      clientSecret: "",
      tokenProxyUrl: DEFAULT_GOOGLE_TOKEN_PROXY_URL,
      path: "built-in"
    };
  }

  return null;
}

async function readToken() {
  return readJsonFile(getTokenPath());
}

async function writeToken(token) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getTokenPath(), JSON.stringify(token, null, 2));
}

async function removeToken() {
  try {
    await fs.unlink(getTokenPath());
  } catch {
    // The user may disconnect before ever connecting.
  }
}

function getDebugLogPath() {
  return path.join(app.getPath("userData"), "time-tracker-debug.log");
}

function sanitizeLogMessage(value) {
  return String(value)
    .replace(/(code=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(access_token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(refresh_token=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(client_secret=)[^&\s]+/gi, "$1[redacted]");
}

async function writeDebugLog(message, details = {}) {
  try {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    const safeDetails = Object.fromEntries(
      Object.entries(details).map(([key, value]) => [key, sanitizeLogMessage(value)])
    );
    await fs.appendFile(
      getDebugLogPath(),
      `${new Date().toISOString()} ${sanitizeLogMessage(message)} ${JSON.stringify(safeDetails)}\n`
    );
  } catch {
    // Debug logging must never interrupt the app.
  }
}

function createCodeVerifier() {
  return crypto.randomBytes(64).toString("base64url");
}

function createCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

async function postForm(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await writeDebugLog("Google API form request failed", {
      url,
      status: response.status,
      error: payload.error || "",
      errorDescription: payload.error_description || ""
    });
    throw new Error(payload.error_description || payload.error || "Google API request failed");
  }
  return payload;
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    await writeDebugLog("Google token proxy request failed", {
      url,
      status: response.status,
      error: payload.error || "",
      errorDescription: payload.error_description || ""
    });
    throw new Error(payload.error_description || payload.error || "Google token proxy request failed");
  }
  return payload;
}

async function requestGoogleToken(config, googleData, proxyData) {
  if (config.tokenProxyUrl) {
    return postJson(config.tokenProxyUrl, proxyData);
  }

  return postForm(GOOGLE_TOKEN_URL, {
    client_id: config.clientId,
    ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
    ...googleData
  });
}

function normalizeToken(payload, previousToken = {}) {
  return {
    accessToken: payload.access_token || previousToken.accessToken,
    refreshToken: payload.refresh_token || previousToken.refreshToken,
    expiresAt: Date.now() + Math.max(30, payload.expires_in || 3600) * 1000,
    scope: payload.scope || previousToken.scope || GOOGLE_CALENDAR_SCOPE,
    tokenType: payload.token_type || previousToken.tokenType || "Bearer"
  };
}

function hasTokenExchangeConfig(config) {
  return Boolean(config?.tokenProxyUrl || config?.clientSecret);
}

async function refreshAccessToken(token, config) {
  if (!token?.refreshToken) return null;
  if (token.accessToken && token.expiresAt && token.expiresAt - Date.now() > 60 * 1000) {
    return token;
  }
  if (!hasTokenExchangeConfig(config)) {
    throw new Error("Google Calendar 연결 서버 설정이 필요합니다.");
  }

  const payload = await requestGoogleToken(config, {
    refresh_token: token.refreshToken,
    grant_type: "refresh_token"
  }, {
    grantType: "refresh_token",
    refreshToken: token.refreshToken
  });
  const refreshedToken = normalizeToken(payload, token);
  await writeToken(refreshedToken);
  return refreshedToken;
}

function createOAuthServer(expectedState, resolve, reject) {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    if (requestUrl.pathname !== "/oauth2callback") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    const errorDescription = requestUrl.searchParams.get("error_description");
    response.writeHead(error ? 400 : 200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`
      <!doctype html>
      <html lang="ko">
        <head><meta charset="utf-8"><title>Time Tracker</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px;">
          <h1>${error ? "브라우저 인증 실패" : "브라우저 인증 완료"}</h1>
          <p>${error ? "Google Calendar 인증을 완료하지 못했습니다." : "이 창을 닫고 Time Tracker에서 연결 상태를 확인하세요."}</p>
        </body>
      </html>
    `);

    server.close();

    if (error) {
      writeDebugLog("Google OAuth callback failed", { error, errorDescription });
      reject(new Error(errorDescription || error));
      return;
    }
    if (!code || state !== expectedState) {
      writeDebugLog("Google OAuth callback invalid response", {
        hasCode: Boolean(code),
        stateMatched: state === expectedState
      });
      reject(new Error("Invalid Google OAuth response"));
      return;
    }
    resolve(code);
  });

  return server;
}

async function requestAuthorizationCode(config) {
  const verifier = createCodeVerifier();
  const challenge = createCodeChallenge(verifier);
  const state = crypto.randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    const server = createOAuthServer(state, (code) => {
      resolve({ code, verifier, redirectUri });
    }, reject);

    let redirectUri = "";

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("state", state);
      shell.openExternal(url.toString());
    });

    server.on("error", reject);
    setTimeout(() => {
      server.close();
      reject(new Error("Google Calendar connection timed out"));
    }, 2 * 60 * 1000);
  });
}

async function connectGoogleCalendar() {
  const config = await readGoogleConfig();
  if (!config) {
    return {
      configured: false,
      connected: false,
      events: [],
      error: "google-calendar-config.json에 Google OAuth Client ID를 설정해야 합니다."
    };
  }

  try {
    await writeDebugLog("Google Calendar connect started", {
      configPath: config.path,
      clientIdPrefix: config.clientId.slice(0, 18),
      hasClientSecret: Boolean(config.clientSecret),
      hasTokenProxy: Boolean(config.tokenProxyUrl)
    });
    if (!hasTokenExchangeConfig(config)) {
      throw new Error("Google Calendar 연결 서버 설정이 필요합니다.");
    }

    const { code, verifier, redirectUri } = await requestAuthorizationCode(config);
    const payload = await requestGoogleToken(config, {
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    }, {
      grantType: "authorization_code",
      code,
      codeVerifier: verifier,
      redirectUri
    });
    const token = normalizeToken(payload);
    await writeToken(token);
    await writeDebugLog("Google Calendar token saved", {
      hasAccessToken: Boolean(token.accessToken),
      hasRefreshToken: Boolean(token.refreshToken)
    });
    return getCalendarState();
  } catch (error) {
    await writeDebugLog("Google Calendar connect failed", {
      error: error.message || "Unknown error"
    });
    return {
      configured: true,
      connected: false,
      events: [],
      error: error.message || "Google Calendar 연결에 실패했습니다."
    };
  }
}

function normalizeGoogleEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date || start;
  return {
    id: event.id,
    title: event.summary || "제목 없는 일정",
    start,
    end,
    allDay: Boolean(event.start?.date),
    transparency: event.transparency || "opaque",
    responseStatus: event.attendees?.find((attendee) => attendee.self)?.responseStatus || "accepted",
    htmlLink: event.htmlLink || ""
  };
}

async function fetchCalendarEvents() {
  const config = await readGoogleConfig();
  if (!config) {
    return {
      configured: false,
      connected: false,
      events: [],
      error: "google-calendar-config.json에 Google OAuth Client ID를 설정해야 합니다."
    };
  }

  const token = await refreshAccessToken(await readToken(), config);
  if (!token?.accessToken) {
    return { configured: true, connected: false, events: [] };
  }

  const url = new URL(GOOGLE_EVENTS_URL);
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("timeMax", endOfToday.toISOString());
  url.searchParams.set("maxResults", "10");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Google Calendar events request failed");
  }

  return {
    configured: true,
    connected: true,
    events: (payload.items || []).map(normalizeGoogleEvent)
  };
}

async function getCalendarState() {
  const config = await readGoogleConfig();
  if (!config) {
    return {
      configured: false,
      connected: false,
      events: [],
      error: "google-calendar-config.json에 Google OAuth Client ID를 설정해야 합니다."
    };
  }

  const token = await readToken();
  if (!token?.refreshToken && !token?.accessToken) {
    return { configured: true, connected: false, events: [] };
  }

  try {
    return await fetchCalendarEvents();
  } catch (error) {
    return {
      configured: true,
      connected: true,
      events: [],
      error: error.message || "Google Calendar events request failed"
    };
  }
}

ipcMain.handle("calendar:get-state", getCalendarState);
ipcMain.handle("calendar:refresh", getCalendarState);
ipcMain.handle("calendar:connect", connectGoogleCalendar);
ipcMain.handle("calendar:disconnect", async () => {
  await removeToken();
  return getCalendarState();
});
