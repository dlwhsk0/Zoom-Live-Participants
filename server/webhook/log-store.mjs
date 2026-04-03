import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export function appendWebhookLog(logPath, entry) {
	mkdirSync(dirname(logPath), { recursive: true });
	appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

export function readWebhookEvents(logPath, limit = null) {
	if (!existsSync(logPath)) {
		return [];
	}

	let lines = readFileSync(logPath, "utf8")
		.split(/\r?\n/)
		.filter(Boolean);

	if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
		lines = lines.slice(-limit);
	}

	return lines
		.map((line) => {
			try {
				return JSON.parse(line);
			} catch {
				return null;
			}
		})
		.filter(Boolean)
		.reverse();
}
