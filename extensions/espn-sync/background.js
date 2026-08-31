// ⚡ Background Service Worker for ESPN Live Sync
// Manifest V3 Extension Service Worker has host permissions to talk to local loopback server (127.0.0.1:8517)
// without being blocked by Chrome's page-level Private Network Access (PNA) restrictions.

const RELAY_HOSTS = ['http://127.0.0.1:8517', 'http://localhost:8517'];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'RELAY_REQUEST') {
    return false;
  }

  const { endpoint, method = 'POST', payload = null, queryParams = null } = message;

  (async () => {
    let lastError = null;

    for (const host of RELAY_HOSTS) {
      try {
        let url = host + endpoint;
        if (queryParams) {
          const qs = new URLSearchParams(queryParams).toString();
          url += (url.includes('?') ? '&' : '?') + qs;
        }

        const options = {
          method: method,
          headers: {}
        };

        if (payload && method !== 'GET') {
          options.headers['Content-Type'] = 'application/json';
          options.body = JSON.stringify(payload);
        }

        const response = await fetch(url, options);
        if (response.ok) {
          let data = null;
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            try {
              data = await response.json();
            } catch (e) {
              data = { ok: true };
            }
          } else {
            data = { ok: true };
          }
          sendResponse({ success: true, host: host, data: data });
          return;
        } else {
          lastError = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err) {
        lastError = err.message || String(err);
      }
    }

    sendResponse({ success: false, error: lastError });
  })();

  return true; // Keep message channel open for async sendResponse
});

