# New Bot

A Discord bot featuring a **Roblox Followers Tracking System**.

## Features

- `/Track <Roblox username> <milestone>` — Admin-only. Start tracking a Roblox user's followers up to a milestone.
- `w! Track stop` — Admin-only prefix command. Stops the active tracker.
- `/setup` — Opens a setup dashboard with **Tracker Settings** to configure the tracking channel and ping role/user.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DISCORD_TOKEN` — your bot token
   - `MONGO_URI` — your MongoDB connection string
   - `GUILD_ID` — your Discord server ID (for fast slash command registration)
   - `CLIENT_ID` — your bot application ID
3. Register slash commands: `npm run deploy`
4. Start the bot: `npm start`

## Tracking Logic

- Checks the Roblox follower count every 1 minute.
- Calculates followers/minute, followers/hour, and followers/day from the recorded data points.
- Sends a milestone notification with the ping and stats when the target is reached.
- Tracker state is persisted in MongoDB and restored on bot restart.
