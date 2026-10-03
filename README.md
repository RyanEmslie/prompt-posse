# prompt-posse

A Claude Code mod that puts a little parade above your prompt while Claude works. The boss walks back and forth, and every subagent Claude starts joins in as a creature of its own.

![The boss and four subagent creatures walking above the Claude Code prompt while Claude works](docs/screenshot.png)

The whole lineup, as text:

```
              ▝▖▗▘        ▗▄██▄▖        ▀▙▟▀         ▙▟▙▟         ▝▀▀▘
 █▜▛█         █▜▛█         █▜▛█         █▜▛█         █▜▛█         █▜▛█
▀▛▛▜▜▀       ▀▛▛▜▜▀       ▀▛▛▜▜▀       ▀▛▛▜▜▀       ▀▛▛▜▜▀       ▀▛▛▜▜▀
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
```

From left to right: the boss, then the creatures for Explore, Plan, general-purpose, `claude` and fork subagents.

## What it does

- The boss appears when a turn starts and walks the full width of the prompt. At each edge it stops, looks at you, and turns around. It blinks now and then, and it leaves when the turn ends.
- Each running subagent gets its own creature. The creature's headwear and color depend on the subagent's type:

  | Subagent type | Headwear | Color |
  | --- | --- | --- |
  | main turn (the boss) | none | orange |
  | Explore | antennae | blue |
  | Plan | top hat | green |
  | general-purpose | propeller cap | purple |
  | `claude` | crown | gold |
  | fork | halo | peach |
  | any other type | ears, horns, a mohawk or a sprout | picked from the type's name |

  A custom type always gets the same look, and never headwear a built-in type wears.
- Each creature walks at its own pace. In the terminal, when two meet, they stop briefly and turn around. In the desktop app they walk past each other.
- Subagents running in the background keep walking after the main turn ends. The strip disappears when the last one finishes.

## Requirements

- Claude Code 2.1.289 or newer. The function-hook API this mod uses is in early access and may change between releases.
- The terminal or the Claude desktop app. VS Code and mobile don't draw the creatures.

In the terminal, the creatures are drawn in text characters and repainted 20 times a second. In the desktop app, they're one SVG that animates itself, so nothing is sent per frame. It's only redrawn when a creature arrives or leaves.

## Install

Clone the repo:

```sh
git clone https://github.com/RyanEmslie/prompt-posse.git
```

To try it in one session, point Claude Code at the folder:

```sh
claude --plugin-dir /path/to/prompt-posse
```

To load it in every session, add the folder's absolute path to the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/prompt-posse"
  }
}
```

Sessions the desktop app starts read the same setting.

Interactive terminal sessions watch the folder, so edits reload in sessions that are already open. Desktop sessions only do that when `CLAUDE_CODE_PLUGIN_DIR_WATCH` is also set to `1`. Otherwise edits show up in new sessions.

## Customizing

- **Speed:** change `TICK_MS` in `hooks/walker.ts`. Lower is faster.
- **Looks:** edit `hooks/looks.ts`. Headwear is two text rows of 12 characters, with `#` for a filled pixel. Colors are `0xRRGGBB` values.
- **Body and legs:** the sprite is in `hooks/sprite.ts`, drawn the same way.
- **Desktop drawing:** `hooks/svg.ts` turns the same sprites into the animated SVG.

## Development

```sh
claude plugin validate .
claude plugin test .
```

## Known limits

- In the terminal, the `[-]` collapse button sits on the strip's top row, so near the right edge it briefly covers a creature's headwear.
- Colors are fixed RGB values. They don't follow your terminal's color scheme or the desktop app's theme.
- Claude Code keeps one empty row between the strip and the prompt box, so the creatures can't stand directly on the prompt's border. The ground line under them stands in for it.

## License

MIT. See [LICENSE](LICENSE).

This is an unofficial fan project, not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
