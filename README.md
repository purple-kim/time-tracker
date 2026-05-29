# Time tracker

A floating desktop pomodoro companion with a small animated cat character.

The app shows work time, the next calendar event, and a draggable cat companion that types while you work. The cat occasionally shows short expressions or actions, such as drinking cola, getting sleepy, or feeling frustrated.

## Run

### Desktop app

```bash
cd /Users/kimbora/pomodoro-agents
npm start
```

### Browser preview

Open the file directly:

```text
file:///Users/kimbora/pomodoro-agents/index.html
```

Or run a local static server:

```bash
cd /Users/kimbora/pomodoro-agents
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Test Modes

Check all single-expression frames:

```text
file:///Users/kimbora/pomodoro-agents/index.html?test=faces
```

Check action animations:

```text
file:///Users/kimbora/pomodoro-agents/index.html?test=actions
```

The action test cycles through:

```text
typing -> cola -> sleepy -> angry
```

## Current Behavior Policy

Default states:

- Before start: `cat-single-01-idle`
- While running: typing animation
- On finish: proud expression for 2 seconds

Timing:

- First event appears 14 seconds after starting.
- Each event is shown for 2 seconds.
- Normal event interval is about 13.3 seconds.
- After 20 minutes of work, event interval becomes 10 seconds.

Approximate exposure ratio:

- Normal work: typing 85%, single expressions 8%, actions 7%
- After 20 minutes: typing 80%, single expressions 7%, actions 13%

Calendar behavior:

- If the next event starts within 10 minutes, the startled expression is prioritized.
- The startled expression has a 10-minute cooldown.

## Important Assets

Runtime assets:

```text
assets/frames/cat-expression-sprite-manual-single-12-gutter-160.png
assets/frames/cat-typing-sprite-final.png
assets/frames/cat-cola-sprite-final.png
assets/frames/cat-sleepy-sprite-final.png
assets/frames/cat-angry-sprite-final.png
```

Source expression images:

```text
assets/frames/manual-single-expressions/
```

Archived unused assets:

```text
unused-assets-archive/2026-05-30/
```

The archive is not required for runtime. It can be deleted after confirming the app works as expected.

## Project Files

```text
index.html
styles.css
main.js
calendar-data.js
electron/
assets/
```

## Notes

- This is currently a local prototype.
- The Electron version is intended to behave like a small floating desktop widget.
- The cat can be moved by dragging the widget.
- Calendar data is currently provided through `calendar-data.js`.
