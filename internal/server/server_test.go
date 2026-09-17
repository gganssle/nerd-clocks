package server

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gganssle/nerd-clocks/internal/clocks"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	s, err := New(Config{Web: os.DirFS("../../web")})
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func post(t *testing.T, s *Server, path string) int {
	t.Helper()
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, path, nil))
	return rec.Code
}

func TestEveryClockHasAModule(t *testing.T) {
	s := newTestServer(t)
	for _, c := range s.hub.Catalog().All() {
		if _, err := os.Stat("../../web/static/clocks/" + c.ID + ".js"); err != nil {
			t.Errorf("clock %s has no module: %v", c.ID, err)
		}
		if c.Tagline == "" || c.Category == "" {
			t.Errorf("clock %s is missing tagline or category", c.ID)
		}
	}
}

func TestNavigation(t *testing.T) {
	s := newTestServer(t)
	first := s.hub.Snapshot().Clock
	if code := post(t, s, "/api/next"); code != http.StatusNoContent {
		t.Fatalf("next: %d", code)
	}
	if s.hub.Catalog().Len() > 1 && s.hub.Snapshot().Clock == first {
		t.Error("next did not change clock")
	}
	post(t, s, "/api/prev")
	if got := s.hub.Snapshot().Clock; got != first {
		t.Errorf("prev after next = %s, want %s", got, first)
	}
	last := s.hub.Catalog().All()[s.hub.Catalog().Len()-1].ID
	if code := post(t, s, "/api/select/"+last); code != http.StatusNoContent || s.hub.Snapshot().Clock != last {
		t.Errorf("select failed: %d %s", code, s.hub.Snapshot().Clock)
	}
	if code := post(t, s, "/api/select/does-not-exist"); code != http.StatusNotFound {
		t.Errorf("select unknown: %d", code)
	}
}

func TestOverlaysAreExclusive(t *testing.T) {
	s := newTestServer(t)
	post(t, s, "/api/info")
	if st := s.hub.Snapshot(); !st.Info || st.Picker {
		t.Fatalf("after info: %+v", st)
	}
	post(t, s, "/api/picker")
	if st := s.hub.Snapshot(); st.Info || !st.Picker {
		t.Fatalf("after picker: %+v", st)
	}
	post(t, s, "/api/close")
	if st := s.hub.Snapshot(); st.Info || st.Picker {
		t.Fatalf("after close: %+v", st)
	}
}

func TestCycle(t *testing.T) {
	s := newTestServer(t)
	if code := post(t, s, "/api/cycle/-5"); code != http.StatusBadRequest {
		t.Errorf("negative cycle: %d", code)
	}
	post(t, s, "/api/cycle/90")
	st := s.hub.Snapshot()
	if st.Cycle != 90 || st.CycleEndsAt <= time.Now().UnixMilli() {
		t.Errorf("cycle not armed: %+v", st)
	}
	post(t, s, "/api/cycle/0")
	if st := s.hub.Snapshot(); st.Cycle != 0 || st.CycleEndsAt != 0 {
		t.Errorf("cycle not disarmed: %+v", st)
	}
}

func TestAutoAdvance(t *testing.T) {
	s := newTestServer(t)
	if s.hub.Catalog().Len() < 2 {
		t.Skip("needs two clocks")
	}
	first := s.hub.Snapshot().Clock
	s.hub.Update(func(st *State, _ *clocks.Catalog) { st.Cycle = 1 })
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if s.hub.Snapshot().Clock != first {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Error("clock did not auto-advance")
}

func TestSSEStreamsStateChanges(t *testing.T) {
	s := newTestServer(t)
	ts := httptest.NewServer(s)
	defer ts.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/sse", nil)
	req.Header.Set("Accept", "text/event-stream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	lines := make(chan string, 256)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		sc.Buffer(make([]byte, 1<<20), 1<<20)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	waitFor := func(substr string) {
		t.Helper()
		for {
			select {
			case l, ok := <-lines:
				if !ok {
					t.Fatalf("stream closed before %q", substr)
				}
				if strings.Contains(l, substr) {
					return
				}
			case <-ctx.Done():
				t.Fatalf("timed out waiting for %q", substr)
			}
		}
	}
	waitFor(`id="hud"`)
	waitFor(`id="info-body"`)

	last := s.hub.Catalog().All()[s.hub.Catalog().Len()-1]
	post(t, s, "/api/select/"+last.ID)
	waitFor(`"clock":"` + last.ID + `"`)
	waitFor(last.Name)
}

func TestPagesRender(t *testing.T) {
	s := newTestServer(t)
	for _, path := range []string{"/", "/remote", "/?clock=pendulum-wave"} {
		rec := httptest.NewRecorder()
		s.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "datastar.js") {
			t.Errorf("%s: %d", path, rec.Code)
		}
	}
}
