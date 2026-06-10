# FriendLink Relay Server

A lightweight WebSocket relay server for the **FriendLink** Minecraft Fabric mod.  
It handles player authentication, friend routing, and online status — entirely stateless between restarts (friends list is stored client-side).

---

## 🚀 Railway Deployment (Step-by-step)

### Prerequisites
- A GitHub account
- A [Railway](https://railway.app) account (free tier works)

### Steps

1. **Push to GitHub**

   Copy the `relay-server/` folder into a new GitHub repository (or a subdirectory of an existing one).

   ```bash
   git init
   git add .
   git commit -m "FriendLink relay server"
   git remote add origin https://github.com/YOUR_USERNAME/friendlink-relay.git
   git push -u origin main
   ```

2. **Create a Railway project**

   - Go to [railway.app](https://railway.app)
   - Click **New Project → Deploy from GitHub repo**
   - Select your repository

3. **Automatic detection**

   Railway auto-detects Node.js via `package.json` and deploys using `NIXPACKS`.  
   The `railway.json` in the repo root configures the start command and health check.

4. **Generate a public domain**

   - In Railway dashboard, open your service
   - Go to **Settings → Networking → Generate Domain**
   - Copy the domain, e.g.: `friendlink-relay.up.railway.app`

5. **Configure in Minecraft**

   - Launch Minecraft with FriendLink installed
   - Press **N** to open the FriendLink GUI → **Settings** tab
   - Paste your domain as the Relay URL:
     ```
     wss://friendlink-relay.up.railway.app
     ```
   - Click **Test Connection** — it should turn green ✅

6. **Health check endpoint**

   ```
   GET https://friendlink-relay.up.railway.app/health
   → { "status": "ok", "players": 2, "ts": 1718000000000 }
   ```

---

## 🏗 Architecture

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│  MC Client A │ ←────────────────→ │                  │
└──────────────┘                    │  FriendLink Relay │
┌──────────────┐     WebSocket      │  (Railway.app)   │
│  MC Client B │ ←────────────────→ │                  │
└──────────────┘                    └──────────────────┘
```

- **No persistent storage** — all state is in-memory, session-only
- **Friends list** stored client-side in `.minecraft/config/friendlink/friends.json`
- **Auth token** is a UUID generated once and stored in `auth.json`

---

## 📨 Protocol Messages

| Type | Direction | Description |
|------|-----------|-------------|
| `auth` | Client→Server | Authenticate with username + UUID token |
| `friend_request` | Client→Server | Send friend request to username |
| `friend_accept` | Client→Server | Accept incoming request |
| `friend_decline` | Client→Server | Decline request |
| `online_status` | Server→Client | Notify of player going online/offline |
| `sos_update` | Client→Server | Live position broadcast (500ms) |
| `sos_cancel` | Client→Server | Stop SOS broadcast |
| `coords_update` | Client→Server | Coordinate sharing (every 5s) |
| `health_update` | Client→Server | Health broadcast to friends |

---

## 🔧 Local Development

```bash
npm install
npm run dev   # uses --watch for auto-reload
```

Server will start on `http://localhost:3000`.  
Connect with `ws://localhost:3000` in the mod settings.
