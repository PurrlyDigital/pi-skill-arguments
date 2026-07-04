export type ParseResult =
	| { kind: "skill"; name: string; args: string }
	| { kind: "passthrough"; text: string };

const SKILL_PREFIX = "/skill:";

// Pure skill-name validator per the documented rules in the Agent Skills
// specification (1-64 chars; lowercase a-z, 0-9, hyphens; no leading,
// trailing, or consecutive hyphens). Rejects path-traversal characters
// (".", "/", "\"), absolute paths, and whitespace in a single stroke.
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/;
const SKILL_NAME_MAX_LENGTH = 64;

export function validateSkillName(name: string): boolean {
	if (typeof name !== "string") return false;
	if (name.length === 0 || name.length > SKILL_NAME_MAX_LENGTH) return false;
	return SKILL_NAME_PATTERN.test(name);
}

export function parse(input: string): ParseResult {
	if (typeof input !== "string") {
		return { kind: "passthrough", text: String(input) };
	}

	if (!input.startsWith(SKILL_PREFIX)) {
		return { kind: "passthrough", text: input };
	}

	const rest = input.slice(SKILL_PREFIX.length);
	if (rest.length === 0) {
		return { kind: "passthrough", text: input };
	}

	const spaceIdx = rest.indexOf(" ");
	if (spaceIdx === -1) {
		const name = rest;
		if (name.length === 0) {
			return { kind: "passthrough", text: input };
		}
		return { kind: "skill", name, args: "" };
	}

	const name = rest.slice(0, spaceIdx);
	if (name.length === 0) {
		return { kind: "passthrough", text: input };
	}

	const afterSpace = rest.slice(spaceIdx + 1);
	const args = afterSpace.startsWith(" ") ? afterSpace.slice(1) : afterSpace;
	return { kind: "skill", name, args };
}
