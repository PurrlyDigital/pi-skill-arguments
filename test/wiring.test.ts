// ─── AC-3: wiring contract — input event handler ──────────────────────
//
// Mirrors context-trimmer's mock-pi test pattern: register handlers,
// invoke them with a synthetic event, assert the return value.

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import skillArgumentsExtension, { MARKER } from "../index.ts";

// ─── Mock pi ──────────────────────────────────────────────────────────

type InputResult =
	| { action: "continue" }
	| { action: "transform"; text: string }
	| { action: "handled" };

type Handler = (event: unknown, ctx: unknown) => Promise<InputResult | unknown> | InputResult | unknown;

function createMockPi() {
	const handlers: Record<string, Handler[]> = {};
	const pi = {
		on(event: string, handler: Handler) {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		},
		getHandlers(event: string): Handler[] {
			return handlers[event] ?? [];
		},
	};
	return pi;
}

async function loadExtension() {
	const pi = createMockPi();
	await skillArgumentsExtension(pi as unknown as Parameters<typeof skillArgumentsExtension>[0]);
	return pi;
}

async function invokeInput(pi: ReturnType<typeof createMockPi>, event: unknown): Promise<InputResult> {
	const handlers = pi.getHandlers("input");
	assert.ok(handlers.length > 0, "input handler must be registered");
	return handlers[0](event, {}) as Promise<InputResult>;
}

// ─── Test fixtures ────────────────────────────────────────────────────

let fixtureDir: string;
let savedCwd: string;

const SAMPLE_SKILL_CONTENT = `---
name: greet
description: Greet someone by name.
---

# Greet

Say hello to the user.
`;

before(() => {
	fixtureDir = mkdtempSync(join(tmpdir(), "pi-skill-args-"));
	// Place fixtures under the cwd-anchored hardcoded fallback location
	// `.pi/skills/<name>/SKILL.md` (one of the entries in the resolver's
	// baseDirs chain). The wiring consults cwd-relative locations when
	// the env-var seam is absent.
	const skillsDir = join(fixtureDir, ".pi", "skills");
	mkdirSync(join(skillsDir, "greet"), { recursive: true });
	writeFileSync(join(skillsDir, "greet", "SKILL.md"), SAMPLE_SKILL_CONTENT);
	// Add a second skill for the happy-path regression guard below.
	mkdirSync(join(skillsDir, "my-skill"), { recursive: true });
	writeFileSync(join(skillsDir, "my-skill", "SKILL.md"), SAMPLE_SKILL_CONTENT);

	savedCwd = process.cwd();
	process.chdir(fixtureDir);
});

after(() => {
	process.chdir(savedCwd);
	rmSync(fixtureDir, { recursive: true, force: true });
});

beforeEach(() => {
	// Re-anchor cwd at the fixture for every test in case an earlier
	// path-traversal test moved it.
	process.chdir(fixtureDir);
});

afterEach(() => {
	process.chdir(savedCwd);
});

// ─── Hook registration ────────────────────────────────────────────────

describe("extension wiring", () => {
	it("registers an input handler on load", async () => {
		const pi = await loadExtension();
		const handlers = pi.getHandlers("input");
		assert.ok(handlers.length > 0, "expected at least one input handler");
	});

	it("registers no other event handlers", async () => {
		const pi = await loadExtension();
		assert.equal(pi.getHandlers("session_start").length, 0);
		assert.equal(pi.getHandlers("context").length, 0);
		assert.equal(pi.getHandlers("before_agent_start").length, 0);
	});
});

// ─── AC-3: pass-through paths ─────────────────────────────────────────

describe("input handler — pass-through", () => {
	it("returns continue for extension-source input", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:greet hello",
			source: "extension",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("returns continue for non-skill input", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "just a normal message",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("returns continue for /skill: with no name", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("returns continue for bare /skill:<name> with no args", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:greet",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("returns continue for bare /skill:<name> with single trailing space", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:greet ",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("returns continue for an unknown skill with non-empty args", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:does-not-exist hello",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});
});

// ─── AC-3: transform path — inlined block ─────────────────────────────

describe("input handler — transform path", () => {
	it("returns transform with the inlined block for /skill:<name> <args>", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:greet Alice",
			source: "interactive",
		});
		assert.equal(result.action, "transform");
		const text = (result as { text: string }).text;
		assert.ok(text.startsWith("/skill:greet\n\n"), "transformed text must keep /skill:<name> prefix");
		assert.ok(text.includes(SAMPLE_SKILL_CONTENT), "transformed text must include skill content");
		assert.ok(text.includes(MARKER), "transformed text must include the marker");
		assert.ok(text.endsWith("Alice"), "args must be the trailing text");
	});

	it("preserves multi-word args verbatim in the transform", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:greet  hello   world ",
			source: "interactive",
		});
		assert.equal(result.action, "transform");
		const text = (result as { text: string }).text;
		assert.ok(text.includes("hello   world "), "internal whitespace and trailing whitespace must be preserved");
	});
});

// ─── Security: path-traversal vectors are blocked ─────────────────────
//
// Mirrors the security QA PoC: for each traversal vector, the input
// handler must return {action:"continue"} — it must NOT transform,
// and any path an attacker could escape into is checked for a
// sentinel "TOPSECRET" string to guarantee the out-of-sandbox file
// was never read.

describe("input handler — path-traversal vectors are blocked", () => {
	const SECRET_NEEDLE = "TOPSECRET:traversal-must-not-read-this";

	let secretDir: string;

	before(() => {
		secretDir = mkdtempSync(join(tmpdir(), "pi-skill-args-trav-"));
		// Mirror the security-QA PoC layout: <secretDir>/secrets/leaked/SKILL.md
		// is the cwd-anchored `<base>/<name>/SKILL.md` form target for
		// "/skill:../secrets/leaked".
		mkdirSync(join(secretDir, "secrets", "leaked"), { recursive: true });
		writeFileSync(join(secretDir, "secrets", "leaked", "SKILL.md"), SECRET_NEEDLE);
		// And <secretDir>/secretB.md is the `<base>/<name>.md` form target
		// for "/skill:../secretB".
		writeFileSync(join(secretDir, "secretB.md"), SECRET_NEEDLE);
	});

	after(() => {
		rmSync(secretDir, { recursive: true, force: true });
	});

	// Helper: run a single vector. stages CWD at <secretDir> and asserts
	// continue, no transform, and the secret needle is never in the
	// result text.
	async function assertBlocked(opts: {
		input: string;
		workdir: string;
		label: string;
	}) {
		const cwdSaved = process.cwd();
		try {
			process.chdir(opts.workdir);
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: opts.input,
				source: "interactive",
			});
			assert.equal(
				result.action,
				"continue",
				`[${opts.label}] expected action=continue, got action=${(result as { action: string }).action}`,
			);
			assert.equal(
				(result as { text?: string }).text,
				undefined,
				`[${opts.label}] expected no transform text, got: ${JSON.stringify((result as { text?: string }).text)}`,
			);
		} finally {
			process.chdir(cwdSaved);
		}
	}

	it("Vector A — cwd <base>/<name>/SKILL.md form: /skill:../secrets/leaked", async () => {
		await assertBlocked({
			input: "/skill:../secrets/leaked foo",
			workdir: secretDir,
			label: "A-cwd-SKILL.md",
		});
	});

	it("Vector B — cwd <base>/<name>.md form: /skill:../secretB", async () => {
		await assertBlocked({
			input: "/skill:../secretB foo",
			workdir: secretDir,
			label: "B-cwd-.md",
		});
	});

	it("absolute path /skill:/etc/passwd", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:/etc/passwd foo",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("embedded slash /skill:foo/bar", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:foo/bar foo",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("bare '..' /skill:..", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:.. foo",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});

	it("consecutive hyphens /skill:foo--bar", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:foo--bar foo",
			source: "interactive",
		});
		assert.deepEqual(result, { action: "continue" });
	});
});

// ─── Security: happy-path regression guard ────────────────────────────

describe("input handler — happy path is not regressed by the validator", () => {
	it("still transforms a valid /skill:my-skill some-arg invocation", async () => {
		const pi = await loadExtension();
		const result = await invokeInput(pi, {
			text: "/skill:my-skill some-arg",
			source: "interactive",
		});
		assert.equal(result.action, "transform");
		const text = (result as { text: string }).text;
		assert.equal(
			text,
			`/skill:my-skill\n\n${SAMPLE_SKILL_CONTENT}\n\n--- user input ---\nsome-arg`,
		);
	});
});

// ─── Security: symlink-escape in readSkillContent is blocked ──────────
//
// The lexical containment guard (`isWithin(resolved, base)`) confirms
// the path *string* stays under the base dir, but `existsSync` and
// `readFileSync` follow symlinks. A symlink planted inside a base dir
// pointing at a file outside the base dir would otherwise pass the
// lexical check and have its target read into the model context. The
// guard canonicalizes both base and candidate through `realpathSync`
// and re-checks containment before reading.

describe("input handler — symlink-escape is blocked", () => {
	const SECRET_NEEDLE = "TOPSECRET:symlink-escape-must-not-read-this";

	let symlinkDir: string;
	let symlinkBaseDir: string;
	let symlinkSecretPath: string;
	let symlinkCreated = false;

	before(() => {
		symlinkDir = mkdtempSync(join(tmpdir(), "pi-skill-args-sym-"));
		// Skills base dir is `<symlinkDir>/.pi/skills`; the secret file
		// lives one level above the base so the symlink's real target
		// is outside the base (escapes containment).
		symlinkBaseDir = join(symlinkDir, ".pi", "skills");
		mkdirSync(symlinkBaseDir, { recursive: true });
		symlinkSecretPath = join(symlinkDir, "secret.txt");
		writeFileSync(symlinkSecretPath, SECRET_NEEDLE);

		// Plant a symlink at `<base>/<name>/SKILL.md` (the form the
		// resolver consults first) pointing at the secret file with an
		// absolute target. Also plant the `<base>/<name>.md` form, also
		// absolute, to cover both shapes the resolver checks. Absolute
		// targets are unambiguous regardless of how deep the link sits
		// in the base dir tree. Try/catch around each symlink creation
		// so platforms that require privilege to create symlinks
		// (Windows without developer mode) skip cleanly.
		for (const skillName of ["sym-skill", "sym-skill-md"]) {
			const dir = join(symlinkBaseDir, skillName);
			mkdirSync(dir, { recursive: true });
			try {
				symlinkSync(symlinkSecretPath, join(dir, "SKILL.md"));
				symlinkCreated = true;
			} catch {
				// Skip on platforms that deny unprivileged symlink creation.
				return;
			}
		}
		try {
			symlinkSync(symlinkSecretPath, join(symlinkBaseDir, "sym-skill-md.md"));
			symlinkCreated = true;
		} catch {
			// Skip on platforms that deny unprivileged symlink creation.
		}
	});

	after(() => {
		rmSync(symlinkDir, { recursive: true, force: true });
	});

	// Helper: returns true when `haystack` is a string and contains the
	// needle. Hoisted into a function so TypeScript's control-flow
	// narrowing does not constrain its argument after the prior
	// `assert.equal(text, undefined)` check.
	function needlePresent(haystack: unknown, needle: string): boolean {
		return typeof haystack === "string" && haystack.includes(needle);
	}

	// Helper: stage cwd at <symlinkDir>, run the handler, assert the
	// escape is blocked. The needle check fails the test if the target
	// file's content ever appears in the result text.
	async function assertEscapeBlocked(opts: { input: string; label: string }) {
		if (!symlinkCreated) {
			// Symlink creation needs privilege on this platform; the
			// escape vector is therefore not present and there is nothing
			// to assert. Skip rather than fail.
			return;
		}
		const cwdSaved = process.cwd();
		try {
			process.chdir(symlinkDir);
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: opts.input,
				source: "interactive",
			});
			assert.equal(
				result.action,
				"continue",
				`[${opts.label}] expected action=continue, got action=${(result as { action: string }).action}`,
			);
			const text = (result as { text?: string }).text;
			assert.equal(
				text,
				undefined,
				`[${opts.label}] expected no transform text, got: ${JSON.stringify(text)}`,
			);
			assert.equal(
				needlePresent(text, SECRET_NEEDLE),
				false,
				`[${opts.label}] result text must not contain the target file's contents`,
			);
		} finally {
			process.chdir(cwdSaved);
		}
	}

	it("blocks a symlink at <base>/<name>/SKILL.md pointing outside the base (absolute target)", async () => {
		await assertEscapeBlocked({
			input: "/skill:sym-skill some-arg",
			label: "symlink-SKILL.md-absolute",
		});
	});

	it("blocks a symlink at <base>/<name>.md pointing outside the base (absolute target)", async () => {
		await assertEscapeBlocked({
			input: "/skill:sym-skill-md some-arg",
			label: "symlink-.md-absolute",
		});
	});

	it("regular SKILL.md under the same fixture base still inlines (no regression)", async () => {
		// Plant a real file in the base so the happy path can be exercised
		// against the same fixture setup. This proves the realpath guard
		// does not regress regular files.
		if (!symlinkCreated) return;
		const realDir = join(symlinkBaseDir, "real-skill");
		mkdirSync(realDir, { recursive: true });
		writeFileSync(join(realDir, "SKILL.md"), SAMPLE_SKILL_CONTENT);
		const cwdSaved = process.cwd();
		try {
			process.chdir(symlinkDir);
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "/skill:real-skill some-arg",
				source: "interactive",
			});
			assert.equal(result.action, "transform");
			const text = (result as { text: string }).text;
			assert.ok(
				text.includes(SAMPLE_SKILL_CONTENT),
				"regular SKILL.md in the base must still be inlined",
			);
			assert.equal(
				text.includes(SECRET_NEEDLE),
				false,
				"regular SKILL.md transform must not contain the secret needle",
			);
		} finally {
			process.chdir(cwdSaved);
		}
	});
});

// ─── Streaming-state routing ─────────────────────────────────────────
//
// The `input` handler must be state-agnostic: it parses and transforms
// `/skill:<name> <args>` regardless of `streamingBehavior` (idle, steer,
// followUp). The harness sets `streamingBehavior` on input events that
// fire while a turn is mid-flight (steer) or while a follow-up is
// queued (followUp); the extension must still inline args in those
// states. The handler never reads `streamingBehavior`; these tests
// prove the transform fires for those event shapes.

describe("input handler — streaming states (steer, followUp)", () => {
	const streamingShapes: Array<{ streamingBehavior: "steer" | "followUp"; label: string }> = [
		{ streamingBehavior: "steer", label: "steer" },
		{ streamingBehavior: "followUp", label: "followUp" },
	];

	for (const { streamingBehavior, label } of streamingShapes) {
		it(`transforms /skill:<name> <args> when streamingBehavior is "${label}"`, async () => {
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "/skill:greet Alice",
				source: "interactive",
				streamingBehavior,
			});
			assert.equal(result.action, "transform");
			const text = (result as { text: string }).text;
			assert.equal(
				text,
				`/skill:greet\n\n${SAMPLE_SKILL_CONTENT}\n\n--- user input ---\nAlice`,
			);
		});

		it(`preserves multi-word args in the transform when streamingBehavior is "${label}"`, async () => {
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "/skill:greet  hello   world ",
				source: "interactive",
				streamingBehavior,
			});
			assert.equal(result.action, "transform");
			const text = (result as { text: string }).text;
			assert.ok(text.includes("hello   world "), "internal whitespace and trailing whitespace must be preserved");
		});

		it(`returns continue for non-skill input when streamingBehavior is "${label}"`, async () => {
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "just a normal message",
				source: "interactive",
				streamingBehavior,
			});
			assert.deepEqual(result, { action: "continue" });
		});

		it(`returns continue for bare /skill:<name> (no args) when streamingBehavior is "${label}"`, async () => {
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "/skill:greet",
				source: "interactive",
				streamingBehavior,
			});
			assert.deepEqual(result, { action: "continue" });
		});

		it(`returns continue for extension-source input when streamingBehavior is "${label}"`, async () => {
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "/skill:greet Alice",
				source: "extension",
				streamingBehavior,
			});
			assert.deepEqual(result, { action: "continue" });
		});

		it(`returns continue for an unknown skill when streamingBehavior is "${label}"`, async () => {
			const pi = await loadExtension();
			const result = await invokeInput(pi, {
				text: "/skill:does-not-exist hello",
				source: "interactive",
				streamingBehavior,
			});
			assert.deepEqual(result, { action: "continue" });
		});
	}
});

// ─── AC-5: closed env-var surface ─────────────────────────────────────

describe("closed env-var surface", () => {
	const indexSource = readFileSync(
		pathResolve(import.meta.dirname ?? __dirname, "../index.ts"),
		"utf-8",
	);

	it("index.ts has no process.env references (env-var surface is empty)", () => {
		const dotRefs = [...(indexSource.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g) ?? [])].map((m) => m[1]);
		const bracketRefNames = [...(indexSource.matchAll(/process\.env\[\s*([A-Z_][A-Z0-9_]*)\s*\]/g) ?? [])].map((m) => m[1]);

		assert.deepEqual(
			[...dotRefs, ...bracketRefNames],
			[],
			"index.ts must not reference process.env; the env-var surface is closed",
		);
	});
});
