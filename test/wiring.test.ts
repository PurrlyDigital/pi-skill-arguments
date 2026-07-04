// ─── AC-3: wiring contract — input event handler ──────────────────────
//
// Mirrors context-trimmer's mock-pi test pattern: register handlers,
// invoke them with a synthetic event, assert the return value.

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import skillArgumentsExtension, { ENV_SKILLS_DIR, MARKER } from "../index.ts";

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
let skillsDir: string;
let savedSkillsDirEnv: string | undefined;
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
	skillsDir = join(fixtureDir, "skills");
	mkdirSync(join(skillsDir, "greet"), { recursive: true });
	writeFileSync(join(skillsDir, "greet", "SKILL.md"), SAMPLE_SKILL_CONTENT);

	savedSkillsDirEnv = process.env[ENV_SKILLS_DIR];
	process.env[ENV_SKILLS_DIR] = skillsDir;

	savedCwd = process.cwd();
	process.chdir(fixtureDir);
});

after(() => {
	if (savedSkillsDirEnv === undefined) delete process.env[ENV_SKILLS_DIR];
	else process.env[ENV_SKILLS_DIR] = savedSkillsDirEnv;
	process.chdir(savedCwd);
	rmSync(fixtureDir, { recursive: true, force: true });
});

beforeEach(() => {
	process.env[ENV_SKILLS_DIR] = skillsDir;
});

afterEach(() => {
	if (savedSkillsDirEnv === undefined) delete process.env[ENV_SKILLS_DIR];
	else process.env[ENV_SKILLS_DIR] = savedSkillsDirEnv;
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

// ─── AC-5: closed env-var surface ─────────────────────────────────────

describe("closed env-var surface", () => {
	const indexSource = readFileSync(
		pathResolve(import.meta.dirname ?? __dirname, "../index.ts"),
		"utf-8",
	);

	it("only references the PI_SKILL_ARGUMENTS_* namespace in process.env", () => {
		// Find every process.env reference in the file (both dot and bracket
		// access patterns). For bracket access, resolve the const name back
		// to its declared value via a small regex over the `const X = "..."`
		// lines in the file. Every resolved name must be in the
		// PI_SKILL_ARGUMENTS_ namespace.
		const constMap = new Map<string, string>();
		for (const m of indexSource.matchAll(/^const\s+(\w+)\s*=\s*["']([^"']+)["']\s*;?/gm)) {
			constMap.set(m[1], m[2]);
		}

		const dotRefs = [...(indexSource.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g) ?? [])].map((m) => m[1]);
		const bracketRefNames = [...(indexSource.matchAll(/process\.env\[\s*([A-Z_][A-Z0-9_]*)\s*\]/g) ?? [])].map((m) => m[1]);
		const bracketRefValues = bracketRefNames.map((name) => constMap.get(name) ?? name);

		const allRefs = [...dotRefs, ...bracketRefValues];
		assert.ok(allRefs.length > 0, "expected at least one process.env reference");
		for (const ref of allRefs) {
			assert.ok(
				ref.startsWith("PI_SKILL_ARGUMENTS_"),
				`process.env reference must use the PI_SKILL_ARGUMENTS_ namespace, found: ${ref}`,
			);
		}
	});

	it("exports the env var name as a constant", () => {
		assert.equal(typeof ENV_SKILLS_DIR, "string");
		assert.ok(ENV_SKILLS_DIR.startsWith("PI_SKILL_ARGUMENTS_"));
	});
});
