const els = {
  widget: document.querySelector(".floating-widget"),
  sprite: document.querySelector(".agent-sprite"),
  workTime: document.querySelector("#workTimeLabel"),
  calendar: document.querySelector("#calendarLabel"),
  contextMenu: document.querySelector("#contextMenu"),
  menuThemeButtons: [...document.querySelectorAll("#contextMenu [data-theme-id]")],
  menuSoundButton: document.querySelector("#menuSoundButton"),
  menuToggleButton: document.querySelector("#menuToggleButton"),
  menuResetButton: document.querySelector("#menuResetButton"),
  menuCalendarButton: document.querySelector("#menuCalendarButton")
};

const isDesktopApp = Boolean(window.electronAgent?.moveWindowBy);
const canConnectCalendar = Boolean(window.electronAgent?.connectCalendar);
document.body.classList.toggle("desktop-app", isDesktopApp);

const testMode = new URLSearchParams(window.location.search).get("test");
const actionTestMode = testMode === "actions";
const faceTestMode = testMode === "faces";
const CAT_THEME_STORAGE_KEY = "focusAgentCatTheme";
const TYPING_SOUND_STORAGE_KEY = "focusAgentTypingSound";
const CALENDAR_REFRESH_INTERVAL_MS = 30000;
const CALENDAR_ALERT_MEOW_SRC = "./assets/sounds/sweet-kitty-meow.mp3";
const CALENDAR_ALERT_MEOW_RATE = 1.15;
let typingAudioContext = null;
let calendarAlertMeowAudio = null;

const catThemes = {
  "brown-cat": {
    id: "brown-cat",
    name: "치즈",
    states: {
      typing: {
        src: "./assets/themes/brown-cat/typing.apng?v=3",
        type: "apng",
        loop: true,
        durationMs: 840
      }
    }
  },
  "black-cat": {
    id: "black-cat",
    name: "까망",
    states: {
      typing: {
        src: "./assets/themes/black-cat/typing.apng?v=3",
        type: "apng",
        loop: true,
        durationMs: 840
      }
    }
  },
  "calico-cat": {
    id: "calico-cat",
    name: "삼색이",
    states: {
      typing: {
        src: "./assets/themes/calico-cat/typing.apng?v=3",
        type: "apng",
        loop: true,
        durationMs: 840
      }
    }
  },
  "siamese-cat": {
    id: "siamese-cat",
    name: "샴",
    states: {
      typing: {
        src: "./assets/themes/siamese-cat/typing.apng?v=3",
        type: "apng",
        loop: true,
        durationMs: 840
      }
    }
  }
};

function readSavedCatTheme() {
  try {
    const savedTheme = localStorage.getItem(CAT_THEME_STORAGE_KEY);
    return catThemes[savedTheme] ? savedTheme : "brown-cat";
  } catch {
    return "brown-cat";
  }
}

function writeSavedCatTheme(themeId) {
  try {
    localStorage.setItem(CAT_THEME_STORAGE_KEY, themeId);
  } catch {
    // Theme persistence is optional; switching still works for the current session.
  }
}

function readSavedTypingSound() {
  try {
    return localStorage.getItem(TYPING_SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function writeSavedTypingSound(enabled) {
  try {
    localStorage.setItem(TYPING_SOUND_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Sound persistence is optional; the current session can still toggle it.
  }
}

const actionSprites = {
  typing: {
    src: "./assets/frames/cat-typing-sprite-final.png?v=1",
    frameCount: 10
  },
  colaAction: {
    src: "./assets/frames/cat-cola-sprite-final.png?v=1",
    frameCount: 12
  },
  sleepyAction: {
    src: "./assets/frames/cat-sleepy-sprite-final.png?v=1",
    frameCount: 10
  },
  angryAction: {
    src: "./assets/frames/cat-angry-sprite-final.png?v=1",
    frameCount: 10
  }
};

const frames = {
  idle: 0,
  tired: 1,
  happy: 2,
  angry: 3,
  cola: 4,
  sleepy: 5,
  focus: 6,
  stuck: 7,
  proud: 8,
  angryWork: 9,
  startled: 10,
  celebrate: 11,
  colaAction: actionSprites.colaAction,
  sleepyAction: actionSprites.sleepyAction,
  angryAction: actionSprites.angryAction
};

const expressionFrameCount = 12;
const expressionSprite = {
  src: "./assets/frames/cat-expression-sprite-manual-single-12-gutter-160.png?v=2",
  cellSize: 832,
  frameSize: 512,
  gutter: 160
};

const behaviorPolicy = {
  startDelay: 14000,
  expressionDuration: 2000,
  normalEventInterval: 25000,
  longWorkEventInterval: 18000,
  longWorkAfter: 20 * 60,
  startledCooldown: 10 * 60 * 1000
};

const preloadedSpriteImages = [];

function preloadSpriteImages() {
  Object.values(catThemes).forEach((theme) => {
    const img = new Image();
    img.decoding = "async";
    preloadedSpriteImages.push(img);
    img.src = theme.states.typing.src;
    if (img.decode) img.decode().catch(() => {});
  });
}

const state = {
  running: false,
  elapsed: 0,
  timerId: null,
  animationTimerId: null,
  soundTimerId: null,
  calendarAlertTimerId: null,
  calendarAlertScheduleTimerIds: [],
  activeCalendarAlert: null,
  notifiedCalendarAlerts: new Set(),
  bubbleHover: false,
  contextMenuOpen: false,
  windowMode: "compact",
  activeFrame: null,
  selectedThemeId: readSavedCatTheme(),
  typingSoundEnabled: readSavedTypingSound(),
  frameIndex: 0,
  activeExpression: null,
  forcedFrame: null,
  forcedFrameUntil: 0,
  expressionHoldUntil: 0,
  nextExpressionAt: 0,
  startledCooldownUntil: 0,
  drag: {
    active: false,
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
    lastScreenX: 0,
    lastScreenY: 0
  },
  calendar: {
    loading: false,
    refreshing: false,
    configured: false,
    connected: false,
    events: [],
    error: ""
  }
};

function syncWindowMode() {
  const shouldExpand = state.bubbleHover || state.contextMenuOpen || Boolean(state.calendarAlertTimerId);
  const nextMode = shouldExpand ? "expanded" : "compact";
  els.widget.classList.toggle("bubble-visible", shouldExpand && !state.calendarAlertTimerId);
  if (state.windowMode === nextMode) return;
  state.windowMode = nextMode;
  if (window.electronAgent?.setWindowMode) {
    window.electronAgent.setWindowMode(nextMode);
  }
}

function readSavedPosition() {
  try {
    return JSON.parse(localStorage.getItem("focusAgentPosition") || "null");
  } catch {
    return null;
  }
}

function writeSavedPosition(position) {
  try {
    localStorage.setItem("focusAgentPosition", JSON.stringify(position));
  } catch {
    // Position persistence is optional; dragging still works without storage.
  }
}

const savedPosition = readSavedPosition();
if (savedPosition && !isDesktopApp) {
  els.widget.style.left = `${savedPosition.left}px`;
  els.widget.style.top = `${savedPosition.top}px`;
  els.widget.style.right = "auto";
  els.widget.style.bottom = "auto";
}

function formatTime(seconds) {
  const hour = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const min = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  return `${hour}:${min}:${sec}`;
}

function formatScheduleTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul"
  }).format(date);
}

function formatScheduleDateTime(date) {
  const now = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  }).format(date) === new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul"
  }).format(now);

  if (sameDay) return formatScheduleTime(date);

  const day = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Seoul"
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type === "month") acc.month = part.value;
    if (part.type === "day") acc.day = part.value;
    return acc;
  }, {});
  const dayLabel = `${day.month}/${day.day}`;
  return `${dayLabel} ${formatScheduleTime(date)}`;
}

function formatRelativeTime(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}분 후`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분 후` : `${hours}시간 후`;
}

function getLocalDayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isEventOnLocalDay(event, date = new Date()) {
  const { start, end } = getLocalDayBounds(date);
  return event.startDate <= end && event.endDate >= start;
}

function getCalendarEvents() {
  const localEvents = window.__FOCUS_AGENT_CALENDAR__?.events || [];
  const dynamicEvents = state.calendar.events || [];
  const events = dynamicEvents.length ? dynamicEvents : localEvents;
  if (!events.length) return [];

  return events
    .filter((event) => event.transparency !== "transparent" && event.responseStatus !== "declined")
    .map((event) => ({
      ...event,
      startDate: new Date(event.start),
      endDate: new Date(event.end)
    }))
    .filter((event) => isEventOnLocalDay(event))
    .sort((a, b) => a.startDate - b.startDate);
}

function getNextTimedEvent(now = new Date()) {
  const { end } = getLocalDayBounds(now);
  return getCalendarEvents().find((event) => !event.allDay && event.startDate > now && event.startDate <= end);
}

function hasUpcomingEventSoon(now = new Date()) {
  const nextEvent = getNextTimedEvent(now);
  if (!nextEvent) return false;
  const msUntilStart = nextEvent.startDate - now;
  return msUntilStart >= 0 && msUntilStart <= 10 * 60 * 1000;
}

function getCalendarAlertKey(event, minutesBefore) {
  return `${event.id || event.title}-${event.start}-${minutesBefore}`;
}

function clearCalendarAlert() {
  window.clearTimeout(state.calendarAlertTimerId);
  state.calendarAlertTimerId = null;
  state.activeCalendarAlert = null;
  els.widget.classList.remove("calendar-alert-visible");
  syncWindowMode();
}

function clearScheduledCalendarAlerts() {
  state.calendarAlertScheduleTimerIds.forEach((timerId) => window.clearTimeout(timerId));
  state.calendarAlertScheduleTimerIds = [];
}

function resumeTypingSoundAfterAlert() {
  if (state.running && state.typingSoundEnabled) {
    scheduleTypingSound();
  }
}

function playCalendarAlertMeow() {
  stopTypingSoundLoop();
  if (!calendarAlertMeowAudio) {
    calendarAlertMeowAudio = new Audio(CALENDAR_ALERT_MEOW_SRC);
    calendarAlertMeowAudio.preload = "auto";
  }

  calendarAlertMeowAudio.pause();
  calendarAlertMeowAudio.currentTime = 0;
  calendarAlertMeowAudio.playbackRate = CALENDAR_ALERT_MEOW_RATE;
  calendarAlertMeowAudio.onended = resumeTypingSoundAfterAlert;
  calendarAlertMeowAudio.onerror = resumeTypingSoundAfterAlert;

  const playPromise = calendarAlertMeowAudio.play();
  if (playPromise) {
    playPromise.catch(resumeTypingSoundAfterAlert);
  }
}

function scheduleCalendarAlerts(now = new Date()) {
  clearScheduledCalendarAlerts();
  const nextEvent = getNextTimedEvent(now);
  if (!nextEvent) return;

  [10, 5].forEach((minutesBefore) => {
    const alertAt = nextEvent.startDate.getTime() - minutesBefore * 60 * 1000;
    const delay = alertAt - now.getTime();
    if (delay < 0) return;

    const timerId = window.setTimeout(() => {
      checkCalendarAlerts(new Date());
      scheduleCalendarAlerts(new Date());
    }, delay + 50);
    state.calendarAlertScheduleTimerIds.push(timerId);
  });
}

function showCalendarAlert(event, minutesBefore) {
  clearCalendarAlert();
  els.widget.classList.add("calendar-alert-visible");
  els.calendar.textContent = `${minutesBefore}분 전 알림 ${event.title}`;
  els.calendar.title = `${formatScheduleTime(event.startDate)} 시작 · ${event.title}`;
  state.activeCalendarAlert = {
    eventId: event.id || "",
    start: event.start,
    minutesBefore
  };
  pulseCalendarFeedback();
  playCalendarAlertMeow();
  state.calendarAlertTimerId = window.setTimeout(() => {
    state.calendarAlertTimerId = null;
    state.activeCalendarAlert = null;
    els.widget.classList.remove("calendar-alert-visible");
    updateCalendarLabel();
    syncWindowMode();
  }, 12000);
  syncWindowMode();
}

function checkCalendarAlerts(now = new Date()) {
  const nextEvent = getNextTimedEvent(now);
  if (!nextEvent) return;
  const msUntilStart = nextEvent.startDate - now;
  if (msUntilStart < 0 || msUntilStart > 10 * 60 * 1000) return;

  const minutesBefore = msUntilStart <= 5 * 60 * 1000 ? 5 : 10;
  const alertKey = getCalendarAlertKey(nextEvent, minutesBefore);
  if (state.notifiedCalendarAlerts.has(alertKey)) return;
  state.notifiedCalendarAlerts.add(alertKey);
  showCalendarAlert(nextEvent, minutesBefore);
}

function reconcileCalendarAlert(now = new Date()) {
  if (!state.activeCalendarAlert || !state.calendarAlertTimerId) return false;
  const nextEvent = getNextTimedEvent(now);
  const activeAlert = state.activeCalendarAlert;
  const sameEvent =
    nextEvent &&
    (activeAlert.eventId ? nextEvent.id === activeAlert.eventId : nextEvent.start === activeAlert.start) &&
    nextEvent.start === activeAlert.start;

  if (!sameEvent) {
    clearCalendarAlert();
    return true;
  }

  els.calendar.textContent = `${activeAlert.minutesBefore}분 전 알림 ${nextEvent.title}`;
  els.calendar.title = `${formatScheduleTime(nextEvent.startDate)} 시작 · ${nextEvent.title}`;
  return false;
}

function updateCalendarLabel() {
  if (state.calendarAlertTimerId) return;
  const events = getCalendarEvents();
  if (!events.length) {
    if (state.calendar.loading) {
      els.calendar.textContent = "캘린더 확인 중";
    } else if (!state.calendar.configured && state.calendar.error && canConnectCalendar) {
      els.calendar.textContent = "캘린더 설정 필요";
      els.calendar.title = state.calendar.error;
    } else if (state.calendar.error && canConnectCalendar) {
      els.calendar.textContent = "캘린더 연결 실패";
      els.calendar.title = state.calendar.error;
    } else if (state.calendar.configured && !state.calendar.connected) {
      els.calendar.textContent = "캘린더 연결 필요";
      els.calendar.title = "캘린더 버튼을 눌러 Google Calendar를 연결하세요.";
    } else {
      els.calendar.textContent = "오늘 일정 없음";
      els.calendar.removeAttribute("title");
    }
    return;
  }

  const now = new Date();
  const currentAllDay = events.find((event) => event.allDay && event.startDate <= now && now < event.endDate);
  const nextTimed = getNextTimedEvent(now);

  if (nextTimed) {
    els.calendar.textContent = `${formatScheduleDateTime(nextTimed.startDate)} ${nextTimed.title}`;
    els.calendar.title = `${formatRelativeTime(nextTimed.startDate - now)} · ${nextTimed.title}`;
    return;
  }

  if (currentAllDay) {
    els.calendar.textContent = `오늘 ${currentAllDay.title}`;
    els.calendar.title = currentAllDay.title;
    return;
  }

  els.calendar.textContent = "오늘 일정 없음";
  els.calendar.removeAttribute("title");
}

function updateControls() {
  els.workTime.textContent = formatTime(state.elapsed);
  const toggleLabel = state.running ? "일시정지" : state.elapsed > 0 ? "다시 시작" : "시작";
  els.widget.classList.toggle("working", state.running);
  els.menuThemeButtons.forEach((button) => {
    const selected = button.dataset.themeId === state.selectedThemeId;
    button.setAttribute("aria-checked", selected ? "true" : "false");
  });
  els.menuSoundButton.setAttribute("aria-checked", state.typingSoundEnabled ? "true" : "false");
  els.menuSoundButton.disabled = !state.running;
  els.menuSoundButton.querySelector("strong").textContent = state.typingSoundEnabled ? "ON" : "OFF";
  els.menuToggleButton.textContent = toggleLabel;
  els.menuResetButton.textContent = "끝내기";
  els.menuCalendarButton.textContent = state.calendar.connected
    ? "캘린더 연결 해제"
    : "캘린더 연결";
  els.menuCalendarButton.disabled = state.calendar.loading;
}

function showFrame(frame) {
  if (state.activeFrame === frame) return;
  els.sprite.classList.remove("typing");
  els.sprite.style.backgroundImage = `url("${expressionSprite.src}")`;
  const scale = els.sprite.getBoundingClientRect().width / expressionSprite.frameSize;
  const width = expressionFrameCount * expressionSprite.cellSize * scale;
  const x = -(frame * expressionSprite.cellSize + expressionSprite.gutter) * scale;
  els.sprite.style.backgroundSize = `${width}px 100%`;
  els.sprite.style.backgroundPosition = `${x}px 50%`;
  state.activeFrame = frame;
}

function showSpriteFrame(sprite, frame) {
  const normalizedFrame = Math.max(0, Math.min(sprite.frameCount - 1, frame));
  const activeKey = `${sprite.src}-${normalizedFrame}`;
  if (state.activeFrame === activeKey) return;
  els.sprite.classList.toggle("typing", sprite === actionSprites.typing);
  els.sprite.style.backgroundImage = `url("${sprite.src}")`;
  els.sprite.style.backgroundSize = `${sprite.frameCount * 100}% 100%`;
  els.sprite.style.backgroundPosition = `${normalizedFrame * (100 / (sprite.frameCount - 1))}% 50%`;
  state.activeFrame = activeKey;
}

function showTypingFrame(frame) {
  showSpriteFrame(actionSprites.typing, frame);
}

function getSelectedTheme() {
  return catThemes[state.selectedThemeId] || catThemes["brown-cat"];
}

function showCurrentThemeTyping() {
  const theme = getSelectedTheme();
  const typing = theme.states.typing;
  const activeKey = `${theme.id}:typing`;
  if (state.activeFrame === activeKey) return;
  els.sprite.classList.add("typing");
  els.sprite.src = typing.src;
  els.sprite.title = theme.name;
  state.activeFrame = activeKey;
}

function stopTypingSoundLoop() {
  if (!state.soundTimerId) return;
  clearTimeout(state.soundTimerId);
  state.soundTimerId = null;
}

function getTypingAudioContext() {
  if (!typingAudioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    typingAudioContext = new AudioContextCtor();
  }
  if (typingAudioContext.state !== "running") {
    typingAudioContext.resume();
  }
  return typingAudioContext;
}

function playKeyNoise(context, duration, frequency, q, gainValue, now) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * Math.exp(-index / (length * 0.2));
  }

  const source = context.createBufferSource();
  const bandpass = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  bandpass.type = "bandpass";
  bandpass.frequency.value = frequency;
  bandpass.Q.value = q;
  source.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(context.destination);
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.start(now);
  source.stop(now + duration + 0.01);
}

function playKeyPress() {
  const context = getTypingAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const intensity = 0.62 + Math.random() * 0.58;
  const pitchDrift = 0.86 + Math.random() * 0.28;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime((1500 + Math.random() * 520) * pitchDrift, now);
  oscillator.frequency.exponentialRampToValueAtTime((520 + Math.random() * 180) * pitchDrift, now + 0.014);
  gain.gain.setValueAtTime(0.055 * intensity, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
  oscillator.start(now);
  oscillator.stop(now + 0.02);

  playKeyNoise(
    context,
    0.02 + Math.random() * 0.018,
    (2700 + Math.random() * 1200) * pitchDrift,
    0.55 + Math.random() * 0.35,
    0.026 * intensity,
    now
  );

  const thock = context.createOscillator();
  const thockGain = context.createGain();
  thock.connect(thockGain);
  thockGain.connect(context.destination);
  thock.type = "sine";
  thock.frequency.setValueAtTime((120 + Math.random() * 55) * pitchDrift, now + 0.007);
  thock.frequency.exponentialRampToValueAtTime((48 + Math.random() * 22) * pitchDrift, now + 0.04);
  thockGain.gain.setValueAtTime(0, now);
  thockGain.gain.setValueAtTime(0.045 * intensity, now + 0.007);
  thockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
  thock.start(now);
  thock.stop(now + 0.065);
}

function playKeyRelease() {
  const context = getTypingAudioContext();
  if (!context) return;
  const now = context.currentTime;
  const intensity = 0.55 + Math.random() * 0.45;
  const pitchDrift = 0.9 + Math.random() * 0.25;
  const release = context.createOscillator();
  const gain = context.createGain();
  release.connect(gain);
  gain.connect(context.destination);
  release.type = "square";
  release.frequency.setValueAtTime((1080 + Math.random() * 420) * pitchDrift, now);
  release.frequency.exponentialRampToValueAtTime((430 + Math.random() * 160) * pitchDrift, now + 0.011);
  gain.gain.setValueAtTime(0.025 * intensity, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.013);
  release.start(now);
  release.stop(now + 0.017);
}

function playTypingSound() {
  if (!state.running || !state.typingSoundEnabled) return;
  playKeyPress();
  if (Math.random() > 0.18) {
    window.setTimeout(playKeyRelease, 42 + Math.random() * 78);
  }
}

function scheduleTypingSound() {
  stopTypingSoundLoop();
  if (!state.running || !state.typingSoundEnabled) return;
  const burst = Math.random() > 0.72;
  const delay = burst ? 70 + Math.random() * 75 : 145 + Math.random() * 205;
  state.soundTimerId = setTimeout(() => {
    playTypingSound();
    scheduleTypingSound();
  }, delay);
}

function toggleTypingSound() {
  state.typingSoundEnabled = !state.typingSoundEnabled;
  writeSavedTypingSound(state.typingSoundEnabled);
  if (state.typingSoundEnabled) {
    scheduleTypingSound();
  } else {
    stopTypingSoundLoop();
  }
  updateControls();
}

function selectCatTheme(themeId) {
  if (!catThemes[themeId] || state.selectedThemeId === themeId) return;
  state.selectedThemeId = themeId;
  writeSavedCatTheme(themeId);
  state.activeFrame = null;
  showCurrentThemeTyping();
  updateControls();
}

function closeContextMenu() {
  state.contextMenuOpen = false;
  els.contextMenu.dataset.open = "false";
  els.contextMenu.dataset.submenuReady = "false";
  els.contextMenu.setAttribute("aria-hidden", "true");
  syncWindowMode();
}

function openContextMenu(event) {
  event.preventDefault();
  if (window.electronAgent?.showContextMenu) {
    window.electronAgent.showContextMenu({
      selectedThemeId: state.selectedThemeId,
      typingSoundEnabled: state.typingSoundEnabled,
      running: state.running,
      elapsed: state.elapsed,
      calendarConnected: state.calendar.connected,
      calendarLoading: state.calendar.loading
    });
    return;
  }
  state.contextMenuOpen = true;
  syncWindowMode();
  els.contextMenu.dataset.open = "true";
  els.contextMenu.dataset.submenuReady = "false";
  state.contextMenuOpenedAt = { x: event.clientX, y: event.clientY };
  els.contextMenu.style.visibility = "hidden";
  const menuRect = els.contextMenu.getBoundingClientRect();
  const submenuWidth = 196;
  const left = Math.min(
    Math.max(8, event.clientX),
    window.innerWidth - menuRect.width - 8
  );
  const top = Math.min(
    Math.max(8, event.clientY),
    window.innerHeight - menuRect.height - 8
  );
  const opensLeft = left + menuRect.width + submenuWidth > window.innerWidth;
  els.contextMenu.style.left = `${left}px`;
  els.contextMenu.style.top = `${top}px`;
  els.contextMenu.dataset.submenuSide = opensLeft ? "left" : "right";
  els.contextMenu.style.visibility = "visible";
  els.contextMenu.setAttribute("aria-hidden", "false");
  updateControls();
}

function handleContextMenuCommand(command) {
  if (!command?.type) return;
  if (command.type === "select-theme") {
    selectCatTheme(command.themeId);
    return;
  }
  if (command.type === "toggle-sound") {
    if (state.running) toggleTypingSound();
    return;
  }
  if (command.type === "toggle-calendar") {
    toggleCalendarConnection();
    return;
  }
  if (command.type === "toggle-timer") {
    toggle();
    return;
  }
  if (command.type === "quit") {
    endApp();
  }
}

function endApp() {
  if (window.electronAgent?.quitApp) {
    window.electronAgent.quitApp();
    return;
  }
  els.widget.hidden = true;
}

function showCalendarUnavailable() {
  els.calendar.textContent = "앱에서 캘린더 연결 가능";
  els.calendar.title = "Google Calendar 연결은 Electron 앱에서 사용할 수 있습니다.";
  pulseCalendarFeedback();
}

function showExpression(expression, now = Date.now()) {
  if (expression?.src && expression?.frameCount) {
    state.activeExpression = {
      sprite: expression,
      startedAt: now,
      frameDelay: Math.max(130, Math.round(2000 / expression.frameCount))
    };
    showSpriteFrame(expression, 0);
    return;
  }

  state.activeExpression = null;
  showFrame(expression);
}

function updateActiveExpression(now) {
  if (!state.activeExpression) return;
  const { sprite, startedAt, frameDelay } = state.activeExpression;
  const frame = Math.min(sprite.frameCount - 1, Math.floor((now - startedAt) / frameDelay));
  showSpriteFrame(sprite, frame);
}

function weightedChoice(choices) {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let cursor = Math.random() * total;
  for (const choice of choices) {
    cursor -= choice.weight;
    if (cursor <= 0) return choice.value;
  }
  return choices[choices.length - 1].value;
}

function getNextEventInterval() {
  return state.elapsed >= behaviorPolicy.longWorkAfter
    ? behaviorPolicy.longWorkEventInterval
    : behaviorPolicy.normalEventInterval;
}

function chooseExpression(now = Date.now()) {
  if (!state.running) return frames.idle;
  if (hasUpcomingEventSoon() && now >= state.startledCooldownUntil) {
    state.startledCooldownUntil = now + behaviorPolicy.startledCooldown;
    return frames.startled;
  }

  const longWork = state.elapsed >= behaviorPolicy.longWorkAfter;
  const choices = longWork
    ? [
        { value: frames.sleepyAction, weight: 5 },
        { value: frames.colaAction, weight: 4 },
        { value: frames.angryAction, weight: 4 },
        { value: frames.tired, weight: 3 },
        { value: frames.stuck, weight: 2 },
        { value: frames.focus, weight: 2 }
      ]
    : [
        { value: frames.colaAction, weight: 2 },
        { value: frames.sleepyAction, weight: 2 },
        { value: frames.angryAction, weight: 3 },
        { value: frames.focus, weight: 3 },
        { value: frames.stuck, weight: 2 },
        { value: frames.proud, weight: 2 },
        { value: frames.happy, weight: 1 }
      ];
  return weightedChoice(choices);
}

function animateAgent() {
  state.activeExpression = null;
  state.forcedFrame = null;
  state.forcedFrameUntil = 0;
  showCurrentThemeTyping();
}

function tick() {
  if (!state.running) return;
  state.elapsed += 1;
  updateControls();
}

function toggle() {
  state.running = !state.running;
  state.activeExpression = null;
  state.forcedFrame = null;
  state.forcedFrameUntil = 0;
  state.expressionHoldUntil = 0;
  state.nextExpressionAt = 0;
  updateControls();
  animateAgent();
  scheduleTypingSound();
}

function reset() {
  state.running = false;
  stopTypingSoundLoop();
  state.elapsed = 0;
  state.activeExpression = null;
  state.forcedFrame = null;
  state.forcedFrameUntil = 0;
  state.expressionHoldUntil = 0;
  state.nextExpressionAt = 0;
  updateControls();
  animateAgent();
}

function clampPosition(left, top) {
  const rect = els.widget.getBoundingClientRect();
  return {
    left: Math.min(Math.max(0, left), window.innerWidth - rect.width),
    top: Math.min(Math.max(0, top), window.innerHeight - rect.height)
  };
}

function placeWidget(left, top) {
  const next = clampPosition(left, top);
  els.widget.style.left = `${next.left}px`;
  els.widget.style.top = `${next.top}px`;
  els.widget.style.right = "auto";
  els.widget.style.bottom = "auto";
  return next;
}

function saveWidgetPosition() {
  const rect = els.widget.getBoundingClientRect();
  writeSavedPosition({
    left: Math.round(rect.left),
    top: Math.round(rect.top)
  });
}

function startDrag(event) {
  if (event.button === 2 || event.target.closest(".context-menu")) return;
  const rect = els.widget.getBoundingClientRect();
  state.drag.active = true;
  state.drag.pointerId = event.pointerId ?? "mouse";
  state.drag.offsetX = event.clientX - rect.left;
  state.drag.offsetY = event.clientY - rect.top;
  state.drag.lastScreenX = event.screenX;
  state.drag.lastScreenY = event.screenY;
  els.widget.classList.add("dragging");
  if (event.pointerId !== undefined && els.widget.setPointerCapture) {
    els.widget.setPointerCapture(event.pointerId);
  }
}

function moveDrag(event) {
  const pointerId = event.pointerId ?? "mouse";
  if (!state.drag.active || pointerId !== state.drag.pointerId) return;
  if (isDesktopApp) {
    window.electronAgent.moveWindowBy({
      x: event.screenX - state.drag.lastScreenX,
      y: event.screenY - state.drag.lastScreenY
    });
    state.drag.lastScreenX = event.screenX;
    state.drag.lastScreenY = event.screenY;
    return;
  }
  placeWidget(event.clientX - state.drag.offsetX, event.clientY - state.drag.offsetY);
}

function endDrag(event) {
  const pointerId = event.pointerId ?? "mouse";
  if (!state.drag.active || pointerId !== state.drag.pointerId) return;
  state.drag.active = false;
  state.drag.pointerId = null;
  els.widget.classList.remove("dragging");
  if (!isDesktopApp) saveWidgetPosition();
}

function applyCalendarState(nextState) {
  state.calendar = {
    ...state.calendar,
    loading: false,
    refreshing: false,
    configured: Boolean(nextState?.configured),
    connected: Boolean(nextState?.connected),
    events: nextState?.events || [],
    error: nextState?.error || ""
  };
  updateControls();
  reconcileCalendarAlert();
  updateCalendarLabel();
  checkCalendarAlerts();
  scheduleCalendarAlerts();
}

function pulseCalendarFeedback() {
  const badge = els.calendar.closest(".time-badge");
  if (!badge) return;
  badge.classList.remove("calendar-feedback");
  void badge.offsetWidth;
  badge.classList.add("calendar-feedback");
}

async function loadCalendarState({ silent = false } = {}) {
  if (!canConnectCalendar) {
    updateCalendarLabel();
    return;
  }
  if (state.calendar.refreshing) return;
  state.calendar.refreshing = true;
  if (!silent) {
    state.calendar.loading = true;
    updateCalendarLabel();
  }
  try {
    applyCalendarState(await window.electronAgent.getCalendarState());
  } catch (error) {
    applyCalendarState({
      configured: false,
      connected: false,
      events: [],
      error: error.message || "캘린더 상태를 가져오지 못했습니다."
    });
  }
}

async function toggleCalendarConnection() {
  if (state.calendar.loading) return;
  if (!canConnectCalendar) {
    showCalendarUnavailable();
    return;
  }
  state.calendar.loading = true;
  updateControls();
  updateCalendarLabel();

  try {
    const nextState = state.calendar.connected
      ? await window.electronAgent.disconnectCalendar()
      : await window.electronAgent.connectCalendar();
    applyCalendarState(nextState);
    pulseCalendarFeedback();
  } catch (error) {
    applyCalendarState({
      configured: state.calendar.configured,
      connected: false,
      events: [],
      error: error.message || "Google Calendar 연결에 실패했습니다."
    });
    pulseCalendarFeedback();
  }
}

els.menuThemeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectCatTheme(button.dataset.themeId);
    closeContextMenu();
  });
});
els.menuSoundButton.addEventListener("click", () => {
  toggleTypingSound();
  closeContextMenu();
});
els.menuToggleButton.addEventListener("click", () => {
  toggle();
  closeContextMenu();
});
els.menuResetButton.addEventListener("click", () => {
  endApp();
  closeContextMenu();
});
els.menuCalendarButton.addEventListener("click", () => {
  toggleCalendarConnection();
  closeContextMenu();
});
els.widget.addEventListener("contextmenu", openContextMenu);
els.widget.addEventListener("mouseenter", () => {
  state.bubbleHover = true;
  syncWindowMode();
});
els.widget.addEventListener("mouseleave", () => {
  state.bubbleHover = false;
  syncWindowMode();
});
els.contextMenu.addEventListener("mousemove", (event) => {
  const openedAt = state.contextMenuOpenedAt;
  if (!openedAt || els.contextMenu.dataset.submenuReady === "true") return;
  if (Math.hypot(event.clientX - openedAt.x, event.clientY - openedAt.y) > 6) {
    els.contextMenu.dataset.submenuReady = "true";
  }
});
window.addEventListener("click", (event) => {
  if (!event.target.closest(".context-menu")) closeContextMenu();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeContextMenu();
});
els.widget.addEventListener("pointerdown", startDrag);
els.widget.addEventListener("pointermove", moveDrag);
els.widget.addEventListener("pointerup", endDrag);
els.widget.addEventListener("pointercancel", endDrag);
els.widget.addEventListener("mousedown", startDrag);
window.addEventListener("mousemove", moveDrag);
window.addEventListener("mouseup", endDrag);
window.addEventListener("resize", () => {
  const rect = els.widget.getBoundingClientRect();
  placeWidget(rect.left, rect.top);
  saveWidgetPosition();
});

state.timerId = setInterval(tick, 1000);
setInterval(() => {
  if (state.calendar.connected && canConnectCalendar) {
    loadCalendarState({ silent: true });
    return;
  }
  updateCalendarLabel();
  checkCalendarAlerts();
  scheduleCalendarAlerts();
}, CALENDAR_REFRESH_INTERVAL_MS);
preloadSpriteImages();
window.electronAgent?.onContextMenuCommand?.(handleContextMenuCommand);
updateControls();
syncWindowMode();
loadCalendarState();
checkCalendarAlerts();
scheduleCalendarAlerts();
if (actionTestMode) {
  const testActions = [actionSprites.typing, frames.colaAction, frames.sleepyAction, frames.angryAction];
  let actionIndex = 0;

  showExpression(testActions[actionIndex]);
  state.expressionHoldUntil = Date.now() + 2200;
  state.animationTimerId = setInterval(() => updateActiveExpression(Date.now()), 100);

  setInterval(() => {
    actionIndex = (actionIndex + 1) % testActions.length;
    showExpression(testActions[actionIndex]);
    state.expressionHoldUntil = Date.now() + 2200;
  }, 2600);
} else if (faceTestMode) {
  const testFaces = [
    frames.idle,
    frames.tired,
    frames.happy,
    frames.angry,
    frames.cola,
    frames.sleepy,
    frames.focus,
    frames.stuck,
    frames.proud,
    frames.angryWork,
    frames.startled,
    frames.celebrate
  ];
  let faceIndex = 0;

  showFrame(testFaces[faceIndex]);
  state.animationTimerId = setInterval(() => {
    faceIndex = (faceIndex + 1) % testFaces.length;
    showFrame(testFaces[faceIndex]);
  }, 1200);
} else {
  animateAgent();
}
