import { appConfig } from "./webhook/config.mjs";
import { createWebhookServer } from "./webhook/server-app.mjs";

const server = createWebhookServer();

server.listen(appConfig.port, () => {
	console.log(
		`Webhook server listening on http://localhost:${appConfig.port}/webhook`,
	);
});
