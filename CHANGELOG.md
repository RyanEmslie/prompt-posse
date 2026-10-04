# Changelog

All notable changes to prompt-posse are listed here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- A legend row under the ground lists each walking subagent's task, with a mark in its creature's hat color and the task in its body color. When the row is too narrow, the longest tasks are cut short first, so that more fit. What doesn't fit even then is counted as `+N more`.
- No two creatures on the strip wear the same hat color: when one's color is taken, it wears a spare color instead, so several agents of one type can be told apart.

### Changed
- Explore's antennae are light gray instead of white, so they show on a light terminal.
- The boss is redrawn after Claude Code's mascot: boxier, on four short legs, with a darker side at its back, which flips when it turns, and dark eyes. Its eyes used to be holes, so they showed white on a light terminal. In the terminal, a cell with no hole now shows a second color behind its glyph.
- Subagent creatures get dark eyes and a darker side at their back too, in a darker shade of their own color. When one stops to face you, it stands square on, with no side showing.

## [0.4.3] - 2026-10-03

### Fixed
- Creatures now appear even when Claude Code is slow to report which agents are running. Before 0.4.1's fix, a check slower than half a second was always overtaken by the next one, and none were applied.
- When checking for agents keeps failing while nothing is walking, the mod now gives up after three tries instead of retrying every half second forever. Only the first failure in a row goes to the debug log.
- A teammate whose creature was retired after 10 minutes comes back if it's still running once checking resumes after a pause, since it may have gone idle in between unseen.

### Changed
- In the desktop app, the mod's timer now wakes only twice a second, to check for agents. The animation runs on its own, so it no longer ticks 20 times a second there.

## [0.4.2] - 2026-10-03

### Changed
- The `/posse` messages, the legend and the command's description are reworded. They now say what the posse is and use the same words throughout: the posse, the boss (Claude itself) and agents.
- Turning the posse on now says it stays on in new sessions, as turning it off already did.
- A mistyped option is named in the reply, before the options are listed.
- In the desktop app, the description screen readers hear names the kinds of agent walking, not just how many.

## [0.4.1] - 2026-10-03

### Fixed
- A finished subagent's creature no longer comes back, and a new one is no longer missed, when Claude Code is slow to report which subagents are running.
- If checking for subagents fails, the error goes to Claude Code's debug log and the mod tries again at the next half-second check.
- A teammate whose terminal pane died no longer keeps its creature forever. The creature now leaves after 10 minutes of running. A live teammate on a very long turn also loses its creature until it next goes idle.
- Creatures no longer get stuck standing still. On a strip too crowded for everyone to keep their distance they walk through each other, and the boss and a smaller creature that overlap now walk apart.
- If the mod loads or reloads mid-turn, the boss and any subagents already running show up right away.
- New creatures find open starting spots that were missed before.

## [0.4.0] - 2026-10-03

### Added
- The `/posse` command. `/posse` switches the posse on or off, `/posse on` and `/posse off` set it directly, and `/posse legend` lists which look goes with which subagent type. The command takes effect right away, even mid-turn, and the setting is remembered across sessions.
- Switching the posse off clears the strip in the terminal and the desktop app. It stays off until you switch it back on.

## [0.3.0] - 2026-10-03

### Changed
- The boss is now the biggest of the posse, in the shape of the logo Claude Code shows at startup.
- Every hat has its own color: white antennae (Explore), a red top hat (Plan), a cyan propeller cap (general-purpose), a gold crown (`claude`) and a pale yellow halo (fork). The `claude` creature's body is now pink so its crown stands out.
- Custom subagent types get a hat color that never matches their body.
- The strip now needs at least 8 columns, up from 6, to fit the bigger boss.

## [0.2.1] - 2026-10-03

### Changed
- The boss now stays out while any subagent is still walking, leading background subagents after the main turn ends. Before, he left as soon as the turn ended.

## [0.2.0] - 2026-10-03

### Added
- Claude desktop app support. The posse is drawn as one animated image that walks, pauses, steps and blinks on its own, and creatures keep their place when another arrives or leaves. On the desktop, creatures walk past each other instead of bumping.

## [0.1.0] - 2026-10-03

### Added
- First release. While Claude works, the boss walks back and forth above the prompt. He stops at each edge to look at you before turning around, and blinks now and then.
- Each running subagent joins as its own creature, dressed by type: blue with antennae (Explore), green with a top hat (Plan), purple with a propeller cap (general-purpose), gold with a crown (`claude`) and peach with a halo (fork). Any other type gets ears, horns, a mohawk or a sprout, and always the same look.
- Each creature walks at its own pace and turns around when it meets another. Background subagents keep walking after the main turn ends. Terminal only, and needs Claude Code 2.1.289 or newer.

[Unreleased]: https://github.com/RyanEmslie/prompt-posse/compare/a72f9bd...HEAD
[0.4.3]: https://github.com/RyanEmslie/prompt-posse/commit/a72f9bd
[0.4.2]: https://github.com/RyanEmslie/prompt-posse/commit/05aa191
[0.4.1]: https://github.com/RyanEmslie/prompt-posse/commit/20ed772
[0.4.0]: https://github.com/RyanEmslie/prompt-posse/commit/f040d50
[0.3.0]: https://github.com/RyanEmslie/prompt-posse/commit/4b826f9
[0.2.1]: https://github.com/RyanEmslie/prompt-posse/commit/20a8ef6
[0.2.0]: https://github.com/RyanEmslie/prompt-posse/commit/20693fb
[0.1.0]: https://github.com/RyanEmslie/prompt-posse/commit/d7fb77b
