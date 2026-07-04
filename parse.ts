export type ParseResult =
	| { kind: "skill"; name: string; args: string }
	| { kind: "passthrough"; text: string };

const SKILL_PREFIX = "/skill:";

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
