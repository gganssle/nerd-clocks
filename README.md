# Nerd Clocks (Claude Code edition)

A full-screen gallery of unusual clocks for an office monitor. Each one tells
the real time through a piece of mathematics, physics, computing history or
astronomy, and each one can explain itself to whoever is standing in front of
the screen.

> This branch (`claude-code-version`) is an independent re-implementation of
> the project on `main`, written from scratch by Claude Code so the two builds
> can be compared.

## Run it

Requires Go 1.24+. Everything else (Datastar included) is vendored and embedded.

```bash
git fetch origin && git checkout claude-code-version
go run ./cmd/nerd-clocks
```

Then open <http://localhost:31337/> and press <kbd>f</kbd> for fullscreen.
Startup prints a `/remote` URL for every LAN address; open that on your phone
to control the monitor from across the room.

```bash
go build -o nerd-clocks ./cmd/nerd-clocks   # single self-contained binary
./nerd-clocks -cycle 300 -lat 47.61 -lon -122.33
```

| Flag | Default | Meaning |
|------|---------|---------|
| `-addr` | `:31337` | Listen address (or `NERD_CLOCKS_ADDR`) |
| `-cycle` | `0` | Auto-advance every N seconds (0 = off; toggle live with <kbd>c</kbd>) |
| `-clock` | first | Clock id to start on |
| `-lat`, `-lon` | browser geolocation, else Greenwich | Observer location for the sky clock |
| `-dev` | off | Serve `web/` from disk so edits show up on reload |

## Controls

| Key | Action |
|-----|--------|
| <kbd>→</kbd> / <kbd>space</kbd> / <kbd>n</kbd> | Next clock |
| <kbd>←</kbd> / <kbd>p</kbd> | Previous clock |
| <kbd>i</kbd> / <kbd>?</kbd> | "How it works" panel |
| <kbd>g</kbd> | Grid of all clocks |
| <kbd>c</kbd> | Toggle auto-cycle (2 min) |
| <kbd>f</kbd> | Fullscreen |
| <kbd>Esc</kbd> | Close panels |

The overlay and cursor fade out after a few seconds without mouse movement.

Useful URL parameters: `?clock=<id>` shows one clock independently of the
shared state, `&at=2026-12-31T23:59:30` starts the clock at a given moment,
`&speed=60` fast-forwards time, and `&chrome=0` hides all overlays.

## The clocks

| # | Clock | The idea |
|---|-------|----------|
| 01 | **Julia Set** | A GPU fractal whose parameter walks around the Mandelbrot cardioid once a minute |
| 02 | **Pendulum Wave** | 18 pendulums tuned to realign exactly on every minute |
| 03 | **Enigma** | A faithful Enigma I encrypting the current time, letter by letter |
| 04 | **Hilbert Day** | The day as a space-filling curve with 65,536 cells |
| 05 | **Sky Dial** | The real sky over your office; the stars themselves are the hour hand |
| 06 | **Game of Life** | Conway's Life boiling around digits that refuse to die |
| 07 | **Oscilloscope** | A vector clock drawn by a simulated CRT beam in X-Y mode |
| 08 | **Towers of Hanoi** | 16 disks, 65,535 moves, one day; the big disk moves at noon |
| 09 | **Kepler Orbits** | Hands that obey Kepler's laws, with a dial spaced for equal areas |
| 10 | **Reaction–Diffusion** | Turing patterns growing into the shape of the time |
| 11 | **WWVB** | The 60 kHz radio time code from Fort Collins, decoded live |
| 12 | **Fourier Epicycles** | The time drawn by hundreds of spinning circles |
| 13 | **Sorting Minute** | A new sorting algorithm races against every minute |
| 14 | **Nixie Epoch** | Unix time on Nixie tubes, counting down to 2038 |
| 15 | **Babylon & Maya** | Sexagesimal cuneiform and the Maya Long Count |
| 16 | **Pong** | Hours versus minutes; somebody misses on purpose |
| 17 | **Antikythera** | A bronze gear train from 100 BC, geared down to the wall clock |
| 18 | **Caesium Fountain** | One toss of cold atoms per second, counting out the SI definition |
| 19 | **Penrose Mosaic** | An aperiodic tiling that inflates by φ once a minute |
| 20 | **Prime Spiral** | Every second of the day on a Sacks spiral, primes lit |
| 21 | **Light Clock** | Einstein's thought experiment, ticking in two frames at once |

## How it's built

```
cmd/nerd-clocks/        main: flags, embed, listen
internal/clocks/        catalog loader (content/clocks/*.html headers)
internal/server/        HTTP routes, shared-state hub, Datastar SSE stream
web/templates/          display page, phone remote, server-rendered fragments
web/static/app.js       client runtime: loads clock modules, drives rAF
web/static/clocks/      one ES module per clock
web/static/lib/         shared helpers (fonts, time, astronomy...)
web/content/clocks/     one explainer per clock (metadata + HTML)
web/static/vendor/      Datastar v1.0.3
```

**Datastar owns state; the canvas owns pixels.** Which clock is showing,
whether the explainer or picker is open, and the auto-cycle timer all live on
the Go server. Every browser (the office monitor, your laptop, your phone
remote) holds one long-lived `GET /sse` stream. Any change (a key press is an
`@post('/api/next')`) goes through the hub and is broadcast back as
`datastar-patch-signals` plus server-rendered HTML fragments
(`datastar-patch-elements`) for the title and the explainer. Nothing in the
page updates its own UI state optimistically, so every screen always agrees.

A single `data-effect="nerd.mount($clock)"` bridges into the client runtime,
which lazy-loads `/static/clocks/<id>.js`, cross-fades it in, and calls its
`frame(now)` every animation frame. Idle-hiding the overlay, the auto-cycle
progress bar and the keyboard map are plain Datastar attributes too.

See [docs/PLAN.md](docs/PLAN.md) for the design rationale and
[docs/CLOCK_AUTHORING.md](docs/CLOCK_AUTHORING.md) to add a clock (two files,
no registration).

## Tests

```bash
go test ./...                      # catalog parsing, navigation, cycling, SSE stream
```

`scripts/shot.sh <id> out.png [time]` screenshots any clock in headless Chrome.
