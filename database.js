const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initial Default State
const defaultState = {
  users: {},        // username -> { id, username, displayName, salt, hash, avatar, bio, theme, hideLastSeen, createdAt }
  conns: [],        // [{ id, from, to, status: 'pending'|'accepted'|'declined', ts }]
  channels: [       // Default public rooms
    { id: 'general', name: 'General Lounge', description: 'Public open discussion for all users', isChannel: true, createdAt: Date.now() },
    { id: 'tech', name: 'Tech & Code', description: 'Developer talk, tips, and technology', isChannel: true, createdAt: Date.now() },
    { id: 'random', name: 'Random & Fun', description: 'Memes, music, and casual chit-chat', isChannel: true, createdAt: Date.now() }
  ],
  messages: [],     // [{ id, conversationId, from, to, body, type, mediaUrl, replyTo, reactions, edited, deleted, ts, status, pinned }]
  cleared: {}       // user_convoKey -> timestamp
};

class Database {
  constructor() {
    this.data = defaultState;
    this.saveTimeout = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          users: parsed.users || {},
          conns: parsed.conns || [],
          channels: parsed.channels || defaultState.channels,
          messages: parsed.messages || [],
          cleared: parsed.cleared || {}
        };
      } else {
        this.saveImmediately();
      }
    } catch (e) {
      console.error('Failed to load database, using defaults:', e);
      this.data = defaultState;
    }
  }

  // Debounced write-back for ultra-high throughput without disk bottleneck
  scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveImmediately();
      this.saveTimeout = null;
    }, 250);
  }

  saveImmediately() {
    try {
      const tempPath = DB_FILE + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Error persisting database:', err);
    }
  }

  // --- Password Hashing ---
  hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  // --- Users ---
  getUser(username) {
    return this.data.users[username?.toLowerCase()];
  }

  registerUser(username, password, displayName) {
    const u = username.toLowerCase().trim();
    if (this.data.users[u]) return null;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = this.hashPassword(password, salt);
    
    // Choose dynamic avatar accent color
    const colors = ['#6366f1', '#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#3b82f6'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    const user = {
      id: u,
      username: u,
      displayName: displayName?.trim() || u,
      salt,
      hash,
      avatarColor,
      bio: 'Hey there! I am using SecureChat.',
      theme: 'dark',
      hideLastSeen: false,
      createdAt: Date.now()
    };
    this.data.users[u] = user;
    this.scheduleSave();
    return this.sanitizeUser(user);
  }

  verifyUser(username, password) {
    const user = this.getUser(username);
    if (!user) return null;
    const testHash = this.hashPassword(password, user.salt);
    if (testHash === user.hash) {
      return this.sanitizeUser(user);
    }
    return null;
  }

  updateProfile(username, updates) {
    const user = this.getUser(username);
    if (!user) return null;
    if (updates.displayName !== undefined) user.displayName = updates.displayName.slice(0, 32);
    if (updates.bio !== undefined) user.bio = updates.bio.slice(0, 120);
    if (updates.theme !== undefined) user.theme = updates.theme;
    if (updates.hideLastSeen !== undefined) user.hideLastSeen = Boolean(updates.hideLastSeen);
    if (updates.avatarColor !== undefined) user.avatarColor = updates.avatarColor;
    this.scheduleSave();
    return this.sanitizeUser(user);
  }

  sanitizeUser(user) {
    if (!user) return null;
    const { salt, hash, ...safe } = user;
    return safe;
  }

  getAllUsers(excludeUsername) {
    return Object.values(this.data.users)
      .filter(u => u.username !== excludeUsername?.toLowerCase())
      .map(u => this.sanitizeUser(u));
  }

  // --- Connections (1-on-1 friend / contact status) ---
  getConnection(u1, u2) {
    const a = u1.toLowerCase(), b = u2.toLowerCase();
    return this.data.conns.find(c => 
      (c.from === a && c.to === b) || (c.from === b && c.to === a)
    );
  }

  sendConnectionRequest(from, to) {
    const a = from.toLowerCase(), b = to.toLowerCase();
    if (a === b) return null;
    let conn = this.getConnection(a, b);
    if (conn) {
      if (conn.status === 'accepted' ||
          (conn.status === 'pending' && conn.from === a)) {
        return conn;
      }
      if (conn.status === 'pending') return conn;
      conn.from = a;
      conn.to = b;
      conn.status = 'pending';
      conn.ts = Date.now();
    } else {
      conn = { id: crypto.randomUUID(), from: a, to: b, status: 'pending', ts: Date.now() };
      this.data.conns.push(conn);
    }
    this.scheduleSave();
    return conn;
  }

  respondConnectionRequest(from, to, accepted) {
    const conn = this.getConnection(from, to);
    if (!conn || conn.status !== 'pending' ||
        conn.from !== from.toLowerCase() || conn.to !== to.toLowerCase()) {
      return null;
    }
    conn.status = accepted ? 'accepted' : 'declined';
    conn.ts = Date.now();
    this.scheduleSave();
    return conn;
  }

  getConnectionsFor(username) {
    const u = username.toLowerCase();
    return this.data.conns.filter(c => c.from === u || c.to === u);
  }

  // --- Channels / Group Rooms ---
  getChannels() {
    return this.data.channels;
  }

  getChannel(channelId) {
    return this.data.channels.find(channel => channel.id === channelId) || null;
  }

  createChannel(name, description, creator) {
    const id = 'ch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const channel = {
      id,
      name: name.trim().slice(0, 30),
      description: (description || '').trim().slice(0, 100),
      isChannel: true,
      creator: creator.toLowerCase(),
      createdAt: Date.now()
    };
    this.data.channels.push(channel);
    this.scheduleSave();
    return channel;
  }

  deleteChannel(channelId, requester) {
    const channelIndex = this.data.channels.findIndex(channel => channel.id === channelId);
    if (channelIndex === -1) return null;

    const channel = this.data.channels[channelIndex];
    if (!channel.creator || channel.creator !== requester.toLowerCase()) return null;

    this.data.channels.splice(channelIndex, 1);
    this.data.messages = this.data.messages.filter(message =>
      message.channelId !== channelId && message.conversationId !== channelId
    );
    this.scheduleSave();
    return channel;
  }

  // --- Messages ---
  getConversationMessages(userOrChannel1, user2) {
    if (!user2) {
      // Channel messages
      const channelId = userOrChannel1;
      return this.data.messages.filter(m => m.conversationId === channelId);
    }
    // Direct messages
    const a = userOrChannel1.toLowerCase(), b = user2.toLowerCase();
    const convoKey = [a, b].sort().join(':');
    const clearedTs = this.data.cleared[a + '|' + convoKey] || 0;
    
    return this.data.messages.filter(m => {
      const match = (m.from === a && m.to === b) || (m.from === b && m.to === a);
      return match && m.ts > clearedTs;
    });
  }

  createMessage({ from, to, channelId, body, type = 'text', mediaUrl = null, replyTo = null }) {
    const id = crypto.randomUUID();
    const ts = Date.now();
    const conversationId = channelId ? channelId : [from.toLowerCase(), to.toLowerCase()].sort().join(':');

    const msg = {
      id,
      conversationId,
      from: from.toLowerCase(),
      to: to ? to.toLowerCase() : null,
      channelId: channelId || null,
      body: body ? body.slice(0, 5000) : '',
      type, // 'text', 'image', 'audio', 'file'
      mediaUrl,
      replyTo,
      reactions: {}, // { '👍': ['alice', 'bob'] }
      edited: false,
      deleted: false,
      status: 'sent', // 'sent', 'delivered', 'read'
      pinned: false,
      ts
    };

    this.data.messages.push(msg);
    this.scheduleSave();
    return msg;
  }

  editMessage(msgId, username, newBody) {
    const msg = this.data.messages.find(m => m.id === msgId);
    if (!msg || msg.from !== username.toLowerCase() || msg.deleted) return null;
    msg.body = newBody.slice(0, 5000);
    msg.edited = true;
    msg.editedAt = Date.now();
    this.scheduleSave();
    return msg;
  }

  deleteMessage(msgId, username) {
    const msg = this.data.messages.find(m => m.id === msgId);
    if (!msg || msg.from !== username.toLowerCase()) return null;
    msg.deleted = true;
    msg.body = '';
    msg.mediaUrl = null;
    this.scheduleSave();
    return msg;
  }

  toggleReaction(msgId, username, emoji) {
    const msg = this.data.messages.find(m => m.id === msgId);
    if (!msg || msg.deleted) return null;
    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    
    const u = username.toLowerCase();
    const idx = msg.reactions[emoji].indexOf(u);
    if (idx > -1) {
      msg.reactions[emoji].splice(idx, 1);
      if (msg.reactions[emoji].length === 0) delete msg.reactions[emoji];
    } else {
      msg.reactions[emoji].push(u);
    }
    this.scheduleSave();
    return msg;
  }

  togglePinMessage(msgId) {
    const msg = this.data.messages.find(m => m.id === msgId);
    if (!msg || msg.deleted) return null;
    msg.pinned = !msg.pinned;
    this.scheduleSave();
    return msg;
  }

  markDelivered(fromUser, toUser) {
    let changed = false;
    const a = fromUser.toLowerCase(), b = toUser.toLowerCase();
    this.data.messages.forEach(m => {
      if (m.from === a && m.to === b && m.status === 'sent') {
        m.status = 'delivered';
        changed = true;
      }
    });
    if (changed) this.scheduleSave();
  }

  markRead(peerUsername, currentUsername) {
    let changed = false;
    const peer = peerUsername.toLowerCase(), me = currentUsername.toLowerCase();
    this.data.messages.forEach(m => {
      if (m.from === peer && m.to === me && m.status !== 'read') {
        m.status = 'read';
        changed = true;
      }
    });
    if (changed) this.scheduleSave();
  }

  clearChat(username, targetId, isChannel = false) {
    const u = username.toLowerCase();
    const key = isChannel ? targetId : [u, targetId.toLowerCase()].sort().join(':');
    this.data.cleared[u + '|' + key] = Date.now();
    this.scheduleSave();
  }
}

module.exports = new Database();
