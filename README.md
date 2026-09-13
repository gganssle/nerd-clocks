# Nerd Clocks

A full-screen, browser-based nerdy clock collection running locally in your
office. Click to cycle through 14+ clocks, press `?` to learn how each one
works.

Built with [Datastar](https://data-star.dev/) — a hypermedia framework that
drives reactivity from the backend with zero JavaScript build steps.

## Clocks

| # | Clock | What you see |
|---|-------|-------------|
| 1 | **Sidereal Clock with Analemma** | Two hands: mean solar time and local sidereal time drifting ~3m56s/day, with the equation of time rendered as a figure-eight |
| 2 | **Relativistic Drift Clock** | Three nanosecond counters (sea level, altitude, GPS satellite) showing GR blueshift and SR velocity divergence — the real +38 µs/day that makes GPS work |
| 3 | **Antikythera Orrery** | Concentric dials: sun, moon with variable-speed lunar anomaly, zodiac ring, Metonic and Saros spirals, half-black rotating moon phase |
| 4 | **Interplanetary Time** | Mars Sol Date, Coordinated Mars Time, Darian calendar, local solar time at rover sites — extended to Titan and Europa |
| 5 | **Fourier Epicycle Clock** | Clock hands drawn by rotating vectors — add harmonics and watch the drawing sharpen via DFT |
| 6 | **Game of Life Clock** | Seven-segment digits built from stable Conway's Life patterns, with glider collisions flipping segments each minute |
| 7 | **Log-Scale-of-Time Clock** | Axis from Planck time to the age of the universe, marker at "one second," annotated by decade — live cesium-133 transition counter since midnight |
| 8 | **Alt-Radix Clock** | Toggleable encodings: binary-coded sexagesimal, balanced ternary, hexadecimal fraction-of-day, French Revolutionary decimal, Swatch .beat |
| 9 | **Epoch Clock** | Unix seconds, Julian Date, Modified JD, TAI−UTC leap second offset, GPS week number, progress bar to the 2038 INT32 overflow |
| 10| **Pi Clock** | Searches bundled π digits for the current time (HHMMSS), displays the offset, with a spiral visualization of your position in the digit stream |
| 11| **Thermal Death Clock** | Logarithmic countdown from the heat death of the universe (~10^100 years), with proton decay simulation |
| 12| **Binary Market Clock** | HH:MM:SS as colored 0/1 bars with BCD, straight binary, and Gray-code toggles and a stock-ticker aesthetic |
| 13| **Prime Number Clock** | HH:MM encoded as prime pairs, live Sieve of Eratosthenes on screen, π(x) curve overlay |
| 14| **Pulsar Timing Clock** | Real pulsar rotation periods (PSR B1937+21, etc.) as clock hands, pulse profile light curves |

## Features

- **14+ nerdy clocks** — click to cycle, `←`/`→` to navigate
- **Info overlay** — press `?` or click the info button to learn how each clock works
- **Keyboard shortcuts** — `←` `→` navigate, `?` info, `f` fullscreen
- **Fullscreen mode** — manual trigger with `f` or the fullscreen button
- **Dark theme** — optimized for QHD (2560×1440) displays
- **Zero build step** — single Go binary, no npm, no webpack

## Quick Start

### Prerequisites

- Go 1.22 or later
- A modern browser (Chrome, Firefox, Edge)

### Run locally

```bash
git clone <repository>
cd nerd-clocks
go run ./cmd/server
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

### Build a binary

```bash
go build -o nerd-clocks ./cmd/server
./nerd-clocks
```

### Kiosk mode

For a dedicated office display, run fullscreen:

```bash
./nerd-clocks &
# Then press F in the browser or use your window manager's fullscreen
```

### Systemd service (optional)

```ini
# /etc/systemd/system/nerd-clocks.service
[Unit]
Description=Nerd Clocks Display
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/nerd-clocks
Restart=on-failure
Environment="DISPLAY=:0"

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now nerd-clocks
```

## Architecture

```
Browser (QHD, fullscreen)
├── Datastar runtime (11.82 KiB, no build)
├── HTML5 Canvas 2D (per-clock rendering)
└── CSS overlay UI (title, info, fullscreen)
        │
        │  SSE / HTTP
        ▼
Go Backend
├── /         → index.html (Datastar template)
├── /next     → patch clock index
├── /tick     → SSE: update time (1 Hz)
├── /info     → patch: info overlay
└── /pi-digits→ serve bundled π digits
```

**Tech stack:** Go 1.22+ backend, Datastar frontend, HTML5 Canvas 2D, no
JavaScript build tools.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full architecture,
clock details, and development roadmap.

## Controls

| Action | Click | Keyboard |
|--------|-------|----------|
| Next clock | Click anywhere on the clock face | `→` or `Right` |
| Previous clock | — | `←` or `Left` |
| Info overlay | Click `?` button | `?` or `i` |
| Fullscreen | Click fullscreen button | `f` |

## Development

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the phased
implementation plan, file structure, and design decisions.

### Adding a new clock

1. Create `clocks/<name>.ts` exporting `draw()`, `description`, and `displayName`
2. Register it in `clocks/index.ts`
3. Add it to the server's clock registry in `pkg/server/clock_registry.go`
4. Update the README clock table

## License

Private / Internal Use Only
