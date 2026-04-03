import { createHmac } from "node:crypto";

export function verifySignature(secretToken, headers, rawBody) {
	if (!secretToken) {
		return { ok: true, reason: "secret token not configured" };
	}

	const signature = headers["x-zm-signature"];
	const timestamp = headers["x-zm-request-timestamp"];

	if (!signature || !timestamp) {
		return { ok: false, reason: "missing signature headers" };
	}

	const message = `v0:${timestamp}:${rawBody}`;
	const expected = `v0=${createHmac("sha256", secretToken).update(message).digest("hex")}`;

	return {
		ok: signature === expected,
		reason: signature === expected ? "verified" : "signature mismatch",
	};
}

export function buildEndpointValidation(secretToken, plainToken) {
	return {
		plainToken,
		encryptedToken: createHmac("sha256", secretToken)
			.update(plainToken)
			.digest("hex"),
	};
}
