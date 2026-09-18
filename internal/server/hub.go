package server

import (
	"sync"
	"time"

	"github.com/gganssle/nerd-clocks/internal/clocks"
)

// State is what every connected screen agrees on. It lives on the server so
// the office monitor, a laptop, and a phone remote all stay in sync.
type State struct {
	Clock  string `json:"clock"`
	Info   bool   `json:"info"`
	Picker bool   `json:"picker"`
	// Cycle is the auto-advance period in seconds; 0 disables it.
	Cycle int `json:"cycle"`
	// CycleEndsAt is the unix-ms deadline of the next auto-advance.
	CycleEndsAt int64 `json:"cycleEndsAt"`
}

// Hub owns State and fans changes out to subscribers.
type Hub struct {
	catalog *clocks.Catalog

	mu    sync.Mutex
	state State
	subs  map[chan struct{}]struct{}
	timer *time.Timer
	now   func() time.Time
}

func NewHub(catalog *clocks.Catalog, initial State) *Hub {
	if _, ok := catalog.Get(initial.Clock); !ok {
		initial.Clock = catalog.All()[0].ID
	}
	h := &Hub{catalog: catalog, state: initial, subs: map[chan struct{}]struct{}{}, now: time.Now}
	h.mu.Lock()
	h.rearmLocked()
	h.mu.Unlock()
	return h
}

// SetCatalog swaps in a reloaded catalog (dev mode).
func (h *Hub) SetCatalog(c *clocks.Catalog) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.catalog = c
}

// Catalog returns the current catalog.
func (h *Hub) Catalog() *clocks.Catalog {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.catalog
}

// Snapshot returns a copy of the current state.
func (h *Hub) Snapshot() State {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.state
}

// Subscribe returns a channel that receives a (coalesced) ping on every
// change, and a function to unsubscribe.
func (h *Hub) Subscribe() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.subs, ch)
		h.mu.Unlock()
	}
}

// Update applies fn to the state and notifies subscribers. fn runs under the
// hub lock and receives the catalog so it can navigate.
func (h *Hub) Update(fn func(s *State, c *clocks.Catalog)) State {
	h.mu.Lock()
	defer h.mu.Unlock()
	prev := h.state
	fn(&h.state, h.catalog)
	if _, ok := h.catalog.Get(h.state.Clock); !ok {
		h.state.Clock = prev.Clock
	}
	if h.state.Cycle < 0 {
		h.state.Cycle = 0
	}
	if h.state.Clock != prev.Clock || h.state.Cycle != prev.Cycle {
		h.rearmLocked()
	}
	for ch := range h.subs {
		select {
		case ch <- struct{}{}:
		default: // a ping is already pending; the subscriber will read fresh state
		}
	}
	return h.state
}

// rearmLocked restarts the auto-advance countdown. Caller holds h.mu.
func (h *Hub) rearmLocked() {
	if h.timer != nil {
		h.timer.Stop()
		h.timer = nil
	}
	if h.state.Cycle <= 0 {
		h.state.CycleEndsAt = 0
		return
	}
	d := time.Duration(h.state.Cycle) * time.Second
	h.state.CycleEndsAt = h.now().Add(d).UnixMilli()
	expected := h.state.Clock
	h.timer = time.AfterFunc(d, func() {
		h.Update(func(s *State, c *clocks.Catalog) {
			// Only advance if nobody changed the clock in the meantime.
			if s.Clock == expected {
				s.Clock = c.Step(s.Clock, 1)
			}
		})
	})
}
