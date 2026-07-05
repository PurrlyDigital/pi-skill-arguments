import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
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
		for (const form of forms) {
			const candidate = form(base);
			const resolved = pathResolve(candidate);
			if (!isWithin(resolved, base)) {
				continue;
			}
			if (existsSync(resolved)) {
				try {
					return readFileSync(resolved, "utf-8");
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
