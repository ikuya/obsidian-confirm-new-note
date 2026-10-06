# Confirm New Note

[日本語](README.ja.md)

An [Obsidian](https://obsidian.md) plugin that asks for confirmation before a new note is created.

Obsidian creates notes silently in a few situations, such as clicking a link to a note that doesn't exist yet or pressing `Ctrl/Cmd+N` by accident. This plugin shows a dialog first, so stray empty notes don't pile up in your vault.

## Features

- **Links to non-existing notes**: clicking an unresolved link (`[[Missing note]]`) shows a dialog before Obsidian creates and opens the note. This covers Reading view, Live Preview, Source mode, the graph view, and anything else that opens links through `workspace.openLinkText()`.
- **New-note commands**: commands whose ID starts with one of the configured prefixes ask for confirmation before they run. The default prefix `file-explorer:new-file` covers "Create new note" (`Ctrl/Cmd+N`) and its variants (e.g. creating a note in a new tab).
- **Keyboard**: `Enter` creates the note. `Esc`, clicking outside the dialog, or the close button cancels.
- **UI language**: the UI is shown in Japanese when Obsidian's language is set to Japanese, and in English otherwise.

## Installation

The plugin isn't in the community plugin directory, so install it manually:

1. Create the folder `<your vault>/.obsidian/plugins/confirm-new-note/`.
2. Copy `main.js` and `manifest.json` into it.
3. Restart Obsidian (or reload the plugin list), then enable **Confirm New Note** under **Settings → Community plugins**.

Requires Obsidian 1.4.0 or later. Works on desktop and mobile.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Confirm before opening a link to a non-existing note | On | Show a dialog before a note is auto-created by following an unresolved link. |
| Confirm before new-note commands | On | Show a dialog before creating a note via `Ctrl/Cmd+N` or the command palette. |
| Command ID prefixes to guard | `file-explorer:new-file` | One prefix per line. Every command whose ID starts with one of these is guarded. |
| Debug log | Off | Log intercepted actions to the developer console (`Ctrl/Cmd+Shift+I`). |

### Guarding other commands

You can add commands from other core or community plugins to the prefix list, for example:

```
file-explorer:new-file
daily-notes
zk-prefixer
```

To find a command's ID, enable **Debug log** or run `Object.keys(app.commands.commands)` in the developer console.

Changes to the prefix list take effect after you reload Obsidian or turn the plugin off and on again. The two on/off toggles take effect immediately.

## Limitations

- The plugin relies on Obsidian internals that aren't part of the public API (`workspace.openLinkText` and `app.commands`). A future Obsidian update could break it. If that happens, a warning is written to the developer console and the affected guard is turned off; Obsidian itself keeps working.
- Only commands that define `callback` or `checkCallback` can be guarded. Commands that only define `editorCallback` are skipped (and logged when Debug log is on).
- Notes created without going through a link or a matching command (for example, buttons that call internal APIs directly) aren't guarded.
- Only one dialog is shown at a time. If another creation is triggered while a dialog is open, that second request is cancelled.

## License

[MIT](LICENSE)
