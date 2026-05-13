let CookieManager = null;

try {
  CookieManager = require('@react-native-cookies/cookies').default;
} catch {}

export async function getNativeCookies(url) {
  if (!CookieManager) return null;
  try {
    const cookies = await CookieManager.get(url);
    const entries = Object.entries(cookies || {});
    if (entries.length === 0) return null;
    return entries.map(([name, c]) => `${name}=${c.value}`).join('; ');
  } catch {
    return null;
  }
}
