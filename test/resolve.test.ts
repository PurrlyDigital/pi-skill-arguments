// ─── AC-2: resolve contract — empty-args unchanged, non-empty-args inlined ─

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { resolve, MARKER } from "../resolve.ts";

const skillContent = `---
name: sample-skill
description: A sample skill for tests.
---

# Sample Skill

Do the thing.
`;

describe("resolve — empty-args case", () => {
	it("returns skill content unchanged when args is empty", () => {
		const result = resolve(
			{ kind: "skill", name: "sample-skill", args: "" },
			skillContent,
		);
		assert.equal(result, skillContent);
	});

	it("does not include the marker when args is empty", () => {
		const result = resolve(
			{ kind: "skill", name: "sample-skill", args: "" },
			skillContent,
		);
		assert.equal(result.includes(MARKER), false);
	});
});

describe("resolve — non-empty-args case", () => {
	it("appends the marker and args after a blank line", () => {
		const result = resolve(
			{ kind: "skill", name: "sample-skill", args: "fix the bug" },
			skillContent,
		);
		const expected = `${skillContent}\n\n${MARKER}\nfix the bug`;
		assert.equal(result, expected);
	});

	it("includes the marker constant in the output", () => {
		const result = resolve(
			{ kind: "skill", name: "sample-skill", args: "any args" },
			skillContent,
		);
		assert.ok(result.includes(MARKER), "marker must appear in the inlined block");
	});

	it("preserves multi-word args verbatim", () => {
		const result = resolve(
			{ kind: "skill", name: "sample-skill", args: "fix the bug, please" },
			skillContent,
		);
		assert.ok(result.endsWith("fix the bug, please"));
	});

	it("emits the skill content first, then the marker, then the args", () => {
		const result = resolve(
			{ kind: "skill", name: "sample-skill", args: "ARGS" },
			skillContent,
		);
		const markerIdx = result.indexOf(MARKER);
		const argsIdx = result.indexOf("ARGS");
		assert.ok(markerIdx > 0);
		assert.ok(argsIdx > markerIdx);
	});
});

describe("MARKER constant", () => {
	it("is a non-empty string", () => {
		assert.equal(typeof MARKER, "string");
		assert.ok(MARKER.length > 0);
	});
});

// ─── AC-4: purity contract — resolve.ts has no impure imports ──────────

describe("resolve.ts purity", () => {
	const source = readFileSync(
		pathResolve(import.meta.dirname ?? __dirname, "../resolve.ts"),
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
