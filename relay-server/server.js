// FILE: relay-server/server.js
'use strict';

const http      = require('http');
const express   = require('express');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ── In-memory store ─────────────────────────────────────────────────────────
// token → { username, ws, friends: Set<token> }
const connectedPlayers = new Map();
// username → token  (for reverse lookup)
const usernameToToken = new Map();

// ── Express HTTP app ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', players: connectedPlayers.size, ts: Date.now() });
});

const server = http.createServer(app);

// ── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

function log(msg) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${msg}`);
}

function send(ws, obj) {
    if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify(obj)); } catch (e) {}
    }
}

function broadcastToFriends(fromToken, obj, includeSelf = false) {
    const player = connectedPlayers.get(fromToken);
    if (!player) return;
    for (const friendToken of player.friends) {
        const friend = connectedPlayers.get(friendToken);
        if (friend) send(friend.ws, obj);
    }
    if (includeSelf) send(player.ws, obj);
}

// Build mutual friendship map when both sides authenticate
function rebuildFriends(token) {
    // Friends are determined by who is online — in this simple relay,
    // we treat "anyone online with the same token in their friend list" as friends.
    // In practice the client sends friend_request/accept; we track accepted pairs.
    // For simplicity: mark all online players as potential recipients of routed messages.
    // The actual friendship filtering is done client-side via friend list.
    // The relay routes only if the recipient is online.
}

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    log(`New connection from ${ip}`);

    let playerToken   = null;
    let playerUsername = null;
    let authTimeout   = null;

    // Require auth within 5 seconds
    authTimeout = setTimeout(() => {
        if (!playerToken) {
            log(`No auth received from ${ip}, closing.`);
            ws.close(4001, 'Auth timeout');
        }
    }, 5000);

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); }
        catch (e) { return; }

        const type = msg.type;

        // ── Auth ──────────────────────────────────────────────────────────────
        if (type === 'auth') {
            if (playerToken) return; // already authed

            const { username, token } = msg;
            if (!username || !token) { ws.close(4002, 'Invalid auth'); return; }

            // Kick old session for same token
            if (connectedPlayers.has(token)) {
                const old = connectedPlayers.get(token);
                old.ws.close(4003, 'New session opened');
            }

            playerToken    = token;
            playerUsername = username;

            clearTimeout(authTimeout);
            connectedPlayers.set(token, { username, ws, friends: new Set() });
            usernameToToken.set(username, token);

            log(`Authenticated: ${username} (${token.substring(0, 8)}...)`);

            // Notify all online players that this player came online
            // (the client will filter by their own friends list)
            const onlineMsg = { type: 'online_status', username, online: true };
            for (const [t, p] of connectedPlayers) {
                if (t !== token) {
                    send(p.ws, onlineMsg);
                    // Also tell this player about existing online players
                    send(ws, { type: 'online_status', username: p.username, online: true });
                }
            }
            return;
        }

        // All other message types require auth
        if (!playerToken) return;

        switch (type) {
            case 'friend_request': {
                const toToken = usernameToToken.get(msg.to);
                if (toToken) {
                    const target = connectedPlayers.get(toToken);
                    if (target) send(target.ws, { type: 'friend_request', from: playerUsername });
                }
                break;
            }
            case 'friend_accept': {
                const toToken = usernameToToken.get(msg.to);
                if (toToken) {
                    const target = connectedPlayers.get(toToken);
                    if (target) {
                        send(target.ws, { type: 'friend_accept', from: playerUsername });
                        // Establish mutual friendship in relay routing
                        const me = connectedPlayers.get(playerToken);
                        if (me) me.friends.add(toToken);
                        target.friends.add(playerToken);
                    }
                }
                break;
            }
            case 'friend_decline': {
                const toToken = usernameToToken.get(msg.to);
                if (toToken) {
                    const target = connectedPlayers.get(toToken);
                    if (target) send(target.ws, { type: 'friend_decline', from: playerUsername });
                }
                break;
            }
            case 'sos_update': {
                // Broadcast to all online friends
                const player = connectedPlayers.get(playerToken);
                if (!player) break;
                const payload = {
                    type: 'sos_update',
                    from: playerUsername,
                    x: msg.x, y: msg.y, z: msg.z,
                    server: msg.server,
                    dimension: msg.dimension
                };
                for (const [t, p] of connectedPlayers) {
                    if (t !== playerToken && p.friends.has(playerToken)) {
                        send(p.ws, payload);
                    }
                }
                break;
            }
            case 'sos_cancel': {
                const player = connectedPlayers.get(playerToken);
                if (!player) break;
                for (const [t, p] of connectedPlayers) {
                    if (t !== playerToken && p.friends.has(playerToken)) {
                        send(p.ws, { type: 'sos_cancel', from: playerUsername });
                    }
                }
                break;
            }
            case 'coords_update': {
                const player = connectedPlayers.get(playerToken);
                if (!player) break;
                const payload = {
                    type: 'coords_update',
                    from: playerUsername,
                    x: msg.x, y: msg.y, z: msg.z,
                    dimension: msg.dimension
                };
                for (const [t, p] of connectedPlayers) {
                    if (t !== playerToken && p.friends.has(playerToken)) {
                        send(p.ws, payload);
                    }
                }
                break;
            }
            case 'health_update': {
                const player = connectedPlayers.get(playerToken);
                if (!player) break;
                const payload = {
                    type: 'health_update',
                    from: playerUsername,
                    hp: msg.hp,
                    maxHp: msg.maxHp
                };
                for (const [t, p] of connectedPlayers) {
                    if (t !== playerToken && p.friends.has(playerToken)) {
                        send(p.ws, payload);
                    }
                }
                break;
            }
            case 'pong': {
                // Client pong received; update last-seen (implicit via message)
                break;
            }
            default:
                // Unknown type — ignore silently
                break;
        }
    });

    ws.on('close', () => {
        if (playerToken) {
            connectedPlayers.delete(playerToken);
            if (playerUsername) usernameToToken.delete(playerUsername);
            log(`Disconnected: ${playerUsername}`);

            // Notify friends of offline status
            for (const [t, p] of connectedPlayers) {
                send(p.ws, { type: 'online_status', username: playerUsername, online: false });
            }
        }
    });

    ws.on('error', (err) => {
        log(`WebSocket error for ${playerUsername || ip}: ${err.message}`);
    });
});

// ── Server startup ────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    log(`FriendLink relay server listening on port ${PORT}`);
});

// ── Graceful shutdown (Railway sends SIGTERM on redeploy) ─────────────────────
function shutdown() {
    log('Shutting down gracefully...');
    // Close all WebSocket connections
    for (const [, player] of connectedPlayers) {
        player.ws.close(1001, 'Server shutting down');
    }
    server.close(() => {
        log('HTTP server closed.');
        process.exit(0);
    });
    // Force exit after 5 s if not closed cleanly
    setTimeout(() => process.exit(0), 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
