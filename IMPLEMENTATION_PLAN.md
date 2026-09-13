# Nerd Clocks — Implementation Plan

> A full-screen, browser-based nerdy clock with 14+ clock faces,
> driven by [Datastar](https://data-star.dev/) on a Go backend.

---

## 1. Project Overview

A single-display app running in a browser at QHD (2560×1440) that cycles
through an ever-growing collection of nerdy clocks. The user clicks anywhere
on the screen to advance to the next clock. A small **?** button (or `?` key)
opens an overlay explaining the current clock. Keyboard navigation (`←`/`→`
arrows, `?`, `f` for fullscreen) is supported throughout.

**Tech stack:**

| Layer       | Technology                                       |
| ----------- | ------------------------------------------------ |
| Frontend    | Datastar (v1.x) — hypermedia-driven reactivity   |
| Backend     | Go 1.22+ with `net/http` + Datastar Go SDK       |
| Rendering   | HTML5 Canvas 2D (per-clock) + CSS overlay UI     |
| Static      | Pre-bundled π digits (~500 MB `.txt` blob)       |
| Distribution| Single `nerd-clocks` binary, no npm, no build    |

Datastar drives the UI via `data-*` attributes and SSE patches from the Go
backend. The canvas rendering itself is pure client-side JavaScript — Datastar
manages the clock-switching state, the info-overlay visibility, keyboard
shortcuts, and any backend-driven telemetry.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser (QHD fullscreen, kiosk mode)            │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Datastar runtime (11.82 KiB)             │  │
│  │                                            │  │
│  │  ┌──────────┐  ┌───────────────────────┐   │  │
│  │  │ Canvas   │  │ CSS overlay:           │   │  │
│  │  │ element  │  │  • clock title         │   │  │
│  │  │ (2D ctx) │  │  • ? button            │   │  │
│  │  │          │  │  • clock counter       │   │  │
│  │  │          │  │  • fullscreen button   │   │  │
│  │  └──────────┘  └───────────────────────┘   │  │
│  │          ▲                                    │  │
│  │          │ data-on:click → @get(/next)       │  │
│  │          │ data-show="$showInfo"             │  │
│  │          │ data-text="$clockName"            │  │
│  └──────────┼──────────────────────────────────┘  │
│             │ SSE / HTTP                          │
└─────────────┼─────────────────────────────────────┘
              │
┌─────────────┼─────────────────────────────────────┐
│  Go Backend                                 │    │
│  │                                        │    │
│  │  /              → index.html (Datastar)│    │
│  │  /next          → patch: clock index   │    │
│  │  /tick          → SSE: update time     │    │
│  │  /info          → patch: info overlay  │    │
│  │  /pi-digits     → serve bundled file   │    │
│  │  /clocks        → JSON: clock metadata │    │
│  └────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 2.1 Communication model

- **Clock switching** — Client sends `@get('/next')` on click; server
  responds with a `datastar-patch-signals` SSE event carrying the new clock
  index. Datastar's `data-bind`/`data-text` update the canvas and title.
- **Time updates** — Server pushes an SSE `datastar-patch-signals` stream
  every second with `{tick: <ISO timestamp>}`. The client parses this into
  `Date` and re-draws the canvas via a `data-computed` binding or a
  `requestAnimationFrame` loop keyed off `$tick`.
- **Info overlay** — Client toggles `$showInfo` locally (no server round-trip
  needed); server can also patch it via `/info`.
- **Pi digits** — Served as a static file at build time, bundled inside the
  Go binary via `embed`.

### 2.2 Canvas rendering strategy

Each clock is a **self-contained JavaScript module** (`clocks/<name>.js`)
that exports:

```ts
interface ClockModule {
  /** Called every frame (~60 fps) with current Date */
  draw(ctx: CanvasRenderingContext2D, date: Date, w: number, h: number): void;
  /** Human-readable description */
  description: string;
  /** Short name for the title bar */
  displayName: string;
  /** Optional: initial state to seed */
  init?(): Record<string, unknown>;
}
```

The main app loads the appropriate module when the clock index changes and
calls `draw()` on the canvas. This keeps each clock isolated and testable.

---

## 3. Clock List (14 clocks)

### Clocks you specified (1–10)

| # | Name                        | Type      | Complexity |
|---|-----------------------------|-----------|-----------|
| 1 | Sidereal Clock with Analemma | Visual   | ★★★★      |
| 2 | Relativistic Drift Clock    | Numeric   | ★★★       |
| 3 | Antikythera Orrery          | Visual    | ★★★★★     |
| 4 | Interplanetary Time         | Numeric   | ★★★       |
| 5 | Fourier Epicycle Clock      | Visual+DFT| ★★★★      |
| 6 | Game of Life Clock          | Simulation| ★★★★★     |
| 7 | Log-Scale-of-Time Clock     | Visual    | ★★★       |
| 8 | Alt-Radix Clock             | Numeric   | ★★★       |
| 9 | Epoch Clock                 | Numeric   | ★★        |
| 10| Pi Clock                    | Numeric   | ★★★★      |

### Additional clocks (11–14)

| # | Name                        | Description                                                                 | Complexity |
|---|-----------------------------|-----------------------------------------------------------------------------|-----------|
| 11| **Thermal Death Clock**     | Countdown from the heat death of the universe (~10^100 years) to now, with
    a logarithmic marker showing where we are. Each tick shows how many protons
    have decayed (if GUT predictions are true). | ★★★ |
| 12| **Binary Market Clock**     | Displays the current time as a sequence of 0/1 bars (one per bit of
    hours:minutes:seconds). Toggle between BCD, straight binary, and
    Gray-code representations. Add a live "stock ticker" feel with color-coded
    up/down ticks. | ★★ |
| 13| **Prime Number Clock**      | Shows the current HH:MM as a pair of prime numbers. Each second, a
    live sieve of Eratosthenes runs on screen, highlighting the primes that
    encode the current time. Overlay: the prime-counting function π(x) curve. | ★★★ |
| 14| **Pulsar Timing Clock**     | Uses real pulsar rotation periods (PSR B1937+21 at 1.557 ms, etc.)
    as clock hands. Each "tick" is a pulsar rotation. Overlay the pulse profile
    as a light curve. Compare to standard atomic time drift. | ★★★★ |

---

## 4. Implementation Phases

### Phase 1 — Skeleton & First Clock (MVP)

**Goal:** A running app with 1 clock + clock switching + info overlay.

1. **Go project scaffold**
   - `go mod init nerd-clocks`
   - `cmd/server/main.go` — minimal HTTP server
   - `embed` the frontend bundle
   - Routes: `/`, `/next`, `/tick`, `/info`

2. **Datastar frontend**
   - `index.html` — skeleton page with Datastar CDN script
   - Canvas element + overlay div with `data-*` bindings
   - Clock index signal: `data-signals:clockIndex="0"`
   - Click handler: `data-on:click="@get('/next')"`
   - Info overlay: `data-show="$showInfo"` toggled by `data-on:click`

3. **Clock 0 — "Unix Epoch Bar"** (simplest clock)
   - A horizontal progress bar filling toward the next hour
   - Displays Unix timestamp as large monospaced text
   - This proves the render loop + clock-switching pipeline

4. **Clock switching**
   - Server `/next` handler increments clock index, patches signal
   - Client selects and draws the new clock module

5. **Info overlay**
   - Modal panel with clock `description` from the module

6. **Keyboard shortcuts**
   - `←` / `→` — previous / next clock
   - `?` / `i` — toggle info overlay
   - `f` — toggle fullscreen

**Validation:** `go build && ./nerd-clocks` opens a browser, shows clock,
clicking changes clocks, `?` shows description, keyboard works.

---

### Phase 2 — Core Clocks (1–5)

**Goal:** Implement your first 5 clock ideas.

| Clock | Key implementation details |
|-------|---------------------------|
| **1. Sidereal Clock** | Compute LST from UTC + longitude. Mean solar hand + sidereal hand
drifting 3m56s/day. Analemma figure-8 drawn with equation-of-time offset
(±16 min). Use `sin(λ)`, `tan(ε)` formulas. |
| **2. Relativistic Drift** | GR: `Δτ = t × sqrt(1 - 2GM/rc²)`. SR:
`Δτ = t / γ`. Three counters: sea level, GPS altitude (~20,200 km), GPS
satellite velocity (~3.87 km/s). Nanosecond-precision using `BigInt` or
`Number.EPSILON` tricks. |
| **3. Antikythera Orrery** | Nested `<canvas>` transforms or manual trig.
Sun dial (ecliptic), moon with anomaly (epicycle approximation), zodiac
ring (360° ÷ 12), Metonic spiral (19 years), Saros spiral (18y 11d 8h).
Moon phase: clipped arc with half-black overlay. |
| **4. Interplanetary Time** | Mars sol date: `(now - MarsJ2000) / 88775.245`.
Darian calendar (Mars lunar months). Coordinated Mars Time (CMT). Sites:
Gale Crater, Jezero, Olympus Mons. Extend to Titan (15d 22h) and Europa
(3d 21h). |
| **5. Fourier Epicycle** | User-drawable path → DFT via FFT. Each harmonic
becomes an epicycle (rotating circle + trace point). Sliders for number of
harmonics. Show the hand-drawn path fading in. |

Each clock is a separate file in `clocks/`. The main app registers them in
`clocks/index.ts` → compiled to JS via Go's `embed` (or pre-compiled with
esbuild/sherif).

---

### Phase 3 — Remaining Clocks (6–10)

| Clock | Key implementation details |
|-------|---------------------------|
| **6. Game of Life** | 7-segment digits on a Life grid. Each minute, inject
glider streams that collide to flip segments. Stabilize patterns offline
first. Use a sparse grid representation. |
| **7. Log-Scale-of-Time** | Single horizontal axis: Planck time (10^-43 s)
to age of universe (4.35×10^17 s). Marker at 1 second. Decade annotations:
cesium oscillation, CPU cycle, neuron fire, heartbeat, sidereal day. Live
counter: `9192631770 × secondsSinceMidnight` displayed as BigInt. |
| **8. Alt-Radix** | Toggleable face: BCD sexagesimal, balanced ternary
(digits −1/0/+1), hex fraction-of-day, French decimal (10h×100m×100s),
Swatch .beat (000–1000). Same `Date` object reformatted in each base. |
| **9. Epoch Clock** | Unix seconds, Julian Date (`JD = MJD + 2400000.5`),
Modified JD, TAI-UTC leap second table (1972–present), GPS week + tow.
Countdown progress bar to 2038-01-19 03:14:07 UTC (INT32 overflow). |
| **10. Pi Clock** | Pre-computed π digits (500M) bundled via `//go:embed`.
Search for current time string "HHMMSS" using KMP or Boyer-Moore. Display
offset. Spiral/Ulam-style plot of digit positions. |

---

### Phase 4 — Bonus Clocks (11–14)

Implement the 4 additional clocks:

| Clock | Key implementation details |
|-------|---------------------------|
| **11. Thermal Death** | Logarithmic countdown from 10^100 years. Proton
decay simulation (τ_p ≈ 10^34 years). |
| **12. Binary Market** | 32 bits of HH:MM:SS as colored bars. BCD / binary
/ Gray code toggle. Ticker animation. |
| **13. Prime Clock** | Sieve of Eratosthenes on screen. HH:MM mapped to
prime pairs. π(x) function overlay. |
| **14. Pulsar Timing** | Real pulsar periods as clock hands. Pulse profile
light curve. PTA drift comparison. |

---

### Phase 5 — Polish & Deployment

1. **Performance**
   - Canvas `will-change: transform` hints
   - Throttle Pi clock searches to once per minute
   - Web Worker for DFT (clock 5) and Sieve (clock 13)

2. **Visual polish**
   - Dark theme optimized for QHD
   - Smooth CSS transition between clock faces (fade + scale)
   - Subtle glow/bloom on canvas elements

3. **Configuration**
   - `config.json` or env vars: default longitude/latitude, timezone
   - Optional: auto-advance timer (e.g., cycle every 60s)

4. **Packaging**
   - `go build -o nerd-clocks ./cmd/server`
   - Systemd service file for always-on kiosk mode
   - Optional: Dockerfile

---

## 5. File Structure

```
nerd-clocks/
├── README.md
├── IMPLEMENTATION_PLAN.md       ← this file
├── go.mod
├── go.sum
├── cmd/
│   └── server/
│       └── main.go              # HTTP server, routes, embed
├── clocks/
│   ├── index.ts                 # Clock registry
│   ├── unix-epoch-bar.ts        # Clock 0 (MVP)
│   ├── sidereal-analemma.ts     # Clock 1
│   ├── relativistic-drift.ts    # Clock 2
│   ├── antikythera-orrery.ts    # Clock 3
│   ├── interplanetary-time.ts   # Clock 4
│   ├── fourier-epicycle.ts      # Clock 5
│   ├── game-of-life.ts          # Clock 6
│   ├── log-scale-time.ts        # Clock 7
│   ├── alt-radix.ts             # Clock 8
│   ├── epoch-clock.ts           # Clock 9
│   ├── pi-clock.ts              # Clock 10
│   ├── thermal-death.ts         # Clock 11
│   ├── binary-market.ts         # Clock 12
│   ├── prime-clock.ts           # Clock 13
│   └── pulsar-timing.ts         # Clock 14
├── public/
│   ├── pi-digits.txt            # Pre-computed π digits (500M)
│   └── pulsar-data.json         # Real pulsar period data
├── static/
│   └── datastar.js              # Datastar CDN copy (or use CDN URL)
├── templates/
│   └── index.html               # Datastar-driven HTML template
├── pkg/
│   └── server/
│       ├── handlers.go          # HTTP handler implementations
│       └── clock_registry.go    # Server-side clock metadata
└── tests/
    ├── clocks/                  # Unit tests per clock module
    └── server/                  # Handler tests
```

---

## 6. Datastar Integration Details

### 6.1 Signals

| Signal        | Type   | Purpose                                  |
| ------------- | ------ | ---------------------------------------- |
| `$clockIndex` | number | Currently displayed clock (0–N)          |
| `$showInfo`   | bool   | Info overlay visibility                  |
| `$tick`       | string | ISO timestamp from server SSE            |
| `$clockName`  | string | Display name of current clock            |
| `$clockCount` | number | Total number of clocks                   |
| `$clockLabel` | string | "Clock 3 of 14" label                    |
| `$fullscreen` | bool   | Fullscreen state                         |

### 6.2 Key HTML attributes

```html
<!-- Clock switching on click -->
<div id="clock-area" data-on:click="@get('/next')"></div>

<!-- Info overlay toggle -->
<button data-on:click="$showInfo = !$showInfo">?</button>

<!-- Show/hide overlay -->
<div id="info-overlay" data-show="$showInfo"></div>

<!-- Clock name display -->
<h1 data-text="$clockName"></h1>

<!-- Clock counter -->
<span data-text="'Clock ' + ($clockIndex + 1) + ' of ' + $clockCount"></span>

<!-- Reactive canvas size -->
<canvas
  data-attr:width="$windowWidth"
  data-attr:height="$windowHeight"
></canvas>
```

### 6.3 SSE event types

```
# Clock switch
event: datastar-patch-signals
data: { clockIndex: 3, clockName: "Antikythera Orrery" }

# Second tick (every 1s)
event: datastar-patch-signals
data: { tick: "2025-09-13T12:00:01.000Z" }

# Info overlay
event: datastar-patch-signals
data: { showInfo: true }
```

### 6.4 Datastar expressions for keyboard

```html
<!-- Key handler on root element -->
<div data-on:keydown.arrow-left="@get('/prev')"
     data-on:keydown.arrow-right="@get('/next')"
     data-on:keydown.i="$showInfo = !$showInfo"
     data-on:keydown.f="$fullscreen = !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen()">
```

---

## 7. Design Decisions

### 7.1 Why Go + Datastar (no npm, no build step)?

- Datastar is designed to work with **any backend language**. Go gives us:
  - Single binary distribution
  - Built-in HTTP server with SSE support
  - `embed` for bundling static files (π digits, templates)
  - No Node.js runtime required
- The frontend is a single `<script>` tag — no webpack, no vite, no
  TypeScript compiler on the server. Clock modules are plain TypeScript
  transpiled ahead-of-time (or plain JS).

### 7.2 Why Canvas 2D over SVG?

- Game of Life (clock 6) requires rendering thousands of cells at 60 fps
- Fourier epicycle (clock 5) draws many overlapping circles per frame
- Antikythera (clock 3) has nested rotations best handled by `ctx.save()/restore()`
- Canvas gives us pixel-level control and GPU acceleration via `will-change`

### 7.3 Why per-second redraw (not continuous)?

- Most clocks only need second-level precision for display
- Reducing draw calls from 60/s to 1/s cuts CPU by 98%
- The one exception is Fourier epicycle (clock 5) and Game of Life (clock 6)
  which run their own high-frequency loops

### 7.4 Pi digits bundling

- 500 million digits ≈ ~500 MB text file
- Bundled with `//go:embed` into the Go binary
- On first load, client fetches it via HTTP range requests (byte-range
  headers) to avoid downloading the full file for short searches
- Pre-index: a secondary `.idx` file maps search offsets to byte positions
  for O(1) lookups

---

## 8. Testing Strategy

| Layer | Tool | What's tested |
|-------|------|---------------|
| Clock modules | Vitest (or Deno test) | `draw()` produces expected pixel patterns for known inputs |
| Clock logic | Vitest | Sidereal calculation, relativistic drift, Mars sol date, etc. |
| Server handlers | `net/http/httptest` | `/next` returns correct signal patch, `/tick` streams SSE |
| End-to-end | Playwright | Full screen test: click → clock changes, `?` → overlay appears |

---

## 9. Open Questions / Decisions to Confirm

1. **Longitude/latitude** — Should the app default to a specific location
   (e.g., your office coordinates) or use the browser's geolocation API?
   Sidereal clock and interplanetary clock both need this.

2. **Auto-advance** — Do you want an optional auto-cycle timer (e.g., every
   60 seconds) or is manual click-only sufficient?

3. **Pi digit count** — 500 MB is large. Is that acceptable, or should we
   start with a smaller bundle (50–100 MB) and allow on-demand expansion?

4. **Branding** — Any preferred color scheme, font choices, or aesthetics
   beyond "dark theme for QHD"?

5. **Clock ordering** — Should clocks be ordered by complexity (simple →
   complex) or grouped by theme (astronomical, computational, historical)?

6. **Pulsar data** — Should pulsar period data be hardcoded in the binary
   or fetched from an online pulsar catalog at runtime?
