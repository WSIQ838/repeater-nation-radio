// Bootstrap values for the client. After a social sign-in the server redirects back with
// ?access_token=...; it is moved into localStorage and removed from the address bar.
export const TOKEN_KEY = 'rn_access_token';

function bootstrap() {
  const out = { appId: import.meta.env.VITE_APP_ID || '', token: null, fromUrl: window.location.href, functionsVersion: undefined, appBaseUrl: '' };
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('clear_access_token') === 'true') localStorage.removeItem(TOKEN_KEY);
    const fromUrl = url.searchParams.get('access_token');
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      url.searchParams.delete('access_token');
      window.history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash);
    }
    out.token = localStorage.getItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
  return out;
}

export const appParams = bootstrap();
