import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { parse } from "./parse.ts";
import { resolve } from "./resolve.ts";

const ENV_SKILLS_DIR = "PI_SKILL_ARGUMENTS_SKILLS_DIR";

function expandHome(p: string): string {
	if (p.startsWith("~/")) {
		return join(homedir(), p.slice(2));
	}
	if (p === "~") {
		return homedir();
	}
	return p;
}

function readSkillContent(name: string): string | null {
	const candidates: string[] = [];

	const envDir = process.env[ENV_SKILLS_DIR];
	if (envDir && envDir.length > 0) {
		const absEnvDir = isAbsolute(envDir) ? envDir : expandHome(envDir);
		candidates.push(join(absEnvDir, name, "SKILL.md"));
	}

	const agentDir = join(homedir(), ".pi", "agent");
	candidates.push(join(agentDir, "skills", name, "SKILL.md"));
	candidates.push(join(agentDir, "skills", name + ".md"));
	candidates.push(join(homedir(), ".agents", "skills", name, "SKILL.md"));
	candidates.push(join(homedir(), ".agents", "skills", name + ".md"));

	const cwd = process.cwd();
	candidates.push(join(cwd, ".pi", "skills", name, "SKILL.md"));
	candidates.push(join(cwd, ".pi", "skills", name + ".md"));
	candidates.push(join(cwd, ".agents", "skills", name, "SKILL.md"));
	candidates.push(join(cwd, ".agents", "skills", name + ".md"));

	for (const path of candidates) {
		if (existsSync(path)) {
			try {
				return readFileSync(path, "utf-8");
			} catch {
				continue;
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

export { parse } from "./parse.ts";
export { resolve, MARKER } from "./resolve.ts";
export { ENV_SKILLS_DIR };
