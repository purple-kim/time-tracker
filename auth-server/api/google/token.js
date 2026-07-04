const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body);

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

async function postGoogleToken(data) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.error_description || payload.error || "Google token request failed";
    const error = new Error(message);
    error.statusCode = response.status;
    error.googleError = payload.error || "";
    throw error;
  }

  return payload;
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    sendJson(response, 500, { error: "server_oauth_config_missing" });
    return;
  }

  try {
    const body = await readBody(request);
    const grantType = body.grantType;

    if (grantType === "authorization_code") {
      if (!body.code || !body.codeVerifier || !body.redirectUri) {
        sendJson(response, 400, { error: "authorization_code_payload_missing" });
        return;
      }

      const payload = await postGoogleToken({
        client_id: clientId,
        client_secret: clientSecret,
        code: body.code,
        code_verifier: body.codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: body.redirectUri
      });
      sendJson(response, 200, payload);
      return;
    }

    if (grantType === "refresh_token") {
      if (!body.refreshToken) {
        sendJson(response, 400, { error: "refresh_token_payload_missing" });
        return;
      }

      const payload = await postGoogleToken({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: body.refreshToken,
        grant_type: "refresh_token"
      });
      sendJson(response, 200, payload);
      return;
    }

    sendJson(response, 400, { error: "unsupported_grant_type" });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.googleError || "token_proxy_failed",
      error_description: error.message || "Token proxy failed"
    });
  }
};
