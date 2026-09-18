# Writing a clock

Every clock is two files, both picked up automatically (no registry to edit):

| File | Purpose |
|------|---------|
| `web/static/clocks/<id>.js` | ES module that draws the clock |
| `web/content/clocks/<id>.html` | Metadata header + "how it works" explainer |

`<id>` is lowercase kebab-case and must match between the two files.

## The module

```js
import { TAU, timeParts, pad, SANS, MONO } from '../lib/util.js';

export function create(host) {
  const surface = host.canvas();          // auto-resizing, DPR-aware 2D canvas
  const { ctx } = surface;
  // ... one-time setup ...
  return {
    frame(now, dt) {                       // called every animation frame
      const W = surface.width, H = surface.height;   // CSS pixels
      const t = timeParts(now);            // local h, m, s, ms, dayFrac, minuteFrac...
      // draw everything, every frame
    },
    destroy() {},                          // optional: stop workers, free GL objects
  };
}
```

`host` gives you:

- `host.now()` / the `now` argument: epoch ms. **Always use this, never `Date.now()`**, so that `?at=` and `?speed=` work (demos and screenshot tests depend on it).
- `host.canvas({ scale, alpha, pixelated })`: a 2D surface. `ctx` is pre-scaled to CSS pixels; `surface.width/height` are CSS pixels. `scale: 0.25` renders at quarter resolution (good for per-pixel simulations). You can stack several canvases; they are layered in creation order.
- `host.webgl(opts)`: a WebGL2 (falls back to WebGL1) surface; `surface.width/height` are device pixels and the viewport is kept in sync.
- `host.el`: the container element, if you want DOM or SVG instead of canvas.
- `host.location`: `{ lat, lon, source }`, a live object (it may update once browser geolocation resolves).
- `host.onResize((w, h) => ...)`.
- `host.params`: the page's `URLSearchParams`.

Shared libraries in `web/static/lib/`:

- `util.js`: `TAU`, `clamp`, `lerp`, `easeInOut`, `mod`, `pad`, `timeParts`, `hms`, `rng(seed)`, font stacks `SANS`/`MONO`.
- `glyphs.js`: `BITMAP` 5x7 font + `bitmapCells(text)`, and single-stroke vector digits `strokeGlyph(ch)` / `strokeText(text)`.

Add new shared helpers as new files in `lib/` rather than editing existing ones.

## The explainer

```html
<!--
name: Pendulum Wave
tagline: One sentence, shown under the name on screen and in the picker
category: Physics
order: 40
accent: #7fd4ff
-->
<h3>How to read it</h3>
<p>...</p>
<h3>How it works</h3>
<p>...</p>
<div class="formula">T = 2π √(L / g)</div>
<h3>Nerd note</h3>
<p>...</p>
```

Available prose styling: `h3`, `p`, `ul/ol`, `b`, `code`, `.formula` (monospace block). Keep it to what a curious visitor reads in about 90 seconds: how to read the time off the face first, then the real science or computer science, then one surprising fact. Be accurate.

## Visual bar

This runs full-screen on an office monitor (often 2560x1440 or 4K). Visitors should stop and say "whoa, what is that?"

- Fill the screen and scale with `Math.min(W, H)`; test at 1920x1080 and at a portrait or narrow size.
- Dark backgrounds, strong composition, glow via `globalCompositeOperation = 'lighter'` or radial gradients, used with restraint.
- The time must actually be readable from the face (perhaps with a subtle numeric readout as an aid).
- The top-left corner is covered by the name overlay when the mouse moves; keep critical content away from it.
- Motion should be smooth and continuous, never janky once a second. Keep frames under ~8 ms on a laptop; precompute what you can.
- No network requests, no external libraries.

## Testing

```bash
go run ./cmd/nerd-clocks -dev -addr 127.0.0.1:31401     # -dev serves web/ from disk
BASE=http://127.0.0.1:31401 scripts/shot.sh <id> /tmp/x.png 2026-09-16T10:42:07
```

`http://localhost:31337/?clock=<id>` shows a single clock without following the shared state. Add `&at=<ISO time>` to freeze the starting moment, `&speed=60` to fast-forward, and `&chrome=0` to hide the overlay.
