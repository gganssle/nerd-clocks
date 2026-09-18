// Package nerdclocks embeds the web assets so the server ships as one binary.
package nerdclocks

import "embed"

//go:embed web
var Web embed.FS
