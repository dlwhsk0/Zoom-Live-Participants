export function sendJson(response, statusCode, body) {
	response.writeHead(statusCode, { "content-type": "application/json" });
	response.end(JSON.stringify(body, null, 2));
}

export function sendHtml(response, statusCode, body) {
	response.writeHead(statusCode, {
		"content-type": "text/html; charset=utf-8",
	});
	response.end(body);
}
