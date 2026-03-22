import { getAccessToken } from "./lib/zoom.mjs";

try {
  const token = await getAccessToken();

  console.log(JSON.stringify({
    token_type: token.token_type,
    scope: token.scope,
    expires_in: token.expires_in,
    access_token_preview: `${token.access_token.slice(0, 12)}...`
  }, null, 2));
} catch (error) {
  console.error("Failed to get access token.");
  if (error.status) {
    console.error(`status: ${error.status}`);
  }
  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
}
