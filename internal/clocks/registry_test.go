package clocks

import (
	"testing"
	"testing/fstest"
)

func testFS() fstest.MapFS {
	return fstest.MapFS{
		"c/b-clock.html": {Data: []byte("<!--\nname: Bee\ntagline: buzz\ncategory: Insects\norder: 20\naccent: #ff0\n-->\n<p>body</p>")},
		"c/a-clock.html": {Data: []byte("<!--\nname: Ant\norder: 10\n-->\n<p>a</p>")},
		"c/notes.txt":    {Data: []byte("ignored")},
	}
}

func TestLoadOrdersAndParses(t *testing.T) {
	c, err := Load(testFS(), "c")
	if err != nil {
		t.Fatal(err)
	}
	if c.Len() != 2 || c.All()[0].ID != "a-clock" || c.All()[1].ID != "b-clock" {
		t.Fatalf("unexpected order: %+v", c.All())
	}
	b, ok := c.Get("b-clock")
	if !ok || b.Name != "Bee" || b.Tagline != "buzz" || b.Category != "Insects" || b.Accent != "#ff0" || string(b.Body) != "<p>body</p>" {
		t.Fatalf("bad parse: %+v", b)
	}
}

func TestStepWraps(t *testing.T) {
	c, _ := Load(testFS(), "c")
	if got := c.Step("b-clock", 1); got != "a-clock" {
		t.Errorf("next of last = %s", got)
	}
	if got := c.Step("a-clock", -1); got != "b-clock" {
		t.Errorf("prev of first = %s", got)
	}
	if got := c.Step("nope", 1); got != "a-clock" {
		t.Errorf("step from unknown = %s", got)
	}
}

func TestParseErrors(t *testing.T) {
	for name, raw := range map[string]string{
		"no header":    "<p>hi</p>",
		"no name":      "<!--\ntagline: x\n-->",
		"bad order":    "<!--\nname: X\norder: soon\n-->",
		"unterminated": "<!--\nname: X\n",
	} {
		if _, err := parse("x", raw); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
	if _, err := parse("Bad_ID", "<!--\nname: X\n-->"); err == nil {
		t.Error("expected invalid id error")
	}
}
