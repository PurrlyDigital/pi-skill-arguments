export const MARKER = "--- user input ---";

export interface ResolveInput {
	readonly kind: "skill";
	readonly name: string;
	readonly args: string;
}

export function resolve(parsed: ResolveInput, skillContent: string): string {
	if (parsed.kind !== "skill") {
		throw new Error("resolve: parsed input must be kind=skill");
	}
	if (typeof skillContent !== "string") {
		throw new Error("resolve: skillContent must be a string");
	}

	if (parsed.args.length === 0) {
		return skillContent;
	}

	return `${skillContent}\n\n${MARKER}\n${parsed.args}`;
}
