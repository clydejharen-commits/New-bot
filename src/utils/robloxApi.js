const logger = require('../utils/logger');

const API_BASE = (process.env.ROBLOX_API_BASE || 'https://users.roblox.com').replace(/\/$/, '');
const FRIENDS_BASE = 'https://friends.roblox.com/v1';

async function getUserIdFromUsername(username) {
  const url = `${API_BASE}/v1/usernames/users`;
  const res = await fetch(url, {
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
  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    throw new Error(`Roblox follower count failed: HTTP ${res.status}`);
  }

  const json = await res.json();
  return typeof json.count === 'number' ? json.count : 0;
}

module.exports = { getUserIdFromUsername, getFollowerCount };
