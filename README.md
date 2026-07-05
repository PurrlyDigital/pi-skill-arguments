# pi-skill-arguments

A [Pi](https://github.com/earendil-works/pi/) extension that allows skills to take "arguments" and puts the arguments inline for a single model prompt and context.

## What it does

Today, typing `/skill:greet Alice` in pi causes the harness to:

1. Load the `greet` skill's content into the LLM context.
2. Append a follow-up user prompt: `User: Alice`.

The follow-up prompt periodically confuses models — they treat the args as a separate user turn rather than as input to the skill. This extension rewrites the invocation so the args land **inside** the skill's context block (at the recency band, after a labeled marker) and the harness emits no follow-up user prompt at all.

This also works for multi-line prompts:

```
/skill:start-a-conversation-with Alice

Hey, quite the weather today.
```

## Before / after

**Before** (default harness behavior):

```
---PROMPT---
<skill content for "greet">

---PROMPT---
User: Alice

```

**After** (this extension):

```
---PROMPT---
<skill content for "greet">

--- user input ---
Alice
```

The `/skill:greet` invocation is still triggered, the skill is still loaded by name, and the args are still the trailing text. The difference is that the args are now part of the skill's own context, not a separate user turn.

## Install

Place the extension in your `~/.pi/agent/extensions/` directory:

```bash
git clone https://github.com/PurrlyDigital/pi-skill-arguments ~/.pi/agent/extensions/pi-skill-arguments
```

Then restart pi or run `/reload`.

## Usage

Plain invocation — no change to the surface syntax:

```
/skill:greet Alice
/skill:my-skill some-arg
/skill:pdf-tools extract chapter-3
```

Original usage unchanged.

```
/skill:my-no-argument-skill
```

Args are passed verbatim. Whitespace between the skill name and the args is consumed; internal whitespace is preserved.

## Configuration

The extension has no configuration surface. The argument-parse contract is part of the public surface and is not configurable — no env var, config file, or runtime knob changes parse, resolve, or handler behavior. Skill discovery follows the harness's own documented locations.

## How it works

The extension registers a single `input` event handler that fires before the harness's skill expansion. For each input line:

1. **Skip extension-injected messages** (the extension never re-processes what it has already seen).
2. **Parse the line** into one of three discriminated shapes: a skill invocation with args, a bare skill invocation (no args), or anything else (passes through).
3. **Pass-through paths** — non-skill input, bare skill invocations, and unknown skill names are returned unchanged. The harness handles them the same way it always has.
4. **Transform path** — for a `/skill:<name> <args>` invocation whose skill content can be located on disk, the extension reads the skill's `SKILL.md`, appends a `--- user input ---` marker line and the args, and returns the inlined block to the harness. The harness's skill expansion loads the skill by name (the `/skill:<name>` prefix is preserved in the transformed text) and emits no follow-up user prompt because there are no trailing args.

The parse and resolve logic is split into pure modules (`parse.ts` and `resolve.ts`) for testability — no filesystem, no environment, no harness I/O lives in those modules.

## Limitations

- **Streaming-aware routing is not yet supported.** If you invoke a skill from a non-idle state (mid-stream or as a queued follow-up), the extension passes through unchanged and the harness's default follow-up prompt behavior applies.
- **The skill content must be discoverable on disk** (in one of the configured skills directories). If the extension cannot locate a `SKILL.md` for the named skill, it passes through and lets the harness surface "skill not found" via its own expansion path.
- **End-to-end harness testing is not included** in this release. The unit tests cover the parse, resolve, and wiring contracts; an integration test that boots pi and asserts the inlined block in the LLM-bound prompt is planned for a follow-up.

## Development

```bash
npm install
npm test
npm run typecheck
```

Tests run under [`tsx --test`](https://github.com/privatenumber/tsx) against an explicit file list — no glob expansion, deterministic on every machine. The `test/wiring.test.ts` suite uses a temp directory and `mkdtempSync` for any fixture paths, so it never reads an operator's real config.

## License

MIT
