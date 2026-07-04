// ─── AC-1: parse contract — three discriminated cases ──────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { parse, validateSkillName } from "../parse.ts";

// ─── AC-1 case 1: /skill:<name> <args> → skill with non-empty args ─────

describe("parse — /skill:<name> <args>", () => {
	it("splits name and args with a single space separator", () => {
		const result = parse("/skill:my-skill fix the bug");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, "fix the bug");
	});

	it("preserves internal whitespace verbatim in args (single leading space trimmed)", () => {
		const result = parse("/skill:my-skill  multiple   spaces inside");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, "multiple   spaces inside");
	});

	it("preserves trailing whitespace in args", () => {
		const result = parse("/skill:my-skill args with trailing   ");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, "args with trailing   ");
	});

	it("handles a hyphenated skill name", () => {
		const result = parse("/skill:my-skill some-arg");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, "some-arg");
	});
});

// ─── AC-1 case 2: /skill:<name> (no trailing args) → skill, empty args ─

describe("parse — bare /skill:<name>", () => {
	it("returns skill with empty args when no trailing whitespace", () => {
		const result = parse("/skill:my-skill");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, "");
	});

	it("returns skill with empty args when input is exactly '/skill:<name> ' (single trailing space)", () => {
		const result = parse("/skill:my-skill ");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, "");
	});

	it("treats further trailing whitespace as args content (verbatim per AC)", () => {
		const result = parse("/skill:my-skill   ");
		assert.equal(result.kind, "skill");
		assert.equal(result.name, "my-skill");
		assert.equal(result.args, " ");
	});
});

// ─── AC-1 case 3: non-skill input → passthrough ────────────────────────

describe("parse — passthrough", () => {
	it("returns passthrough for plain text", () => {
		const result = parse("hello world");
		assert.equal(result.kind, "passthrough");
		assert.equal(result.text, "hello world");
	});

	it("returns passthrough for empty input", () => {
		const result = parse("");
		assert.equal(result.kind, "passthrough");
		assert.equal(result.text, "");
	});

	it("returns passthrough for a slash command other than /skill:", () => {
		const result = parse("/help me");
		assert.equal(result.kind, "passthrough");
		assert.equal(result.text, "/help me");
	});

	it("returns passthrough for /skill: with no name", () => {
		const result = parse("/skill: fix the bug");
		assert.equal(result.kind, "passthrough");
		assert.equal(result.text, "/skill: fix the bug");
	});

	it("returns passthrough for the bare /skill: prefix", () => {
		const result = parse("/skill:");
		assert.equal(result.kind, "passthrough");
		assert.equal(result.text, "/skill:");
	});

	it("returns passthrough for /skill without colon", () => {
		const result = parse("/skill foo");
		assert.equal(result.kind, "passthrough");
		assert.equal(result.text, "/skill foo");
	});
});

// ─── AC-1: validateSkillName unit tests ──────────────────────────────

describe("validateSkillName", () => {
	it("accepts a single lowercase letter", () => {
		assert.equal(validateSkillName("a"), true);
	});

	it("accepts a lowercase alphanumeric hyphenated name", () => {
		assert.equal(validateSkillName("my-skill"), true);
	});

	it("accepts multiple internal hyphens", () => {
		assert.equal(validateSkillName("a-b-c"), true);
	});

	it("accepts a name with digits", () => {
		assert.equal(validateSkillName("skill123"), true);
	});

	it("accepts a name of length 64 (boundary)", () => {
		assert.equal(validateSkillName("a".repeat(64)), true);
	});

	it("rejects bare '..' (path traversal)", () => {
		assert.equal(validateSkillName(".."), false);
	});

	it("rejects a name containing '..' (path traversal)", () => {
		assert.equal(validateSkillName("../x"), false);
	});

	it("rejects an absolute path", () => {
		assert.equal(validateSkillName("/etc/passwd"), false);
	});

	it("rejects consecutive hyphens", () => {
		assert.equal(validateSkillName("foo--bar"), false);
	});

	it("rejects a leading hyphen", () => {
		assert.equal(validateSkillName("-foo"), false);
	});

	it("rejects a trailing hyphen", () => {
		assert.equal(validateSkillName("foo-"), false);
	});

	it("rejects uppercase letters", () => {
		assert.equal(validateSkillName("Foo"), false);
	});

	it("rejects a name containing whitespace", () => {
		assert.equal(validateSkillName("foo bar"), false);
	});

	it("rejects an empty string", () => {
		assert.equal(validateSkillName(""), false);
	});

	it("rejects a name of length 65 (over the cap)", () => {
		assert.equal(validateSkillName("a".repeat(65)), false);
	});
});

// ─── AC-4: purity contract — parse.ts has no impure imports ────────────

describe("parse.ts purity", () => {
	const source = readFileSync(
		pathResolve(import.meta.dirname ?? __dirname, "../parse.ts"),
		"utf-8",
	);

	it("does not import node:fs", () => {
		assert.equal(/from\s+["']node:fs["']/.test(source), false);
		assert.equal(/require\(["']node:fs["']\)/.test(source), false);
	});

	it("does not import node:path", () => {
		assert.equal(/from\s+["']node:path["']/.test(source), false);
		assert.equal(/require\(["']node:path["']\)/.test(source), false);
	});

	it("does not import node:os", () => {
		assert.equal(/from\s+["']node:os["']/.test(source), false);
		assert.equal(/require\(["']node:os["']\)/.test(source), false);
	});

	it("does not reference process.*", () => {
		assert.equal(/\bprocess\./.test(source), false);
	});
});
