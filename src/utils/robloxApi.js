const logger = require('../utils/logger');

const API_BASE = (process.env.ROBLOX_API_BASE || 'https://users.roblox.com').replace(/\/$/, '');
const FRIENDS_BASE = 'https://friends.roblox.com/v1';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 2000;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);

      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('Retry-After') || '0');
        const delay = retryAfter > 0 ? retryAfter * 1000 : BACKOFF_BASE_MS * Math.pow(2, attempt);
        if (attempt < MAX_RETRIES) {
          logger.warn(`Roblox API rate limited (429) at ${url} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error('Roblox API rate limit exceeded (429) — max retries reached');
      }

      if (res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
          logger.warn(`Roblox API server error (${res.status}) at ${url} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Roblox API server error: HTTP ${res.status}`);
      }

      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && err.name !== 'AbortError') {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        logger.warn(`Roblox API request failed at ${url}: ${err.message} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Roblox API request failed after max retries');
}

async function getUserIdFromUsername(username) {
  const url = `${API_BASE}/v1/usernames/users`;
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });

  if (!res.ok) {
    throw new Error(`Roblox username lookup failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.data || json.data.length === 0) {
    return null;
  }

  return { id: String(json.data[0].id), username: json.data[0].name };
}

async function getFollowerCount(userId) {
  const url = `${FRIENDS_BASE}/users/${userId}/followers/count`;
  const res = await fetchWithRetry(url, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Roblox follower count failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (typeof json.count !== 'number' || json.count < 0) {
    throw new Error(`Roblox API returned invalid follower count: ${JSON.stringify(json)}`);
  }
  return json.count;
}

module.exports = { getUserIdFromUsername, getFollowerCount };
