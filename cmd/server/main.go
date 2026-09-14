package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

//go:embed templates/index.html
var indexHTML embed.FS

//go:embed static/app.css
var appCSS embed.FS

// Clock metadata
type Clock struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"`
}

var clocks = []Clock{
	{0, "Unix Epoch Bar", "A horizontal progress bar filling toward the next hour, with the current Unix timestamp displayed in large monospaced text.", "Numeric"},
	{1, "Sidereal Clock with Analemma", "Two hands: mean solar time and local sidereal time drifting ~3m56s/day, with the equation of time rendered as a figure-eight analemma.", "Visual"},
	{2, "Relativistic Drift Clock", "Three nanosecond counters (sea level, altitude, GPS satellite) showing GR blueshift and SR velocity divergence.", "Numeric"},
	{3, "Antikythera Orrery", "Concentric dials: sun, moon with variable-speed lunar anomaly, zodiac ring, Metonic and Saros spirals, half-black rotating moon phase.", "Visual"},
	{4, "Interplanetary Time", "Mars Sol Date, Coordinated Mars Time, Darian calendar, local solar time at rover sites — extended to Titan and Europa.", "Numeric"},
	{5, "Fourier Epicycle Clock", "Clock hands drawn by rotating vectors — add harmonics and watch the drawing sharpen via DFT.", "Visual+DFT"},
	{6, "Game of Life Clock", "Seven-segment digits built from stable Conway's Life patterns, with glider collisions flipping segments each minute.", "Simulation"},
	{7, "Log-Scale-of-Time Clock", "Axis from Planck time to the age of the universe, marker at one second, annotated by decade.", "Visual"},
	{8, "Alt-Radix Clock", "Toggleable encodings: binary-coded sexagesimal, balanced ternary, hexadecimal fraction-of-day, French Revolutionary decimal, Swatch .beat.", "Numeric"},
	{9, "Epoch Clock", "Unix seconds, Julian Date, Modified JD, TAI-UTC leap second offset, GPS week number, progress bar to the 2038 INT32 overflow.", "Numeric"},
	{10, "Pi Clock", "Searches bundled pi digits for the current time (HHMMSS), displays the offset, with a spiral visualization.", "Numeric"},
	{11, "Thermal Death Clock", "Logarithmic countdown from the heat death of the universe (~10^100 years), with proton decay simulation.", "Visual"},
	{12, "Binary Market Clock", "HH:MM:SS as colored 0/1 bars with BCD, straight binary, and Gray-code toggles and a stock-ticker aesthetic.", "Numeric"},
	{13, "Prime Number Clock", "HH:MM encoded as prime pairs, live Sieve of Eratosthenes on screen, pi(x) curve overlay.", "Numeric"},
	{14, "Pulsar Timing Clock", "Real pulsar rotation periods (PSR B1937+21, etc.) as clock hands, pulse profile light curves.", "Visual"},
}

type AppState struct {
	mu          sync.RWMutex
	clockIndex  int
	showInfo    bool
	lastTick    string
	totalClocks int
}

var state = AppState{
	totalClocks: len(clocks),
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "31337"
	}

	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/next", handleNext)
	http.HandleFunc("/prev", handlePrev)
	http.HandleFunc("/tick", handleTick)
	http.HandleFunc("/info", handleInfo)
	http.HandleFunc("/clocks", handleClocks)
	http.HandleFunc("/pi-digits", handlePiDigits)
	http.HandleFunc("/static/", handleStatic)

	log.Printf("nerd-clocks starting on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	data, err := indexHTML.ReadFile("templates/index.html")
	if err != nil {
		http.Error(w, "template not found", 500)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(data)
}

func handleNext(w http.ResponseWriter, r *http.Request) {
	state.mu.Lock()
	state.clockIndex = (state.clockIndex + 1) % state.totalClocks
	clockName := clocks[state.clockIndex].Name
	clockDesc := strings.ReplaceAll(clocks[state.clockIndex].Description, `"`, `\"`)
	clockType := clocks[state.clockIndex].Type
	clockLabel := fmt.Sprintf("Clock %d of %d", state.clockIndex+1, state.totalClocks)
	state.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{
		"events": [{
			"targets": [{"selector": "#clock-info"}],
			"patches": [
				{"op": "replace", "path": "textContent", "value": "%s"},
				{"op": "replace", "path": "dataset.clockDesc", "value": "%s"},
				{"op": "replace", "path": "dataset.clockType", "value": "%s"},
				{"op": "replace", "path": "dataset.clockLabel", "value": "%s"}
			]
		}],
		"signals": {
			"clockIndex": %d,
			"clockName": "%s",
			"clockLabel": "%s"
		}
	}`, clockName, clockDesc, clockType, clockLabel, state.clockIndex, clockName, clockLabel)
}

func handlePrev(w http.ResponseWriter, r *http.Request) {
	state.mu.Lock()
	state.clockIndex = (state.clockIndex - 1 + state.totalClocks) % state.totalClocks
	clockName := clocks[state.clockIndex].Name
	clockDesc := strings.ReplaceAll(clocks[state.clockIndex].Description, `"`, `\"`)
	clockType := clocks[state.clockIndex].Type
	clockLabel := fmt.Sprintf("Clock %d of %d", state.clockIndex+1, state.totalClocks)
	state.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{
		"events": [{
			"targets": [{"selector": "#clock-info"}],
			"patches": [
				{"op": "replace", "path": "textContent", "value": "%s"},
				{"op": "replace", "path": "dataset.clockDesc", "value": "%s"},
				{"op": "replace", "path": "dataset.clockType", "value": "%s"},
				{"op": "replace", "path": "dataset.clockLabel", "value": "%s"}
			]
		}],
		"signals": {
			"clockIndex": %d,
			"clockName": "%s",
			"clockLabel": "%s"
		}
	}`, clockName, clockDesc, clockType, clockLabel, state.clockIndex, clockName, clockLabel)
}

func handleTick(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Accept") != "text/event-stream" {
		http.NotFound(w, r)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	fmt.Fprintln(w, "event: datastar-patch-signals")
	fmt.Fprintf(w, "data: {\"tick\":\"%s\"}\n\n", time.Now().UTC().Format(time.RFC3339Nano))
	flusher.Flush()

	for range ticker.C {
		state.mu.RLock()
		currentClock := clocks[state.clockIndex]
		state.mu.RUnlock()

		tick := time.Now().UTC().Format(time.RFC3339Nano)
		fmt.Fprintln(w, "event: datastar-patch-signals")
		fmt.Fprintf(w, "data: {\"tick\":\"%s\",\"clockName\":\"%s\"}\n\n", tick, currentClock.Name)
		flusher.Flush()
	}
}

func handleInfo(w http.ResponseWriter, r *http.Request) {
	state.mu.Lock()
	state.showInfo = !state.showInfo
	state.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"signals":{"showInfo":%t}}`, state.showInfo)
}

func handleClocks(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(clocks)
}

func handlePiDigits(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "public/pi-digits.txt")
}

func handleStatic(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/static/")
	switch path {
	case "app.css":
		data, err := appCSS.ReadFile("static/app.css")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/css")
		w.Write(data)
		return
	}
	http.NotFound(w, r)
}
