const els = {
  widget: document.querySelector(".floating-widget"),
  sprite: document.querySelector(".agent-sprite"),
  workTime: document.querySelector("#workTimeLabel"),
  calendar: document.querySelector("#calendarLabel"),
  toggle: document.querySelector("#toggleButton"),
  reset: document.querySelector("#resetButton"),
  calendarButton: document.querySelector("#calendarButton")
};

const isDesktopApp = Boolean(window.electronAgent?.moveWindowBy);
const canConnectCalendar = Boolean(window.electronAgent?.connectCalendar);
document.body.classList.toggle("desktop-app", isDesktopApp);

const testMode = new URLSearchParams(window.location.search).get("test");
const actionTestMode = testMode === "actions";
const faceTestMode = testMode === "faces";

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
  [
    expressionSprite.src,
    ...Object.values(actionSprites).map((sprite) => sprite.src)
  ].forEach((src) => {
    const img = new Image();
    img.decoding = "async";
    preloadedSpriteImages.push(img);
    img.src = src;
    if (img.decode) img.decode().catch(() => {});
  });
}

const state = {
  running: false,
  elapsed: 0,
  timerId: null,
  animationTimerId: null,
  activeFrame: null,
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
    configured: false,
    connected: false,
    events: [],
    error: ""
  }
};

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
    .sort((a, b) => a.startDate - b.startDate);
}

function getNextTimedEvent(now = new Date()) {
  return getCalendarEvents().find((event) => !event.allDay && event.startDate >= now);
}

function hasUpcomingEventSoon(now = new Date()) {
  const nextEvent = getNextTimedEvent(now);
  if (!nextEvent) return false;
  const msUntilStart = nextEvent.startDate - now;
  return msUntilStart >= 0 && msUntilStart <= 10 * 60 * 1000;
}

function updateCalendarLabel() {
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
      els.calendar.textContent = "다음 일정 없음";
      els.calendar.removeAttribute("title");
    }
    return;
  }

  const now = new Date();
  const currentAllDay = events.find((event) => event.allDay && event.startDate <= now && now < event.endDate);
  const nextTimed = getNextTimedEvent(now);
  const currentTimed = events.find((event) => !event.allDay && event.startDate <= now && now < event.endDate);

  if (currentTimed) {
    els.calendar.textContent = `진행 중 ${currentTimed.title}`;
    return;
  }

  if (nextTimed) {
    els.calendar.textContent = `${formatScheduleDateTime(nextTimed.startDate)} ${nextTimed.title}`;
    els.calendar.title = `${formatRelativeTime(nextTimed.startDate - now)} · ${nextTimed.title}`;
    return;
  }

  if (currentAllDay) {
    els.calendar.textContent = `오늘 ${currentAllDay.title}`;
    return;
  }

  els.calendar.textContent = "다음 일정 없음";
}

function updateControls() {
  els.workTime.textContent = formatTime(state.elapsed);
  els.toggle.textContent = state.running ? "일시정지" : state.elapsed > 0 ? "다시 시작" : "시작";
  els.reset.textContent = state.running ? "끝내기" : state.elapsed > 0 ? "초기화" : "끝내기";
  els.widget.classList.toggle("working", state.running);

  if (!els.calendarButton) return;
  els.calendarButton.hidden = !canConnectCalendar;
  els.calendarButton.disabled = state.calendar.loading;
  els.calendarButton.dataset.connected = state.calendar.connected ? "true" : "false";
  els.calendarButton.setAttribute(
    "aria-label",
    state.calendar.connected ? "Google Calendar 연결 해제" : "Google Calendar 연결"
  );
  els.calendarButton.title = state.calendar.connected
    ? "Google Calendar 연결 해제"
    : "Google Calendar 연결";
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
  const now = Date.now();

  if (state.forcedFrame !== null) {
    if (now < state.forcedFrameUntil) {
      showFrame(state.forcedFrame);
      return;
    }
    state.forcedFrame = null;
    state.forcedFrameUntil = 0;
  }

  if (!state.running) {
    state.activeExpression = null;
    showFrame(state.elapsed > 0 ? frames.happy : frames.idle);
    return;
  }

  if (now < state.expressionHoldUntil) {
    updateActiveExpression(now);
    return;
  }

  state.activeExpression = null;

  if (now >= state.nextExpressionAt) {
    showExpression(chooseExpression(), now);
    state.expressionHoldUntil = now + behaviorPolicy.expressionDuration;
    state.nextExpressionAt = now + getNextEventInterval();
    return;
  }

  showTypingFrame(state.frameIndex % 10);
  state.frameIndex += 1;
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
  state.nextExpressionAt = Date.now() + behaviorPolicy.startDelay;
  updateControls();
  animateAgent();
}

function reset() {
  if (state.running) {
    state.running = false;
    state.forcedFrame = frames.proud;
    state.forcedFrameUntil = Date.now() + 2000;
  } else {
    state.elapsed = 0;
    state.activeExpression = null;
    state.forcedFrame = null;
    state.forcedFrameUntil = 0;
  }
  state.expressionHoldUntil = 0;
  state.nextExpressionAt = Date.now() + behaviorPolicy.startDelay;
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
  if (event.target.closest(".tiny-controls")) return;
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
    configured: Boolean(nextState?.configured),
    connected: Boolean(nextState?.connected),
    events: nextState?.events || [],
    error: nextState?.error || ""
  };
  updateControls();
  updateCalendarLabel();
}

function pulseCalendarFeedback() {
  const badge = els.calendar.closest(".time-badge");
  if (!badge) return;
  badge.classList.remove("calendar-feedback");
  void badge.offsetWidth;
  badge.classList.add("calendar-feedback");
}

async function loadCalendarState() {
  if (!canConnectCalendar) {
    updateCalendarLabel();
    return;
  }
  state.calendar.loading = true;
  updateCalendarLabel();
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
  if (!canConnectCalendar || state.calendar.loading) return;
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

els.toggle.addEventListener("click", toggle);
els.reset.addEventListener("click", reset);
els.calendarButton?.addEventListener("click", toggleCalendarConnection);
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
    loadCalendarState();
    return;
  }
  updateCalendarLabel();
}, 60000);
preloadSpriteImages();
updateControls();
loadCalendarState();
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
  state.animationTimerId = setInterval(animateAgent, 100);
  showFrame(frames.idle);
}
