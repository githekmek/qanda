// Loaded ONLY by the integration test child process via --import.
// Application code always calls Resend's fixed HTTPS endpoint.
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (url === "https://api.resend.com/emails") {
    if (!process.env.TEST_MAIL_URL?.startsWith("http://127.0.0.1:")) throw new Error("Missing isolated mail collector");
    return originalFetch(process.env.TEST_MAIL_URL, options);
  }
  return originalFetch(url, options);
};
