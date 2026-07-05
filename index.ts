import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as pathResolve, sep } from "node:path";
import { parse, validateSkillName } from "./parse.ts";
import { resolve } from "./resolve.ts";

function isWithin(child: string, parent: string): boolean {
	const parentWithSep = parent.endsWith(sep) ? parent : parent + sep;
	return child === parent || child.startsWith(parentWithSep);
}

function readSkillContent(name: string): string | null {
	if (!validateSkillName(name)) {
		return null;
	}

	const baseDirs: string[] = [];

	const agentDir = join(homedir(), ".pi", "agent");
	baseDirs.push(join(agentDir, "skills"));
	baseDirs.push(join(homedir(), ".agents", "skills"));

	const cwd = process.cwd();
	baseDirs.push(join(cwd, ".pi", "skills"));
	baseDirs.push(join(cwd, ".agents", "skills"));

	const canonicalBases = baseDirs.map((d) => pathResolve(d));
	const forms: Array<(b: string) => string> = [
		(b) => join(b, name, "SKILL.md"),
		(b) => join(b, name + ".md"),
	];

	for (const base of canonicalBases) {
		// Resolve the base itself through the real filesystem once per base
		// dir. A symlink planted at a base-dir path would otherwise be
		// followed at `existsSync`/`readFileSync` time and let a candidate
		// pass the lexical containment check below.
		let realBase: string;
		try {
			realBase = realpathSync(base);
		} catch {
			continue;
		}

		for (const form of forms) {
			const candidate = form(base);
			const resolved = pathResolve(candidate);
			if (!isWithin(resolved, base)) {
				continue;
			}
			// Canonicalize the candidate through the real filesystem and
			// re-check containment against the real base. A symlink whose
			// real target lies outside the base dir fails this check and
			// is skipped; a dangling symlink throws and is also skipped.
			let realCandidate: string;
			try {
				realCandidate = realpathSync(resolved);
			} catch {
				continue;
			}
			if (!isWithin(realCandidate, realBase)) {
				continue;
			}
			if (existsSync(realCandidate)) {
				try {
					return readFileSync(realCandidate, "utf-8");
				} catch {
					continue;
				}
			}
		}
	}

	return null;
}

export default function (pi: ExtensionAPI) {
	pi.on("input", async (event, _ctx) => {
		if (event.source === "extension") {
			return { action: "continue" as const };
		}

		const parsed = parse(event.text);
		if (parsed.kind === "passthrough") {
			return { action: "continue" as const };
		}

		if (parsed.args.length === 0) {
			return { action: "continue" as const };
		}

		if (!validateSkillName(parsed.name)) {
			return { action: "continue" as const };
		}

		const skillContent = readSkillContent(parsed.name);
		if (skillContent === null) {
			return { action: "continue" as const };
		}

		const inlined = resolve(parsed, skillContent);
		return {
			action: "transform" as const,
			text: `/skill:${parsed.name}\n\n${inlined}`,
		};
	});
}

export { parse, validateSkillName } from "./parse.ts";
export { resolve, MARKER } from "./resolve.ts";
