const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static directories
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(PUBLIC_DIR));

// In-memory active sockets map: username -> Set of WebSocket instances (handles multiple tabs/devices per user)
const clients = new Map();
// Presence store: username -> { status: 'online'|'idle'|'offline', lastSeen: timestamp }
const presenceStore = new Map();

// Generate simple auth token
function generateToken(username) {
  return Buffer.from(`${username}:${Date.now()}:${Math.random().toString(36)}`).toString('base64');
}

// Active session token store: token -> username
const activeSessions = new Map();

// Helper to authenticate request via Bearer token
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  const username = activeSessions.get(token);
  if (!username) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  }
  req.user = db.getUser(username);
  if (!req.user) return res.status(401).json({ error: 'User not found' });
  next();
}

// Broadcast WebSocket message to a specific user (all their active connections)
function sendToUser(username, payload) {
  const userSockets = clients.get(username.toLowerCase());
  if (!userSockets) return false;
  const msgStr = JSON.stringify(payload);
  userSockets.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msgStr);
    }
  });
  return true;
}

// Broadcast to all connected clients
function broadcastAll(payload, excludeWs = null) {
  const msgStr = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(msgStr);
    }
  });
}

// Update presence and notify peers
function setPresence(username, status) {
  const u = username.toLowerCase();
  presenceStore.set(u, {
    status,
    lastSeen: Date.now()
  });
  broadcastAll({
    type: 'presence_update',
    username: u,
    status,
    lastSeen: Date.now()
  });
}

// REST API ROUTES
app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-20 letters, numbers, or underscores' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = db.getUser(username);
  if (existing) {
    return res.status(409).json({ error: 'Username is already taken' });
  }

  const user = db.registerUser(username, password, displayName);
  const token = generateToken(user.username);
  activeSessions.set(token, user.username);

  res.status(201).json({ user, token });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.verifyUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken(user.username);
  activeSessions.set(token, user.username);

  res.json({ user, token });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: db.sanitizeUser(req.user) });
});

app.post('/api/user/profile', authMiddleware, (req, res) => {
  const updated = db.updateProfile(req.user.username, req.body);
  res.json({ user: updated });
});

app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.getAllUsers(req.user.username);
  const conns = db.getConnectionsFor(req.user.username);
  
  // Attach presence information
  const enriched = users.map(u => {
    const pres = presenceStore.get(u.username) || { status: 'offline', lastSeen: null };
    const conn = conns.find(c => c.from === u.username || c.to === u.username);
    return {
      ...u,
      online: pres.status === 'online',
      presence: u.hideLastSeen ? { status: 'offline', lastSeen: null } : pres,
      connection: conn || null
    };
  });

  res.json({ users: enriched });
});

app.get('/api/channels', authMiddleware, (req, res) => {
  const channels = db.getChannels();
  res.json({ channels });
});

app.post('/api/channels', authMiddleware, (req, res) => {
  const { name, description } = req.body;
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Channel name is required' });
  }
  const channel = db.createChannel(name, description, req.user.username);
  broadcastAll({ type: 'channel_created', channel });
  res.status(201).json({ channel });
});

app.delete('/api/channels/:channelId', authMiddleware, (req, res) => {
  const channel = db.getChannel(req.params.channelId);
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const deletedChannel = db.deleteChannel(channel.id, req.user.username);
  if (!deletedChannel) {
    return res.status(403).json({ error: 'Only the channel creator can delete this channel' });
  }

  broadcastAll({ type: 'channel_deleted', channelId: channel.id });
  res.json({ channelId: channel.id });
});

app.get('/api/messages', authMiddleware, (req, res) => {
  const { peer, channelId } = req.query;
  if (channelId) {
    if (!db.getChannel(channelId)) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    const messages = db.getConversationMessages(channelId);
    return res.json({ messages });
  }
  if (peer) {
    const messages = db.getConversationMessages(req.user.username, peer);
    // Mark incoming messages as read
    db.markRead(peer, req.user.username);
    sendToUser(peer, { type: 'messages_read', by: req.user.username });
    return res.json({ messages });
  }
  res.status(400).json({ error: 'Peer or channelId required' });
});

// File / Voice memo upload endpoint (supports audio recordings, images, documents)
app.post('/api/upload', authMiddleware, (req, res) => {
  try {
    const { filename, fileData, mimeType, type } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'No file data received' });
    }

    // Clean base64 header if present
    const base64Data = fileData.replace(/^data:([A-Za-z-+/]+);base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const ext = path.extname(filename || '') || (type === 'audio' ? '.webm' : '.png');
    const safeName = `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
    const filePath = path.join(UPLOADS_DIR, safeName);

    fs.writeFileSync(filePath, buffer);
    const mediaUrl = `/uploads/${safeName}`;

    res.json({ mediaUrl, filename: safeName, size: buffer.length, type });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process file upload' });
  }
});

// WEBSOCKET REAL-TIME SERVER
wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', (messageRaw) => {
    try {
      const data = JSON.parse(messageRaw);

      switch (data.type) {
        // Handshake & Authentication
        case 'auth': {
          const username = activeSessions.get(data.token);
          if (!username) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid authentication token' }));
            return;
          }
          currentUser = username.toLowerCase();
          ws.username = currentUser;

          if (!clients.has(currentUser)) {
            clients.set(currentUser, new Set());
          }
          clients.get(currentUser).add(ws);

          setPresence(currentUser, 'online');
          ws.send(JSON.stringify({ type: 'authenticated', username: currentUser }));

          // Mark delivered messages sent to this user
          const allConns = db.getConnectionsFor(currentUser);
          allConns.forEach(c => {
            const peer = c.from === currentUser ? c.to : c.from;
            db.markDelivered(peer, currentUser);
            sendToUser(peer, { type: 'messages_delivered', to: currentUser });
          });
          break;
        }

        // Heartbeat keep-alive
        case 'heartbeat': {
          if (currentUser) {
            setPresence(currentUser, 'online');
          }
          break;
        }

        // Send chat message
        case 'chat_message': {
          if (!currentUser) return;
          const { to, channelId, body, mediaUrl, messageType, replyTo } = data;

          if (channelId && !db.getChannel(channelId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'This channel is no longer available.' }));
            return;
          }

          // Permission check for direct messages
          if (to) {
            const conn = db.getConnection(currentUser, to);
            if (!conn || conn.status !== 'accepted') {
              ws.send(JSON.stringify({ type: 'error', message: 'You must connect with user before messaging.' }));
              return;
            }
          }

          const msg = db.createMessage({
            from: currentUser,
            to: to || null,
            channelId: channelId || null,
            body,
            type: messageType || (mediaUrl ? (data.isAudio ? 'audio' : 'image') : 'text'),
            mediaUrl: mediaUrl || null,
            replyTo: replyTo || null
          });

          // Check if peer is online to set status
          if (to) {
            const isPeerOnline = clients.has(to.toLowerCase()) && clients.get(to.toLowerCase()).size > 0;
            if (isPeerOnline) {
              msg.status = 'delivered';
              db.markDelivered(currentUser, to);
            }
            // Deliver to recipient
            sendToUser(to, { type: 'new_message', message: msg });
            // Echo back to sender's devices
            sendToUser(currentUser, { type: 'new_message', message: msg });
          } else if (channelId) {
            // Broadcast to all connected clients
            broadcastAll({ type: 'new_message', message: msg });
          }
          break;
        }

        // Typing indicator
        case 'typing': {
          if (!currentUser) return;
          const { to, channelId, isTyping } = data;
          if (to) {
            sendToUser(to, { type: 'typing', from: currentUser, isTyping });
          } else if (channelId) {
            broadcastAll({ type: 'typing', from: currentUser, channelId, isTyping }, ws);
          }
          break;
        }

        // Mark messages read
        case 'mark_read': {
          if (!currentUser || !data.peer) return;
          db.markRead(data.peer, currentUser);
          sendToUser(data.peer, { type: 'messages_read', by: currentUser });
          break;
        }

        // Emoji Reaction
        case 'toggle_reaction': {
          if (!currentUser || !data.msgId || !data.emoji) return;
          const updated = db.toggleReaction(data.msgId, currentUser, data.emoji);
          if (updated) {
            const payload = { type: 'message_updated', message: updated };
            if (updated.to) {
              sendToUser(updated.from, payload);
              sendToUser(updated.to, payload);
            } else if (updated.channelId) {
              broadcastAll(payload);
            }
          }
          break;
        }

        // Edit message
        case 'edit_message': {
          if (!currentUser || !data.msgId || !data.body) return;
          const updated = db.editMessage(data.msgId, currentUser, data.body);
          if (updated) {
            const payload = { type: 'message_updated', message: updated };
            if (updated.to) {
              sendToUser(updated.from, payload);
              sendToUser(updated.to, payload);
            } else if (updated.channelId) {
              broadcastAll(payload);
            }
          }
          break;
        }

        // Delete message
        case 'delete_message': {
          if (!currentUser || !data.msgId) return;
          const updated = db.deleteMessage(data.msgId, currentUser);
          if (updated) {
            const payload = { type: 'message_updated', message: updated };
            if (updated.to) {
              sendToUser(updated.from, payload);
              sendToUser(updated.to, payload);
            } else if (updated.channelId) {
              broadcastAll(payload);
            }
          }
          break;
        }

        // Pin message
        case 'pin_message': {
          if (!currentUser || !data.msgId) return;
          const updated = db.togglePinMessage(data.msgId);
          if (updated) {
            const payload = { type: 'message_updated', message: updated };
            if (updated.to) {
              sendToUser(updated.from, payload);
              sendToUser(updated.to, payload);
            } else if (updated.channelId) {
              broadcastAll(payload);
            }
          }
          break;
        }

        // Connection request
        case 'conn_request': {
          if (!currentUser || !data.to) return;
          const conn = db.sendConnectionRequest(currentUser, data.to);
          if (conn) {
            sendToUser(data.to, { type: 'conn_received', conn });
            sendToUser(currentUser, { type: 'conn_updated', conn });
          }
          break;
        }

        // Connection respond
        case 'conn_respond': {
          if (!currentUser || !data.from) return;
          const conn = db.respondConnectionRequest(data.from, currentUser, data.accepted);
          if (conn) {
            sendToUser(data.from, { type: 'conn_updated', conn });
            sendToUser(currentUser, { type: 'conn_updated', conn });
          }
          break;
        }

        // WebRTC 1-on-1 Audio/Video Call Signaling
        case 'call_signal': {
          if (!currentUser || !data.to) return;
          sendToUser(data.to, {
            type: 'call_signal',
            from: currentUser,
            signalType: data.signalType, // 'offer', 'answer', 'ice_candidate', 'call_init', 'call_ended', 'call_rejected'
            payload: data.payload,
            isVideo: data.isVideo
          });
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    if (currentUser && clients.has(currentUser)) {
      const userSockets = clients.get(currentUser);
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        clients.delete(currentUser);
        setPresence(currentUser, 'offline');
      }
    }
  });
});

// Periodic connection health sweep
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

// Root fallback to frontend
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  SecureChat Pro Server running on port ${PORT}`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
