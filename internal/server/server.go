// Package server wires the clock catalog, the shared state hub and the
// Datastar front end together.
package server

import (
	"bytes"
	"encoding/json"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gganssle/nerd-clocks/internal/clocks"
	"github.com/starfederation/datastar-go/datastar"
)

// Config holds startup options.
type Config struct {
	// Web is the web/ tree: templates/, static/, content/.
	Web fs.FS
	// Lat/Lon default the observer location for astronomical clocks. When
	// HasLocation is false the browser's geolocation is tried instead.
	Lat, Lon    float64
	HasLocation bool
	// Initial state.
	Clock string
	Cycle int
	// Dev re-reads the clock catalog on every page load so new clocks show
	// up without a restart.
	Dev bool
}

type Server struct {
	cfg  Config
	hub  *Hub
	tmpl *template.Template
	mux  *http.ServeMux
}

func New(cfg Config) (*Server, error) {
	catalog, err := clocks.Load(cfg.Web, "content/clocks")
	if err != nil {
		return nil, err
	}
	tmpl, err := template.New("").Funcs(template.FuncMap{
		"json": func(v any) (string, error) {
			b, err := json.Marshal(v)
			return string(b), err
		},
		"inc": func(i int) int { return i + 1 },
		"div": func(a, b int) int { return a / b },
		"seq": func(xs ...int) []int { return xs },
	}).ParseFS(cfg.Web, "templates/*.html")
	if err != nil {
		return nil, err
	}
	s := &Server{
		cfg:  cfg,
		hub:  NewHub(catalog, State{Clock: cfg.Clock, Cycle: cfg.Cycle}),
		tmpl: tmpl,
		mux:  http.NewServeMux(),
	}
	static, err := fs.Sub(cfg.Web, "static")
	if err != nil {
		return nil, err
	}
	s.mux.Handle("GET /static/", http.StripPrefix("/static/", noCache(http.FileServerFS(static))))
	s.mux.HandleFunc("GET /{$}", s.handleDisplay)
	s.mux.HandleFunc("GET /remote", s.handleRemote)
	s.mux.HandleFunc("GET /sse", s.handleSSE)
	s.mux.HandleFunc("GET /api/clocks", s.handleClocks)
	s.mux.HandleFunc("POST /api/next", s.action(func(st *State, c *clocks.Catalog) { st.Clock = c.Step(st.Clock, 1) }))
	s.mux.HandleFunc("POST /api/prev", s.action(func(st *State, c *clocks.Catalog) { st.Clock = c.Step(st.Clock, -1) }))
	s.mux.HandleFunc("POST /api/info", s.action(func(st *State, _ *clocks.Catalog) { st.Info = !st.Info; st.Picker = false }))
	s.mux.HandleFunc("POST /api/picker", s.action(func(st *State, _ *clocks.Catalog) { st.Picker = !st.Picker; st.Info = false }))
	s.mux.HandleFunc("POST /api/close", s.action(func(st *State, _ *clocks.Catalog) { st.Picker = false; st.Info = false }))
	s.mux.HandleFunc("POST /api/select/{id}", s.handleSelect)
	s.mux.HandleFunc("POST /api/cycle/{seconds}", s.handleCycle)
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.mux.ServeHTTP(w, r) }

// pageData is shared by the display and remote templates.
type pageData struct {
	Clocks  []clocks.Clock
	Current clocks.Clock
	Index   int
	Total   int
	State   State
	Signals map[string]any
	Solo    bool
}

// refresh reloads the catalog in dev mode.
func (s *Server) refresh() {
	if !s.cfg.Dev {
		return
	}
	catalog, err := clocks.Load(s.cfg.Web, "content/clocks")
	if err != nil {
		log.Printf("reload catalog: %v", err)
		return
	}
	s.hub.SetCatalog(catalog)
}

func (s *Server) page(st State) pageData {
	catalog := s.hub.Catalog()
	cur, _ := catalog.Get(st.Clock)
	return pageData{
		Clocks:  catalog.All(),
		Current: cur,
		Index:   catalog.Index(st.Clock),
		Total:   catalog.Len(),
		State:   st,
	}
}

func (s *Server) signals(st State) map[string]any {
	sig := map[string]any{
		"clock":       st.Clock,
		"info":        st.Info,
		"picker":      st.Picker,
		"cycle":       st.Cycle,
		"cycleEndsAt": st.CycleEndsAt,
		"serverNow":   time.Now().UnixMilli(),
	}
	return sig
}

func (s *Server) handleDisplay(w http.ResponseWriter, r *http.Request) {
	s.refresh()
	st := s.hub.Snapshot()
	// Solo mode (/?clock=id) renders one clock without following the shared
	// state: handy for previews, screenshots and a second, independent screen.
	solo := false
	if id := r.URL.Query().Get("clock"); id != "" {
		if _, ok := s.hub.Catalog().Get(id); ok {
			st = State{Clock: id}
			solo = true
		}
	}
	d := s.page(st)
	d.Solo = solo
	d.Signals = s.signals(st)
	d.Signals["solo"] = solo
	d.Signals["_now"] = time.Now().UnixMilli()
	d.Signals["_activeAt"] = time.Now().UnixMilli()
	loc := map[string]any{"known": s.cfg.HasLocation}
	if s.cfg.HasLocation {
		loc["lat"], loc["lon"] = s.cfg.Lat, s.cfg.Lon
	}
	d.Signals["location"] = loc
	s.render(w, "display.html", d)
}

func (s *Server) handleRemote(w http.ResponseWriter, r *http.Request) {
	s.refresh()
	st := s.hub.Snapshot()
	d := s.page(st)
	d.Signals = s.signals(st)
	s.render(w, "remote.html", d)
}

func (s *Server) render(w http.ResponseWriter, name string, data any) {
	var buf bytes.Buffer
	if err := s.tmpl.ExecuteTemplate(&buf, name, data); err != nil {
		log.Printf("render %s: %v", name, err)
		http.Error(w, "template error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(buf.Bytes())
}

func (s *Server) fragment(name string, data any) (string, error) {
	var buf bytes.Buffer
	err := s.tmpl.ExecuteTemplate(&buf, name, data)
	return buf.String(), err
}

// handleSSE is the long-lived Datastar stream. Every change to the shared
// state is pushed as signal patches plus server-rendered HTML fragments.
func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	view := r.URL.Query().Get("view")
	sse := datastar.NewSSE(w, r)
	changes, unsubscribe := s.hub.Subscribe()
	defer unsubscribe()

	lastClock := ""
	push := func() error {
		st := s.hub.Snapshot()
		sig, _ := json.Marshal(s.signals(st))
		if err := sse.PatchSignals(sig); err != nil {
			return err
		}
		if st.Clock == lastClock {
			return nil
		}
		lastClock = st.Clock
		d := s.page(st)
		names := []string{"hud", "info-body"}
		if view == "remote" {
			names = []string{"remote-now", "remote-info"}
		}
		for _, name := range names {
			html, err := s.fragment(name, d)
			if err != nil {
				log.Printf("fragment %s: %v", name, err)
				continue
			}
			if err := sse.PatchElements(html); err != nil {
				return err
			}
		}
		return nil
	}

	if err := push(); err != nil {
		return
	}
	keepalive := time.NewTicker(20 * time.Second)
	defer keepalive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-changes:
			if err := push(); err != nil {
				return
			}
		case <-keepalive.C:
			// Refreshes serverNow and keeps proxies from idling the stream out.
			sig, _ := json.Marshal(map[string]any{"serverNow": time.Now().UnixMilli()})
			if err := sse.PatchSignals(sig); err != nil {
				return
			}
		}
	}
}

func (s *Server) action(fn func(*State, *clocks.Catalog)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.hub.Update(fn)
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) handleSelect(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, ok := s.hub.Catalog().Get(id); !ok {
		http.Error(w, "unknown clock", http.StatusNotFound)
		return
	}
	s.hub.Update(func(st *State, _ *clocks.Catalog) { st.Clock = id; st.Picker = false })
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCycle(w http.ResponseWriter, r *http.Request) {
	n, err := strconv.Atoi(r.PathValue("seconds"))
	if err != nil || n < 0 || n > 24*3600 {
		http.Error(w, "bad cycle period", http.StatusBadRequest)
		return
	}
	s.hub.Update(func(st *State, _ *clocks.Catalog) { st.Cycle = n })
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleClocks(w http.ResponseWriter, r *http.Request) {
	type item struct {
		ID, Name, Tagline, Category, Accent string
	}
	var out []item
	for _, c := range s.hub.Catalog().All() {
		out = append(out, item{c.ID, c.Name, c.Tagline, c.Category, c.Accent})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// noCache keeps the browser from holding on to stale clock modules while
// you iterate; the files are tiny and served locally anyway.
func noCache(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		h.ServeHTTP(w, r)
	})
}
