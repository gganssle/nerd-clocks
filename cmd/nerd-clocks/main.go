// Command nerd-clocks serves a gallery of unusual clocks for an office display.
package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"strings"

	nerdclocks "github.com/gganssle/nerd-clocks"
	"github.com/gganssle/nerd-clocks/internal/server"
)

func main() {
	addr := flag.String("addr", envOr("NERD_CLOCKS_ADDR", ":31337"), "listen address")
	lat := flag.Float64("lat", 0, "observer latitude in degrees (north positive); omit to use browser geolocation")
	lon := flag.Float64("lon", 0, "observer longitude in degrees (east positive)")
	clock := flag.String("clock", "", "clock to show at startup (id)")
	cycle := flag.Int("cycle", 0, "auto-advance period in seconds (0 = off)")
	dev := flag.Bool("dev", false, "serve web/ from disk instead of the embedded copy (live edits)")
	flag.Parse()

	hasLoc := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "lat" || f.Name == "lon" {
			hasLoc = true
		}
	})

	var web fs.FS = nerdclocks.Web
	if *dev {
		web = os.DirFS("web")
	} else {
		sub, err := fs.Sub(nerdclocks.Web, "web")
		if err != nil {
			log.Fatal(err)
		}
		web = sub
	}

	srv, err := server.New(server.Config{
		Web: web, Lat: *lat, Lon: *lon, HasLocation: hasLoc,
		Clock: *clock, Cycle: *cycle, Dev: *dev,
	})
	if err != nil {
		log.Fatal(err)
	}

	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	fmt.Printf("nerd-clocks is ticking\n  display: http://localhost:%d/\n", port)
	for _, ip := range lanIPs() {
		fmt.Printf("  remote:  http://%s:%d/remote  (open on your phone)\n", ip, port)
	}
	log.Fatal(http.Serve(ln, srv))
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func lanIPs() []string {
	var out []string
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if ipn, ok := a.(*net.IPNet); ok && !ipn.IP.IsLoopback() && ipn.IP.To4() != nil {
			ip := ipn.IP.String()
			if !strings.HasPrefix(ip, "169.254.") {
				out = append(out, ip)
			}
		}
	}
	return out
}
