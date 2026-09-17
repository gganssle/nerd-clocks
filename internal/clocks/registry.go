// Package clocks loads the clock catalog: one explainer file per clock in
// web/content/clocks/<id>.html, each paired with a JS module in
// web/static/clocks/<id>.js that does the actual drawing.
package clocks

import (
	"bufio"
	"fmt"
	"html/template"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Clock is the metadata and explainer for one clock face.
type Clock struct {
	ID       string
	Name     string
	Tagline  string
	Category string
	Accent   string
	Order    int
	// Body is the "how it works" explainer, trusted HTML from the embedded FS.
	Body template.HTML
}

// Catalog is the ordered list of clocks.
type Catalog struct {
	list []Clock
	byID map[string]int
}

var idPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

// Load parses every *.html file in dir. Each file starts with a metadata
// comment block of "key: value" lines:
//
//	<!--
//	name: Kepler Orbits
//	tagline: Hands that obey the laws of planetary motion
//	category: Astronomy
//	order: 10
//	accent: #ffb347
//	-->
func Load(fsys fs.FS, dir string) (*Catalog, error) {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return nil, err
	}
	c := &Catalog{byID: map[string]int{}}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".html") {
			continue
		}
		raw, err := fs.ReadFile(fsys, path.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		id := strings.TrimSuffix(e.Name(), ".html")
		clk, err := parse(id, string(raw))
		if err != nil {
			return nil, fmt.Errorf("%s: %w", e.Name(), err)
		}
		c.list = append(c.list, clk)
	}
	if len(c.list) == 0 {
		return nil, fmt.Errorf("no clocks found in %s", dir)
	}
	sort.SliceStable(c.list, func(i, j int) bool {
		if c.list[i].Order != c.list[j].Order {
			return c.list[i].Order < c.list[j].Order
		}
		return c.list[i].ID < c.list[j].ID
	})
	for i, clk := range c.list {
		c.byID[clk.ID] = i
	}
	return c, nil
}

func parse(id, raw string) (Clock, error) {
	if !idPattern.MatchString(id) {
		return Clock{}, fmt.Errorf("invalid clock id %q", id)
	}
	raw = strings.TrimLeft(raw, " \t\r\n")
	if !strings.HasPrefix(raw, "<!--") {
		return Clock{}, fmt.Errorf("missing metadata comment")
	}
	end := strings.Index(raw, "-->")
	if end < 0 {
		return Clock{}, fmt.Errorf("unterminated metadata comment")
	}
	clk := Clock{ID: id, Accent: "#9ef0c8", Order: 1000}
	sc := bufio.NewScanner(strings.NewReader(raw[4:end]))
	for sc.Scan() {
		key, val, ok := strings.Cut(sc.Text(), ":")
		if !ok {
			continue
		}
		val = strings.TrimSpace(val)
		switch strings.TrimSpace(key) {
		case "name":
			clk.Name = val
		case "tagline":
			clk.Tagline = val
		case "category":
			clk.Category = val
		case "accent":
			clk.Accent = val
		case "order":
			n, err := strconv.Atoi(val)
			if err != nil {
				return Clock{}, fmt.Errorf("bad order %q", val)
			}
			clk.Order = n
		}
	}
	if clk.Name == "" {
		return Clock{}, fmt.Errorf("missing name")
	}
	clk.Body = template.HTML(strings.TrimSpace(raw[end+3:]))
	return clk, nil
}

// All returns the clocks in display order.
func (c *Catalog) All() []Clock { return c.list }

// Len is the number of clocks.
func (c *Catalog) Len() int { return len(c.list) }

// Get looks a clock up by id.
func (c *Catalog) Get(id string) (Clock, bool) {
	i, ok := c.byID[id]
	if !ok {
		return Clock{}, false
	}
	return c.list[i], true
}

// Index returns the position of id, or -1.
func (c *Catalog) Index(id string) int {
	if i, ok := c.byID[id]; ok {
		return i
	}
	return -1
}

// Step returns the id that is delta positions away from id, wrapping around.
func (c *Catalog) Step(id string, delta int) string {
	i := c.Index(id)
	if i < 0 {
		return c.list[0].ID
	}
	n := len(c.list)
	return c.list[((i+delta)%n+n)%n].ID
}
