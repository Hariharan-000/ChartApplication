/**
 * SecureChat Pro - Advanced Realtime Messenger Client Engine
 * High-performance WebSocket communication, WebRTC Calling, Audio Waveforms, and Rich Micro-Animations
 */

(function () {
  'use strict';

  // --- APPLICATION STATE ---
  const state = {
    token: localStorage.getItem('sc_token') || null,
    user: null,
    activeTab: 'direct', // 'direct' | 'channels'
    activeTarget: null,  // { type: 'direct'|'channel', id: string, name: string, status: string, peerUser?: object }
    users: [],
    channels: [],
    messages: [],
    replyTo: null,
    searchQuery: '',
    soundEnabled: localStorage.getItem('sc_sound') !== 'false',
    ws: null,
    reconnectTimer: null,
    typingTimeout: null,
    isTypingSent: false,
    // Voice recording
    mediaRecorder: null,
    audioChunks: [],
    recordStartTime: 0,
    recordTimerInterval: null,
    // WebRTC Calling
    peerConnection: null,
    localStream: null,
    callActive: false,
    activeCallPeer: null,
    activeCallIsVideo: false,
    remoteCallStream: null,
    ringtoneOsc: null
  };
  const pendingConnectionActions = new Set();

  // --- DOM SELECTORS ---
  const $ = (id) => document.getElementById(id);
  const elements = {
    authWrapper: $('authWrapper'),
    authCard: $('authCard'),
    authTitle: $('authTitle'),
    authSubtitle: $('authSubtitle'),
    authError: $('authError'),
    authForm: $('authForm'),
    groupDisplayName: $('groupDisplayName'),
    regDisplayName: $('regDisplayName'),
    authUsername: $('authUsername'),
    authPassword: $('authPassword'),
    btnAuthSubmit: $('btnAuthSubmit'),
    btnAuthText: $('btnAuthText'),
    authTogglePrompt: $('authTogglePrompt'),
    btnToggleAuthMode: $('btnToggleAuthMode'),

    appContainer: $('appContainer'),
    sidebar: $('sidebar'),
    myAvatar: $('myAvatar'),
    myDisplayName: $('myDisplayName'),
    myStatusBio: $('myStatusBio'),
    btnOpenProfile: $('btnOpenProfile'),
    btnNewChannel: $('btnNewChannel'),
    btnSettings: $('btnSettings'),
    btnLogout: $('btnLogout'),
    sidebarSearch: $('sidebarSearch'),
    tabDirect: $('tabDirect'),
    tabChannels: $('tabChannels'),
    conversationsList: $('conversationsList'),

    chatWorkspace: $('chatWorkspace'),
    btnBackToSidebar: $('btnBackToSidebar'),
    targetAvatar: $('targetAvatar'),
    targetName: $('targetName'),
    targetStatus: $('targetStatus'),
    chatHeaderActions: $('chatHeaderActions'),
    chatSearchInput: $('chatSearchInput'),
    searchSuggestions: $('searchSuggestions'),
    btnStartAudioCall: $('btnStartAudioCall'),
    btnStartVideoCall: $('btnStartVideoCall'),
    btnClearChat: $('btnClearChat'),

    searchChipsBar: $('searchChipsBar'),
    chipsContainer: $('chipsContainer'),
    searchMatchCount: $('searchMatchCount'),

    pinnedBanner: $('pinnedBanner'),
    pinnedBannerText: $('pinnedBannerText'),
    btnUnpinBanner: $('btnUnpinBanner'),

    messagesContainer: $('messagesContainer'),
    btnJumpBottom: $('btnJumpBottom'),
    typingIndicator: $('typingIndicator'),
    typingUserText: $('typingUserText'),

    replyBanner: $('replyBanner'),
    replyBannerText: $('replyBannerText'),
    btnCancelReply: $('btnCancelReply'),

    chatInputArea: $('chatInputArea'),
    fileInput: $('fileInput'),
    btnAttachFile: $('btnAttachFile'),
    btnToggleEmoji: $('btnToggleEmoji'),
    messageInput: $('messageInput'),
    btnMicRecord: $('btnMicRecord'),
    btnSendMessage: $('btnSendMessage'),
    emojiPopover: $('emojiPopover'),

    recordingBar: $('recordingBar'),
    recTimer: $('recTimer'),
    btnCancelRecord: $('btnCancelRecord'),
    btnSendRecord: $('btnSendRecord'),

    profileModal: $('profileModal'),
    btnCloseProfile: $('btnCloseProfile'),
    profileDisplayName: $('profileDisplayName'),
    profileBio: $('profileBio'),
    themeSelect: $('themeSelect'),
    chkHideLastSeen: $('chkHideLastSeen'),
    chkSoundEffects: $('chkSoundEffects'),
    btnSaveProfile: $('btnSaveProfile'),

    channelModal: $('channelModal'),
    btnCloseChannel: $('btnCloseChannel'),
    channelName: $('channelName'),
    channelDesc: $('channelDesc'),
    btnSubmitChannel: $('btnSubmitChannel'),

    callModal: $('callModal'),
    callTitle: $('callTitle'),
    callStatusBadge: $('callStatusBadge'),
    callAudioPulseView: $('callAudioPulseView'),
    callAvatar: $('callAvatar'),
    callPeerName: $('callPeerName'),
    callStateLabel: $('callStateLabel'),
    callVideoView: $('callVideoView'),
    remoteVideo: $('remoteVideo'),
    remoteAudio: $('remoteAudio'),
    btnEnableCallAudio: $('btnEnableCallAudio'),
    localVideo: $('localVideo'),
    incomingControls: $('incomingControls'),
    activeControls: $('activeControls'),
    btnAcceptCall: $('btnAcceptCall'),
    btnRejectCall: $('btnRejectCall'),
    btnToggleMic: $('btnToggleMic'),
    btnToggleCam: $('btnToggleCam'),
    btnEndCall: $('btnEndCall'),

    lightboxModal: $('lightboxModal'),
    lightboxImg: $('lightboxImg')
  };

  // --- AUDIO SYNTHESIZER (ZERO-DEPENDENCY WEB AUDIO API) ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === 'send') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'receive') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
      } else if (type === 'hangup') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.21);
      }
    } catch (e) {
      console.warn('Audio synthesis note:', e);
    }
  }

  // --- EMOJI PICKER SETUP ---
  const popularEmojis = ['👍', '❤️', '🔥', '😂', '🎉', '🚀', '👏', '😍', '🙏', '✨', '💯', '🤔', '😎', '🙌'];
  function initEmojiPicker() {
    elements.emojiPopover.innerHTML = popularEmojis
      .map(e => `<div class="emoji-cell" data-emoji="${e}">${e}</div>`)
      .join('');

    elements.emojiPopover.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.emoji-cell');
      if (cell) {
        insertAtCursor(elements.messageInput, cell.dataset.emoji);
        elements.emojiPopover.style.display = 'none';
        elements.messageInput.focus();
      }
    });
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    input.value = input.value.substring(0, start) + text + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + text.length;
  }

  // --- API REQUEST HELPER ---
  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    try {
      const res = await fetch(path, { ...options, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server request failed');
      return data;
    } catch (err) {
      throw err;
    }
  }

  // --- WEBSOCKET CONNECTION ---
  function connectWebSocket() {
    if (state.ws) {
      try { state.ws.close(); } catch (e) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      console.log('⚡ Connected to SecureChat Pro WebSocket Server');
      if (state.token) {
        state.ws.send(JSON.stringify({ type: 'auth', token: state.token }));
      }
      // Start heartbeat
      if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = setInterval(() => {
        if (state.ws && state.ws.readyState === WebSocket.OPEN) {
          state.ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 15000);
    };

    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleSocketMessage(data);
      } catch (e) {
        console.error('Socket message parse error:', e);
      }
    };

    state.ws.onclose = () => {
      console.warn('⚠️ WebSocket disconnected. Reconnecting in 3s...');
      clearInterval(state.heartbeatInterval);
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    state.ws.onerror = (err) => {
      console.error('WebSocket encountered error:', err);
    };
  }

  function handleSocketMessage(data) {
    switch (data.type) {
      case 'authenticated':
        console.log('✅ Authenticated as:', data.username);
        loadInitialData();
        break;

      case 'new_message': {
        const msg = data.message;
        const isCurrentChat = state.activeTarget && (
          (state.activeTarget.type === 'channel' && state.activeTarget.id === msg.channelId) ||
          (state.activeTarget.type === 'direct' && (
            (msg.from === state.activeTarget.id && msg.to === state.user.username) ||
            (msg.from === state.user.username && msg.to === state.activeTarget.id)
          ))
        );

        if (isCurrentChat) {
          // Avoid duplicate
          if (!state.messages.some(m => m.id === msg.id)) {
            state.messages.push(msg);
            renderMessage(msg, true);
            scrollToBottom();
          }
          if (msg.from !== state.user.username) {
            playSound('receive');
            // Mark read immediately
            sendSocketMessage({ type: 'mark_read', peer: msg.from });
          }
        } else {
          if (msg.from !== state.user.username) {
            playSound('receive');
          }
          // Refresh conversation list preview & unread badge
          refreshContactsList();
        }
        break;
      }

      case 'message_updated': {
        const updated = data.message;
        const idx = state.messages.findIndex(m => m.id === updated.id);
        if (idx > -1) {
          state.messages[idx] = updated;
          const el = document.getElementById(`msg-${updated.id}`);
          if (el) {
            const newEl = createMessageElement(updated);
            el.replaceWith(newEl);
          }
          checkPinnedBanner();
        }
        break;
      }

      case 'messages_read': {
        if (state.activeTarget && state.activeTarget.id === data.by) {
          state.messages.forEach(m => {
            if (m.from === state.user.username) m.status = 'read';
          });
          document.querySelectorAll('.read-ticks').forEach(el => {
            el.className = 'read-ticks read';
            el.textContent = '✓✓';
          });
        }
        break;
      }

      case 'messages_delivered': {
        if (state.activeTarget && state.activeTarget.id === data.to) {
          state.messages.forEach(m => {
            if (m.from === state.user.username && m.status === 'sent') m.status = 'delivered';
          });
          document.querySelectorAll('.read-ticks').forEach(el => {
            if (!el.classList.contains('read')) {
              el.textContent = '✓✓';
            }
          });
        }
        break;
      }

      case 'typing': {
        if (!state.activeTarget) return;
        const matches = (state.activeTarget.type === 'direct' && state.activeTarget.id === data.from) ||
                        (state.activeTarget.type === 'channel' && state.activeTarget.id === data.channelId && data.from !== state.user.username);
        if (matches) {
          if (data.isTyping) {
            elements.typingUserText.textContent = `${data.from} is typing...`;
            elements.typingIndicator.style.display = 'flex';
          } else {
            elements.typingIndicator.style.display = 'none';
          }
        }
        break;
      }

      case 'presence_update': {
        const user = state.users.find(u => u.username === data.username);
        if (user) {
          user.online = data.status === 'online';
          user.presence = { status: data.status, lastSeen: data.lastSeen };
          refreshContactsList();
          if (state.activeTarget && state.activeTarget.id === data.username) {
            updateTargetHeaderStatus();
          }
        }
        break;
      }

      case 'conn_received':
      case 'conn_updated': {
        const peer = data.conn.from === state.user.username ? data.conn.to : data.conn.from;
        pendingConnectionActions.delete(peer);
        handleConnectionUpdate(peer, data.conn);
        break;
      }

      case 'channel_created': {
        const existingIndex = state.channels.findIndex(channel => channel.id === data.channel.id);
        if (existingIndex === -1) {
          state.channels.push(data.channel);
        } else {
          state.channels[existingIndex] = data.channel;
        }
        if (state.activeTab === 'channels') renderChannelsList();
        break;
      }

      case 'channel_deleted': {
        state.channels = state.channels.filter(channel => channel.id !== data.channelId);
        if (state.activeTarget?.type === 'channel' && state.activeTarget.id === data.channelId) {
          showDeletedChannelMessage('This channel is no longer available');
        }
        if (state.activeTab === 'channels') renderChannelsList();
        break;
      }

      case 'call_signal': {
        handleCallSignal(data);
        break;
      }

      default:
        break;
    }
  }

  function sendSocketMessage(payload) {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(payload));
    }
  }

  function showDeletedChannelMessage(statusText) {
    state.activeTarget = null;
    state.messages = [];
    elements.targetName.textContent = 'Select a conversation';
    elements.targetAvatar.textContent = '#';
    elements.targetStatus.textContent = statusText;
    elements.chatHeaderActions.style.display = 'none';
    elements.chatInputArea.style.display = 'none';
    elements.pinnedBanner.style.display = 'none';
    elements.messagesContainer.innerHTML = `
      <div class="empty-chat-state">
        <div class="empty-chat-icon">#</div>
        <div class="empty-chat-title">Channel deleted</div>
        <div class="empty-chat-sub">This channel was deleted by its admin.</div>
      </div>`;
    elements.appContainer.classList.remove('chat-open');
  }

  // --- INITIAL DATA LOADING ---
  async function loadInitialData() {
    try {
      const [userData, usersData, channelsData] = await Promise.all([
        api('/api/auth/me'),
        api('/api/users'),
        api('/api/channels')
      ]);

      state.user = userData.user;
      state.users = usersData.users;
      state.channels = channelsData.channels;

      updateCurrentUserUI();
      renderActiveTab();
    } catch (e) {
      console.error('Failed to load initial data:', e);
      logout();
    }
  }

  function updateCurrentUserUI() {
    elements.myDisplayName.textContent = state.user.displayName || state.user.username;
    elements.myStatusBio.textContent = state.user.bio || 'Online';
    elements.myAvatar.textContent = (state.user.displayName || state.user.username)[0].toUpperCase();
    if (state.user.avatarColor) elements.myAvatar.style.background = state.user.avatarColor;

    // Apply theme
    applyTheme(state.user.theme || 'dark');
  }

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    elements.themeSelect.value = themeName;
  }

  // --- TAB NAVIGATION & LIST RENDERING ---
  elements.tabDirect.addEventListener('click', () => switchTab('direct'));
  elements.tabChannels.addEventListener('click', () => switchTab('channels'));

  function switchTab(tab) {
    state.activeTab = tab;
    elements.tabDirect.classList.toggle('active', tab === 'direct');
    elements.tabChannels.classList.toggle('active', tab === 'channels');
    renderActiveTab();
  }

  function renderActiveTab() {
    if (state.activeTab === 'direct') {
      renderDirectChatsList();
    } else {
      renderChannelsList();
    }
  }

  async function refreshContactsList() {
    try {
      const usersData = await api('/api/users');
      state.users = usersData.users;
      renderActiveTab();
      return true;
    } catch (e) {
      console.warn('Refresh contacts error:', e);
      return false;
    }
  }

  async function handleConnectionUpdate(peer, connection) {
    await refreshContactsList();

    const peerUser = state.users.find(user => user.username === peer);
    if (peerUser) {
      const currentConnection = peerUser.connection;
      const isNewer = !currentConnection ||
        (connection.ts || 0) > (currentConnection.ts || 0) ||
        ((connection.ts || 0) === (currentConnection.ts || 0) &&
          currentConnection.status === 'pending' && connection.status !== 'pending');
      if (isNewer) peerUser.connection = connection;
    }
    renderActiveTab();

    if (state.activeTarget?.type === 'direct' && state.activeTarget.id === peer) {
      await loadConversation(state.activeTarget);
    }
  }

  function renderDirectChatsList() {
    const q = elements.sidebarSearch.value.trim().toLowerCase();
    const filtered = state.users.filter(u => 
      u.username.toLowerCase().includes(q) || 
      (u.displayName && u.displayName.toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
      elements.conversationsList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px 16px; font-size: 13px;">
          ${q ? 'No contacts match your search.' : 'No other registered users found yet.<br>Create another account in a new tab to start messaging!'}
        </div>`;
      return;
    }

    elements.conversationsList.innerHTML = filtered.map(u => {
      const isActive = state.activeTarget && state.activeTarget.id === u.username;
      const initial = (u.displayName || u.username)[0].toUpperCase();
      const isOnline = u.online && !u.hideLastSeen;
      const conn = u.connection;

      let badgeHtml = '';
      let previewText = u.bio || (isOnline ? 'Active now' : 'Offline');

      if (conn) {
        if (conn.status === 'pending') {
          if (conn.to === state.user.username) {
            badgeHtml = `<span class="badge-pill request">Request</span>`;
            previewText = 'Wants to connect with you';
          } else {
            previewText = 'Connection request sent';
          }
        }
      } else {
        badgeHtml = `<span class="badge-pill" style="background: var(--card-bg); color: var(--text-muted);">Connect</span>`;
      }

      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" data-type="direct" data-id="${u.username}">
          <div class="avatar" style="background: ${u.avatarColor || 'var(--accent)'};">
            ${initial}
            <span class="status-dot ${isOnline ? 'online' : ''}"></span>
          </div>
          <div class="convo-meta">
            <div class="convo-header">
              <span class="convo-title">${escapeHtml(u.displayName || u.username)}</span>
            </div>
            <div class="convo-preview">${escapeHtml(previewText)}</div>
          </div>
          ${badgeHtml}
        </div>
      `;
    }).join('');

    attachConversationClickHandlers();
  }

  function renderChannelsList() {
    const q = elements.sidebarSearch.value.trim().toLowerCase();
    const filtered = state.channels.filter(ch => 
      ch.name.toLowerCase().includes(q) || 
      (ch.description && ch.description.toLowerCase().includes(q))
    );

    if (filtered.length === 0) {
      elements.conversationsList.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px 16px; font-size: 13px;">
          No channels found. Click "+" above to create one!
        </div>`;
      return;
    }

    elements.conversationsList.innerHTML = filtered.map(ch => {
      const isActive = state.activeTarget && state.activeTarget.id === ch.id;
      const canDelete = ch.creator && ch.creator === state.user.username;
      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" data-type="channel" data-id="${ch.id}">
          <div class="avatar" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8);">#</div>
          <div class="convo-meta">
            <div class="convo-header">
              <span class="convo-title"># ${escapeHtml(ch.name)}</span>
            </div>
            <div class="convo-preview">${escapeHtml(ch.description || 'Public channel')}</div>
          </div>
          ${canDelete ? `<button type="button" class="channel-delete-btn" data-id="${escapeHtml(ch.id)}" title="Delete channel" aria-label="Delete ${escapeHtml(ch.name)}">×</button>` : ''}
        </div>
      `;
    }).join('');

    attachConversationClickHandlers();
  }

  function attachConversationClickHandlers() {
    elements.conversationsList.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        const id = item.dataset.id;
        openConversation(type, id);
      });
    });

    elements.conversationsList.querySelectorAll('.channel-delete-btn').forEach(button => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const channel = state.channels.find(item => item.id === button.dataset.id);
        if (!channel || !confirm(`Delete “${channel.name}” and its messages? This cannot be undone.`)) return;

        button.disabled = true;
        try {
          await api(`/api/channels/${encodeURIComponent(channel.id)}`, { method: 'DELETE' });
          state.channels = state.channels.filter(item => item.id !== channel.id);
          if (state.activeTarget?.type === 'channel' && state.activeTarget.id === channel.id) {
            showDeletedChannelMessage('Pick a friend or channel to chat');
          }
          renderActiveTab();
        } catch (e) {
          alert('Delete channel error: ' + e.message);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  elements.sidebarSearch.addEventListener('input', () => {
    renderActiveTab();
  });

  // --- OPEN CONVERSATION ---
  async function openConversation(type, id) {
    if (type === 'direct') {
      const peer = state.users.find(u => u.username === id);
      if (!peer) return;
      state.activeTarget = {
        type: 'direct',
        id: peer.username,
        name: peer.displayName || peer.username,
        avatarColor: peer.avatarColor,
        peerUser: peer
      };
    } else {
      const ch = state.channels.find(c => c.id === id);
      if (!ch) return;
      state.activeTarget = {
        type: 'channel',
        id: ch.id,
        name: '# ' + ch.name,
        avatarColor: '#3b82f6',
        channel: ch
      };
    }

    // Update active highlight in sidebar
    renderActiveTab();

    // Mobile slide-over
    elements.appContainer.classList.add('chat-open');

    // Setup chat header
    elements.targetName.textContent = state.activeTarget.name;
    elements.targetAvatar.textContent = state.activeTarget.name[0].toUpperCase();
    elements.targetAvatar.style.background = state.activeTarget.avatarColor || 'var(--accent)';
    elements.chatHeaderActions.style.display = 'flex';
    elements.chatSearchInput.value = '';
    state.searchQuery = '';
    elements.searchChipsBar.style.display = 'none';

    updateTargetHeaderStatus();
    loadConversation(state.activeTarget);
  }

  function updateTargetHeaderStatus() {
    if (!state.activeTarget) return;
    if (state.activeTarget.type === 'channel') {
      elements.targetStatus.textContent = state.activeTarget.channel?.description || 'Public room';
      elements.btnStartAudioCall.style.display = 'none';
      elements.btnStartVideoCall.style.display = 'none';
    } else {
      elements.btnStartAudioCall.style.display = 'inline-flex';
      elements.btnStartVideoCall.style.display = 'inline-flex';
      const peer = state.users.find(u => u.username === state.activeTarget.id);
      if (peer) {
        if (peer.hideLastSeen) {
          elements.targetStatus.textContent = 'Offline';
        } else if (peer.online) {
          elements.targetStatus.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:var(--online); display:inline-block;"></span> Online`;
        } else if (peer.presence?.lastSeen) {
          elements.targetStatus.textContent = `Last seen at ${formatTime(peer.presence.lastSeen)}`;
        } else {
          elements.targetStatus.textContent = 'Offline';
        }
      }
    }
  }

  elements.btnBackToSidebar.addEventListener('click', () => {
    elements.appContainer.classList.remove('chat-open');
  });

  // --- LOAD CONVERSATION MESSAGES & RENDER FEED ---
  async function loadConversation(target) {
    elements.messagesContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
        <div class="auth-card" style="margin: 0 auto; max-width: 200px; padding: 14px; text-align: center;">Loading messages...</div>
      </div>`;

    // Permission check for direct chats
    if (target.type === 'direct') {
      const peer = state.users.find(u => u.username === target.id);
      const conn = peer?.connection;
      if (!conn || conn.status !== 'accepted') {
        renderConnectionPermissionCard(target.id, conn);
        elements.chatInputArea.style.display = 'none';
        elements.pinnedBanner.style.display = 'none';
        return;
      }
    }

    elements.chatInputArea.style.display = 'flex';
    elements.messageInput.focus();

    try {
      const endpoint = target.type === 'channel' 
        ? `/api/messages?channelId=${encodeURIComponent(target.id)}`
        : `/api/messages?peer=${encodeURIComponent(target.id)}`;
      
      const res = await api(endpoint);
      state.messages = res.messages || [];
      renderMessagesFeed();
      checkPinnedBanner();
      scrollToBottom();
    } catch (e) {
      console.error('Failed to load messages:', e);
      elements.messagesContainer.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 40px;">Error loading messages</div>`;
    }
  }

  function renderConnectionPermissionCard(peerUsername, conn) {
    let content = '';
    const safePeer = escapeHtml(peerUsername);

    if (!conn) {
      content = `
        <div class="auth-card" style="margin: 40px auto; max-width: 360px; text-align: center;">
          <h3 style="margin-bottom: 8px;">Connect with ${safePeer}</h3>
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            To ensure secure messaging, send a connection request. Once they accept, you can chat in real time.
          </p>
          <button class="btn-primary" onclick="window.scApp.sendConnRequest('${safePeer}', this)">
            Send Connection Request
          </button>
        </div>`;
    } else if (conn.status === 'pending' && conn.from === state.user.username) {
      content = `
        <div class="auth-card" style="margin: 40px auto; max-width: 360px; text-align: center;">
          <h3 style="margin-bottom: 8px;">Request Pending</h3>
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            Connection request sent to <b>${safePeer}</b>. Waiting for acceptance.
          </p>
        </div>`;
    } else if (conn.status === 'pending' && conn.to === state.user.username) {
      content = `
        <div class="auth-card" style="margin: 40px auto; max-width: 360px; text-align: center;">
          <h3 style="margin-bottom: 8px;">Connection Request</h3>
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            <b>${safePeer}</b> wants to connect with you.
          </p>
          <div style="display: flex; gap: 10px;">
            <button class="btn-primary" onclick="window.scApp.respondConn('${safePeer}', true, this)">Accept</button>
            <button class="btn-primary" style="background: var(--card-bg); color: var(--text-main);" onclick="window.scApp.respondConn('${safePeer}', false, this)">Decline</button>
          </div>
        </div>`;
    } else {
      content = `
        <div class="auth-card" style="margin: 40px auto; max-width: 360px; text-align: center;">
          <h3 style="margin-bottom: 8px;">Connection Declined</h3>
          <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
            The connection was declined.
          </p>
          <button class="btn-primary" onclick="window.scApp.sendConnRequest('${safePeer}', this)">Send Again</button>
        </div>`;
    }

    elements.messagesContainer.innerHTML = content;
  }

  // --- MESSAGES FEED RENDERING ---
  function renderMessagesFeed() {
    if (state.messages.length === 0) {
      elements.messagesContainer.innerHTML = `
        <div class="empty-chat-state">
          <div class="empty-chat-icon">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
          </div>
          <div class="empty-chat-title">No messages yet</div>
          <div class="empty-chat-sub">Break the ice! Type a message or send a voice memo below.</div>
        </div>`;
      return;
    }

    elements.messagesContainer.innerHTML = '';
    state.messages.forEach(msg => {
      renderMessage(msg, false);
    });
  }

  function renderMessage(msg, append = true) {
    const el = createMessageElement(msg);
    if (append) {
      // Remove empty state if present
      const emptyState = elements.messagesContainer.querySelector('.empty-chat-state');
      if (emptyState) emptyState.remove();
      elements.messagesContainer.appendChild(el);
    }
    return el;
  }

  function createMessageElement(msg) {
    const isMe = msg.from === state.user.username;
    const row = document.createElement('div');
    row.className = `message-row ${isMe ? 'me' : 'peer'}`;
    row.id = `msg-${msg.id}`;

    // Avatar for peer messages
    let avatarHtml = '';
    if (!isMe) {
      const senderInitial = msg.from[0].toUpperCase();
      avatarHtml = `<div class="msg-avatar">${senderInitial}</div>`;
    }

    // Quoted reply content
    let replyHtml = '';
    if (msg.replyTo) {
      const parent = state.messages.find(m => m.id === msg.replyTo);
      if (parent) {
        replyHtml = `
          <div class="quoted-reply" onclick="window.scApp.jumpToMessage('${parent.id}')">
            <div class="quoted-reply-user">${escapeHtml(parent.from === state.user.username ? 'You' : parent.from)}</div>
            <div class="quoted-reply-body">${escapeHtml(parent.deleted ? 'Deleted message' : (parent.body || '[Media]'))}</div>
          </div>`;
      }
    }

    // Body content (handles text, images, voice notes, deleted state)
    let bodyHtml = '';
    if (msg.deleted) {
      bodyHtml = `<span style="font-style: italic; color: var(--text-muted);">This message was deleted</span>`;
    } else {
      if (msg.type === 'image' && msg.mediaUrl) {
        bodyHtml += `<img src="${msg.mediaUrl}" class="message-media-img" onclick="window.scApp.openLightbox('${msg.mediaUrl}')" alt="Attachment">`;
      } else if (msg.type === 'audio' && msg.mediaUrl) {
        bodyHtml += createAudioWaveformPlayerHtml(msg.id, msg.mediaUrl);
      }

      if (msg.body) {
        bodyHtml += `<div class="message-text">${highlightQueryTokens(escapeHtml(msg.body), state.searchQuery)}</div>`;
      }
    }

    // Meta (timestamp, status ticks, edited tag)
    let metaTicks = '';
    if (isMe && !msg.deleted) {
      const isRead = msg.status === 'read';
      const isDelivered = msg.status === 'delivered';
      const tickMarks = isRead ? '✓✓' : isDelivered ? '✓✓' : '✓';
      metaTicks = `<span class="read-ticks ${isRead ? 'read' : ''}">${tickMarks}</span>`;
    }

    const editedTag = msg.edited && !msg.deleted ? `<span>(edited)</span>` : '';
    const pinIcon = msg.pinned ? `<span title="Pinned" style="color: var(--warning);">📌</span>` : '';

    // Reactions container
    let reactionsHtml = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0 && !msg.deleted) {
      reactionsHtml = `<div class="reactions-bar">` +
        Object.entries(msg.reactions).map(([emoji, users]) => {
          const userReacted = users.includes(state.user.username);
          return `
            <div class="reaction-pill ${userReacted ? 'user-reacted' : ''}" onclick="window.scApp.toggleReaction('${msg.id}', '${emoji}')">
              <span>${emoji}</span>
              <span style="font-weight: 600;">${users.length}</span>
            </div>`;
        }).join('') +
      `</div>`;
    }

    // Hover toolbar actions
    let actionsHtml = '';
    if (!msg.deleted) {
      actionsHtml = `
        <div class="message-actions-trigger">
          <button class="action-mini-btn" title="React" onclick="window.scApp.showReactionPicker('${msg.id}', event)">😊</button>
          <button class="action-mini-btn" title="Reply" onclick="window.scApp.startReply('${msg.id}')">↩</button>
          <button class="action-mini-btn" title="Pin message" onclick="window.scApp.togglePin('${msg.id}')">📌</button>
          ${isMe ? `
            <button class="action-mini-btn" title="Edit" onclick="window.scApp.promptEdit('${msg.id}')">✏️</button>
            <button class="action-mini-btn" title="Delete" onclick="window.scApp.deleteMessage('${msg.id}')">🗑️</button>
          ` : ''}
        </div>`;
    }

    row.innerHTML = `
      ${avatarHtml}
      <div class="message-bubble">
        ${!isMe && state.activeTarget?.type === 'channel' ? `<div class="message-sender-name">${escapeHtml(msg.from)}</div>` : ''}
        ${replyHtml}
        ${bodyHtml}
        <div class="message-meta">
          ${pinIcon}
          ${editedTag}
          <span>${formatTime(msg.ts)}</span>
          ${metaTicks}
        </div>
        ${reactionsHtml}
      </div>
      ${actionsHtml}
    `;

    return row;
  }

  // --- CUSTOM AUDIO WAVEFORM PLAYER HTML ---
  function createAudioWaveformPlayerHtml(msgId, audioUrl) {
    return `
      <div class="audio-player-box" id="player-${msgId}">
        <audio id="audio-${msgId}" src="${audioUrl}" preload="metadata" onended="window.scApp.audioEnded('${msgId}')" ontimeupdate="window.scApp.audioTimeUpdate('${msgId}')"></audio>
        <button class="audio-play-btn" onclick="window.scApp.togglePlayAudio('${msgId}')">
          <svg id="play-icon-${msgId}" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <div class="audio-waveform-bars">
          <span class="audio-bar" style="height: 12px;"></span>
          <span class="audio-bar" style="height: 18px;"></span>
          <span class="audio-bar" style="height: 8px;"></span>
          <span class="audio-bar" style="height: 22px;"></span>
          <span class="audio-bar" style="height: 14px;"></span>
          <span class="audio-bar" style="height: 19px;"></span>
          <span class="audio-bar" style="height: 10px;"></span>
          <span class="audio-bar" style="height: 16px;"></span>
          <span class="audio-bar" style="height: 20px;"></span>
          <span class="audio-bar" style="height: 11px;"></span>
        </div>
        <span class="audio-time-label" id="time-${msgId}">0:00</span>
      </div>
    `;
  }

  // --- PINNED MESSAGE BANNER ---
  function checkPinnedBanner() {
    const pinnedMsg = state.messages.find(m => m.pinned && !m.deleted);
    if (pinnedMsg) {
      elements.pinnedBanner.style.display = 'flex';
      elements.pinnedBannerText.textContent = pinnedMsg.body || '[Media Attachment]';
      elements.pinnedBannerText.onclick = () => jumpToMessage(pinnedMsg.id);
    } else {
      elements.pinnedBanner.style.display = 'none';
    }
  }

  elements.btnUnpinBanner.addEventListener('click', () => {
    const pinnedMsg = state.messages.find(m => m.pinned);
    if (pinnedMsg) togglePin(pinnedMsg.id);
  });

  // --- SEND CHAT MESSAGE ---
  function sendMessage() {
    const body = elements.messageInput.value.trim();
    if (!body || !state.activeTarget) return;

    const payload = {
      type: 'chat_message',
      body,
      messageType: 'text',
      replyTo: state.replyTo ? state.replyTo.id : null
    };

    if (state.activeTarget.type === 'direct') {
      payload.to = state.activeTarget.id;
    } else {
      payload.channelId = state.activeTarget.id;
    }

    sendSocketMessage(payload);
    playSound('send');

    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    cancelReply();
    notifyTyping(false);
  }

  elements.btnSendMessage.addEventListener('click', sendMessage);

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Typing Notification
  elements.messageInput.addEventListener('input', () => {
    // Auto-grow textarea
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 120) + 'px';

    if (!state.isTypingSent) {
      state.isTypingSent = true;
      notifyTyping(true);
    }
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      state.isTypingSent = false;
      notifyTyping(false);
    }, 2000);
  });

  function notifyTyping(isTyping) {
    if (!state.activeTarget) return;
    const payload = { type: 'typing', isTyping };
    if (state.activeTarget.type === 'direct') {
      payload.to = state.activeTarget.id;
    } else {
      payload.channelId = state.activeTarget.id;
    }
    sendSocketMessage(payload);
  }

  // --- REPLYING TO MESSAGES ---
  function startReply(msgId) {
    const msg = state.messages.find(m => m.id === msgId);
    if (!msg) return;
    state.replyTo = msg;
    elements.replyBanner.style.display = 'flex';
    elements.replyBannerText.textContent = `Replying to ${msg.from}: "${(msg.body || 'Media').slice(0, 50)}"`;
    elements.messageInput.focus();
  }

  function cancelReply() {
    state.replyTo = null;
    elements.replyBanner.style.display = 'none';
  }

  elements.btnCancelReply.addEventListener('click', cancelReply);

  // --- VOICE MEMO RECORDING (NATIVE WEBRTC / MEDIARECORDER) ---
  elements.btnMicRecord.addEventListener('click', toggleAudioRecording);

  async function toggleAudioRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      stopAudioRecording(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      state.mediaRecorder = new MediaRecorder(stream);

      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };

      state.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(state.recordTimerInterval);
        elements.recordingBar.style.display = 'none';
        elements.messageInput.style.display = 'block';
        elements.btnMicRecord.style.color = 'inherit';
      };

      state.mediaRecorder.start();
      state.recordStartTime = Date.now();

      // UI changes
      elements.recordingBar.style.display = 'flex';
      elements.messageInput.style.display = 'none';
      elements.btnMicRecord.style.color = 'var(--danger)';

      state.recordTimerInterval = setInterval(() => {
        const sec = Math.floor((Date.now() - state.recordStartTime) / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        elements.recTimer.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
      }, 500);

    } catch (err) {
      alert('Microphone access denied or unavailable: ' + err.message);
    }
  }

  elements.btnCancelRecord.addEventListener('click', () => {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.stop();
      state.audioChunks = [];
    }
  });

  elements.btnSendRecord.addEventListener('click', () => {
    if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
      state.mediaRecorder.onstop = async () => {
        clearInterval(state.recordTimerInterval);
        elements.recordingBar.style.display = 'none';
        elements.messageInput.style.display = 'block';
        elements.btnMicRecord.style.color = 'inherit';

        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        await uploadAndSendMedia(audioBlob, 'voice_note.webm', 'audio');
      };
      state.mediaRecorder.stop();
    }
  });

  function stopAudioRecording(shouldSend) {
    if (state.mediaRecorder) {
      if (shouldSend) elements.btnSendRecord.click();
      else elements.btnCancelRecord.click();
    }
  }

  // --- FILE & IMAGE ATTACHMENT ---
  elements.btnAttachFile.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadAndSendMedia(file, file.name, 'image');
    elements.fileInput.value = '';
  });

  async function uploadAndSendMedia(fileOrBlob, filename, mediaType) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result;
        const uploadRes = await api('/api/upload', {
          method: 'POST',
          body: JSON.stringify({
            filename,
            fileData: base64Data,
            mimeType: fileOrBlob.type,
            type: mediaType
          })
        });

        // Send via WebSocket
        const payload = {
          type: 'chat_message',
          body: '',
          messageType: mediaType,
          mediaUrl: uploadRes.mediaUrl,
          replyTo: state.replyTo ? state.replyTo.id : null
        };

        if (state.activeTarget.type === 'direct') {
          payload.to = state.activeTarget.id;
        } else {
          payload.channelId = state.activeTarget.id;
        }

        sendSocketMessage(payload);
        playSound('send');
        cancelReply();
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    };
    reader.readAsDataURL(fileOrBlob);
  }

  // --- AUDIO PLAYER CONTROLS ---
  function togglePlayAudio(msgId) {
    const audio = document.getElementById(`audio-${msgId}`);
    const box = document.getElementById(`player-${msgId}`);
    const icon = document.getElementById(`play-icon-${msgId}`);
    if (!audio) return;

    if (audio.paused) {
      // Pause all other playing audios
      document.querySelectorAll('audio').forEach(a => {
        if (a !== audio && !a.paused) a.pause();
      });
      document.querySelectorAll('.audio-player-box').forEach(b => b.classList.remove('playing'));

      audio.play();
      box.classList.add('playing');
      icon.innerHTML = `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>`;
    } else {
      audio.pause();
      box.classList.remove('playing');
      icon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
    }
  }

  function audioEnded(msgId) {
    const box = document.getElementById(`player-${msgId}`);
    const icon = document.getElementById(`play-icon-${msgId}`);
    if (box) box.classList.remove('playing');
    if (icon) icon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
  }

  function audioTimeUpdate(msgId) {
    const audio = document.getElementById(`audio-${msgId}`);
    const timeLabel = document.getElementById(`time-${msgId}`);
    if (audio && timeLabel) {
      const cur = Math.floor(audio.currentTime);
      const m = Math.floor(cur / 60);
      const s = cur % 60;
      timeLabel.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
  }

  // --- MESSAGE ACTIONS (REACTIONS, EDIT, DELETE, PIN, JUMP) ---
  function toggleReaction(msgId, emoji) {
    sendSocketMessage({
      type: 'toggle_reaction',
      msgId,
      emoji
    });
  }

  function showReactionPicker(msgId, event) {
    event.stopPropagation();
    const existing = document.getElementById('tempReactionPopover');
    if (existing) existing.remove();

    const popover = document.createElement('div');
    popover.id = 'tempReactionPopover';
    popover.className = 'emoji-popover';
    popover.style.display = 'grid';
    popover.style.position = 'fixed';
    popover.style.top = `${event.clientY - 60}px`;
    popover.style.left = `${Math.min(event.clientX - 100, window.innerWidth - 300)}px`;

    popover.innerHTML = ['👍', '❤️', '🔥', '😂', '🎉', '🚀', '👏'].map(em => `
      <div class="emoji-cell" onclick="window.scApp.toggleReaction('${msgId}', '${em}'); document.getElementById('tempReactionPopover').remove();">${em}</div>
    `).join('');

    document.body.appendChild(popover);
    setTimeout(() => {
      document.addEventListener('click', function closeReaction() {
        popover.remove();
        document.removeEventListener('click', closeReaction);
      });
    }, 10);
  }

  function promptEdit(msgId) {
    const msg = state.messages.find(m => m.id === msgId);
    if (!msg || msg.deleted) return;
    const newBody = prompt('Edit your message:', msg.body);
    if (newBody !== null && newBody.trim() && newBody.trim() !== msg.body) {
      sendSocketMessage({
        type: 'edit_message',
        msgId,
        body: newBody.trim()
      });
    }
  }

  function deleteMessage(msgId) {
    if (confirm('Delete this message for everyone?')) {
      sendSocketMessage({
        type: 'delete_message',
        msgId
      });
    }
  }

  function togglePin(msgId) {
    sendSocketMessage({
      type: 'pin_message',
      msgId
    });
  }

  function jumpToMessage(msgId) {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '2px solid var(--accent)';
      setTimeout(() => { el.style.outline = 'none'; }, 2000);
    }
  }

  // --- IN-CHAT SEARCH & HIGHLIGHTING ---
  elements.chatSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    if (state.searchQuery) {
      const tokens = state.searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      let matchCount = 0;

      elements.chipsContainer.innerHTML = tokens.map((t, idx) => 
        `<span class="chip-tag tag-${idx % 6}">${escapeHtml(t)}</span>`
      ).join(' ');

      state.messages.forEach(m => {
        if (!m.deleted && m.body) {
          const bodyNorm = m.body.toLowerCase();
          if (tokens.every(t => bodyNorm.includes(t))) matchCount++;
        }
      });

      elements.searchMatchCount.textContent = `${matchCount} match${matchCount === 1 ? '' : 'es'}`;
      elements.searchChipsBar.style.display = 'flex';
    } else {
      elements.searchChipsBar.style.display = 'none';
    }

    renderMessagesFeed();
  });

  function highlightQueryTokens(text, query) {
    if (!query) return text;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return text;

    let highlighted = text;
    tokens.forEach((t, idx) => {
      const regex = new RegExp(`(${escapeRegex(t)})`, 'gi');
      highlighted = highlighted.replace(regex, `<mark class="h${idx % 4}">$1</mark>`);
    });
    return highlighted;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // --- SCROLL TO BOTTOM & FAB ---
  function scrollToBottom() {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    elements.btnJumpBottom.style.display = 'none';
  }

  elements.messagesContainer.addEventListener('scroll', () => {
    const fromBottom = elements.messagesContainer.scrollHeight - elements.messagesContainer.scrollTop - elements.messagesContainer.clientHeight;
    if (fromBottom > 160) {
      elements.btnJumpBottom.style.display = 'grid';
    } else {
      elements.btnJumpBottom.style.display = 'none';
    }
  });

  elements.btnJumpBottom.addEventListener('click', scrollToBottom);

  // --- CLEAR CHAT ---
  elements.btnClearChat.addEventListener('click', async () => {
    if (!state.activeTarget) return;
    if (confirm(`Clear this chat for your view? Other participants will still keep their history.`)) {
      try {
        state.messages = [];
        renderMessagesFeed();
        // Server call could be made here
      } catch (e) {
        console.error('Clear chat error:', e);
      }
    }
  });

  // --- WEBRTC 1-ON-1 AUDIO/VIDEO CALLS ---
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  elements.btnStartAudioCall.addEventListener('click', () => initiateCall(false));
  elements.btnStartVideoCall.addEventListener('click', () => initiateCall(true));

  async function initiateCall(isVideo) {
    if (!state.activeTarget || state.activeTarget.type !== 'direct') return;
    state.activeCallPeer = state.activeTarget.id;
    state.activeCallIsVideo = isVideo;

    elements.callTitle.textContent = isVideo ? 'Video Call' : 'Audio Call';
    elements.callPeerName.textContent = state.activeTarget.name;
    elements.callAvatar.textContent = state.activeTarget.name[0].toUpperCase();
    elements.callStateLabel.textContent = 'Calling...';
    elements.callStatusBadge.textContent = 'Ringing';
    elements.incomingControls.style.display = 'none';
    elements.activeControls.style.display = 'flex';
    elements.callModal.style.display = 'flex';
    elements.btnEnableCallAudio.style.display = 'none';

    if (isVideo) {
      elements.callAudioPulseView.style.display = 'none';
      elements.callVideoView.style.display = 'block';
    } else {
      elements.callAudioPulseView.style.display = 'block';
      elements.callVideoView.style.display = 'none';
    }

    try {
      state.localStream = await getCallMedia(isVideo);

      if (isVideo && elements.localVideo) {
        elements.localVideo.srcObject = state.localStream;
      }

      setupPeerConnection();
      state.localStream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, state.localStream);
      });

      const offer = await state.peerConnection.createOffer();
      await state.peerConnection.setLocalDescription(offer);

      sendSocketMessage({
        type: 'call_signal',
        to: state.activeCallPeer,
        signalType: 'offer',
        payload: offer,
        isVideo
      });

    } catch (err) {
      alert(`Could not start call: ${getCallMediaError(err)}`);
      endCall();
    }
  }

  async function getCallMedia(isVideo) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access requires HTTPS or localhost. Open this app using http://localhost.');
    }

    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: 640, height: 480 } : false
    });
  }

  function getCallMediaError(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      return 'Please allow microphone access' +
        (state.activeCallIsVideo ? ' and camera access' : '') +
        ' in your browser, then try the call again.';
    }
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
      return `No ${state.activeCallIsVideo ? 'microphone or camera' : 'microphone'} was found. Connect a device and try again.`;
    }
    return error?.message || 'Check your microphone and camera permissions, then try again.';
  }

  function attachRemoteCallMedia(event) {
    if (event.streams?.[0]) {
      state.remoteCallStream = event.streams[0];
    } else if (state.remoteCallStream) {
      if (!state.remoteCallStream.getTracks().some(track => track.id === event.track.id)) {
        state.remoteCallStream.addTrack(event.track);
      }
    } else {
      state.remoteCallStream = new MediaStream([event.track]);
    }

    elements.remoteAudio.srcObject = state.remoteCallStream;
    elements.remoteVideo.srcObject = state.remoteCallStream;
    elements.remoteVideo.muted = true;

    elements.remoteAudio.play().then(() => {
      elements.btnEnableCallAudio.style.display = 'none';
    }).catch(error => {
      if (error.name === 'NotAllowedError') {
        elements.btnEnableCallAudio.style.display = 'block';
        elements.callStateLabel.textContent = 'Connected — tap to enable call audio';
      } else {
        console.error('Could not play remote call audio:', error);
      }
    });
  }

  function setupPeerConnection() {
    if (state.peerConnection) state.peerConnection.close();
    state.peerConnection = new RTCPeerConnection(rtcConfig);

    state.peerConnection.onicecandidate = (event) => {
      if (event.candidate && state.activeCallPeer) {
        sendSocketMessage({
          type: 'call_signal',
          to: state.activeCallPeer,
          signalType: 'ice_candidate',
          payload: event.candidate
        });
      }
    };

    state.peerConnection.ontrack = (event) => {
      attachRemoteCallMedia(event);
    };
  }

  async function handleCallSignal(data) {
    const { from, signalType, payload, isVideo } = data;

    if (signalType === 'offer') {
      state.activeCallPeer = from;
      state.activeCallIsVideo = isVideo;

      elements.callTitle.textContent = isVideo ? 'Incoming Video Call' : 'Incoming Audio Call';
      elements.callPeerName.textContent = from;
      elements.callAvatar.textContent = from[0].toUpperCase();
      elements.callStateLabel.textContent = 'Incoming call from ' + from;
      elements.callStatusBadge.textContent = 'Incoming';

      elements.incomingControls.style.display = 'flex';
      elements.activeControls.style.display = 'none';
      elements.callAudioPulseView.style.display = 'block';
      elements.callVideoView.style.display = 'none';
      elements.callModal.style.display = 'flex';

      // Store offer for acceptance
      state.pendingOffer = payload;
      playSound('receive');

    } else if (signalType === 'answer') {
      if (state.peerConnection) {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(payload));
        elements.callStateLabel.textContent = 'Connected';
        elements.callStatusBadge.textContent = 'Live';
      }
    } else if (signalType === 'ice_candidate') {
      if (state.peerConnection && payload) {
        try {
          await state.peerConnection.addIceCandidate(new RTCIceCandidate(payload));
        } catch (e) {
          console.warn('ICE Candidate error:', e);
        }
      }
    } else if (signalType === 'call_rejected' || signalType === 'call_ended') {
      endCall(false);
    }
  }

  elements.btnAcceptCall.addEventListener('click', async () => {
    try {
      elements.incomingControls.style.display = 'none';
      elements.activeControls.style.display = 'flex';
      elements.callStateLabel.textContent = 'Connecting...';
      elements.btnEnableCallAudio.style.display = 'none';

      state.localStream = await getCallMedia(state.activeCallIsVideo);

      if (state.activeCallIsVideo) {
        elements.callAudioPulseView.style.display = 'none';
        elements.callVideoView.style.display = 'block';
        elements.localVideo.srcObject = state.localStream;
      }

      setupPeerConnection();
      state.localStream.getTracks().forEach(track => {
        state.peerConnection.addTrack(track, state.localStream);
      });

      await state.peerConnection.setRemoteDescription(new RTCSessionDescription(state.pendingOffer));
      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);

      sendSocketMessage({
        type: 'call_signal',
        to: state.activeCallPeer,
        signalType: 'answer',
        payload: answer
      });

      elements.callStateLabel.textContent = 'Connected';
      elements.callStatusBadge.textContent = 'Live';

    } catch (e) {
      alert(`Failed to connect call: ${getCallMediaError(e)}`);
      endCall();
    }
  });

  elements.btnEnableCallAudio.addEventListener('click', async () => {
    try {
      await elements.remoteAudio.play();
      elements.btnEnableCallAudio.style.display = 'none';
      elements.callStateLabel.textContent = 'Connected';
    } catch (error) {
      console.error('Could not enable call audio:', error);
      alert('Call audio is still blocked. Check your browser sound settings and try again.');
    }
  });

  elements.btnRejectCall.addEventListener('click', () => {
    if (state.activeCallPeer) {
      sendSocketMessage({
        type: 'call_signal',
        to: state.activeCallPeer,
        signalType: 'call_rejected'
      });
    }
    endCall(false);
  });

  elements.btnEndCall.addEventListener('click', () => endCall(true));

  function endCall(notifyPeer = true) {
    if (notifyPeer && state.activeCallPeer) {
      sendSocketMessage({
        type: 'call_signal',
        to: state.activeCallPeer,
        signalType: 'call_ended'
      });
    }

    if (state.localStream) {
      state.localStream.getTracks().forEach(t => t.stop());
      state.localStream = null;
    }
    if (state.peerConnection) {
      state.peerConnection.close();
      state.peerConnection = null;
    }

    elements.callModal.style.display = 'none';
    elements.localVideo.srcObject = null;
    elements.remoteVideo.srcObject = null;
    elements.remoteAudio.pause();
    elements.remoteAudio.srcObject = null;
    elements.btnEnableCallAudio.style.display = 'none';
    state.remoteCallStream = null;
    state.activeCallPeer = null;
    playSound('hangup');
  }

  // Toggle Mic / Cam in Call
  elements.btnToggleMic.addEventListener('click', () => {
    if (state.localStream) {
      const audioTrack = state.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        elements.btnToggleMic.style.color = audioTrack.enabled ? 'var(--text-main)' : 'var(--danger)';
      }
    }
  });

  elements.btnToggleCam.addEventListener('click', () => {
    if (state.localStream) {
      const videoTrack = state.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        elements.btnToggleCam.style.color = videoTrack.enabled ? 'var(--text-main)' : 'var(--danger)';
      }
    }
  });

  // --- LIGHTBOX IMAGE VIEWER ---
  function openLightbox(url) {
    elements.lightboxImg.src = url;
    elements.lightboxModal.style.display = 'flex';
  }

  // --- MODALS (PROFILE, CREATE CHANNEL) ---
  elements.btnOpenProfile.addEventListener('click', openProfileModal);
  elements.btnSettings.addEventListener('click', openProfileModal);
  elements.btnCloseProfile.addEventListener('click', () => elements.profileModal.style.display = 'none');

  function openProfileModal() {
    elements.profileDisplayName.value = state.user?.displayName || '';
    elements.profileBio.value = state.user?.bio || '';
    elements.chkHideLastSeen.checked = !!state.user?.hideLastSeen;
    elements.chkSoundEffects.checked = state.soundEnabled;
    elements.themeSelect.value = document.documentElement.getAttribute('data-theme') || 'dark';
    elements.profileModal.style.display = 'flex';
  }

  elements.themeSelect.addEventListener('change', (e) => {
    applyTheme(e.target.value);
  });

  elements.btnSaveProfile.addEventListener('click', async () => {
    try {
      const updates = {
        displayName: elements.profileDisplayName.value.trim(),
        bio: elements.profileBio.value.trim(),
        theme: elements.themeSelect.value,
        hideLastSeen: elements.chkHideLastSeen.checked
      };

      state.soundEnabled = elements.chkSoundEffects.checked;
      localStorage.setItem('sc_sound', state.soundEnabled ? 'true' : 'false');

      const res = await api('/api/user/profile', {
        method: 'POST',
        body: JSON.stringify(updates)
      });

      state.user = res.user;
      updateCurrentUserUI();
      elements.profileModal.style.display = 'none';
    } catch (e) {
      alert('Save profile error: ' + e.message);
    }
  });

  // Create Channel Modal
  elements.btnNewChannel.addEventListener('click', () => {
    elements.channelName.value = '';
    elements.channelDesc.value = '';
    elements.channelModal.style.display = 'flex';
  });

  elements.btnCloseChannel.addEventListener('click', () => elements.channelModal.style.display = 'none');

  elements.btnSubmitChannel.addEventListener('click', async () => {
    if (elements.btnSubmitChannel.disabled) return;
    const name = elements.channelName.value.trim();
    const description = elements.channelDesc.value.trim();
    if (!name) return alert('Channel name required');

    elements.btnSubmitChannel.disabled = true;
    try {
      const res = await api('/api/channels', {
        method: 'POST',
        body: JSON.stringify({ name, description })
      });
      const existingIndex = state.channels.findIndex(channel => channel.id === res.channel.id);
      if (existingIndex === -1) {
        state.channels.push(res.channel);
      } else {
        state.channels[existingIndex] = res.channel;
      }
      elements.channelModal.style.display = 'none';
      switchTab('channels');
      openConversation('channel', res.channel.id);
    } catch (e) {
      alert('Create channel error: ' + e.message);
    } finally {
      elements.btnSubmitChannel.disabled = false;
    }
  });

  // --- AUTHENTICATION (LOGIN / REGISTER) ---
  let authMode = 'login'; // 'login' | 'reg'

  elements.btnToggleAuthMode.addEventListener('click', () => {
    authMode = authMode === 'login' ? 'reg' : 'login';
    if (authMode === 'reg') {
      elements.authTitle.textContent = 'Create Account';
      elements.authSubtitle.textContent = 'Register to join SecureChat Pro';
      elements.groupDisplayName.style.display = 'block';
      elements.btnAuthText.textContent = 'Register';
      elements.authTogglePrompt.textContent = 'Already have an account?';
      elements.btnToggleAuthMode.textContent = 'Sign In';
    } else {
      elements.authTitle.textContent = 'SecureChat Pro';
      elements.authSubtitle.textContent = 'Sign in to start secure real-time messaging';
      elements.groupDisplayName.style.display = 'none';
      elements.btnAuthText.textContent = 'Sign in';
      elements.authTogglePrompt.textContent = "Don't have an account?";
      elements.btnToggleAuthMode.textContent = 'Create Account';
    }
    elements.authError.textContent = '';
  });

  elements.btnAuthSubmit.addEventListener('click', handleAuth);
  elements.authPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuth();
  });

  async function handleAuth() {
    const username = elements.authUsername.value.trim().toLowerCase();
    const password = elements.authPassword.value;
    const displayName = elements.regDisplayName.value.trim();

    if (!username || !password) {
      elements.authError.textContent = 'Please enter username and password';
      elements.authCard.classList.add('shake');
      setTimeout(() => elements.authCard.classList.remove('shake'), 400);
      return;
    }

    try {
      elements.btnAuthSubmit.disabled = true;
      elements.btnAuthText.textContent = 'Processing...';

      const path = authMode === 'reg' ? '/api/auth/register' : '/api/auth/login';
      const body = authMode === 'reg' ? { username, password, displayName } : { username, password };

      const res = await api(path, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('sc_token', res.token);

      elements.authWrapper.style.display = 'none';
      connectWebSocket();
    } catch (err) {
      elements.authError.textContent = err.message;
      elements.authCard.classList.add('shake');
      setTimeout(() => elements.authCard.classList.remove('shake'), 400);
    } finally {
      elements.btnAuthSubmit.disabled = false;
      elements.btnAuthText.textContent = authMode === 'reg' ? 'Register' : 'Sign in';
    }
  }

  function logout() {
    localStorage.removeItem('sc_token');
    state.token = null;
    state.user = null;
    state.activeTarget = null;
    if (state.ws) {
      try { state.ws.close(); } catch (e) {}
    }
    elements.authWrapper.style.display = 'flex';
  }

  elements.btnLogout.addEventListener('click', logout);

  // --- UTILITY FUNCTIONS ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // --- EXPOSE GLOBAL APP API FOR INLINE DOM HANDLERS ---
  window.scApp = {
    sendConnRequest: (to, button) => sendConnectionAction(to, button, {
      type: 'conn_request',
      to
    }),
    respondConn: (from, accepted, button) => sendConnectionAction(from, button, {
      type: 'conn_respond',
      from,
      accepted
    }),
    toggleReaction,
    showReactionPicker,
    startReply,
    promptEdit,
    deleteMessage,
    togglePin,
    jumpToMessage,
    openLightbox,
    togglePlayAudio,
    audioEnded,
    audioTimeUpdate
  };

  function sendConnectionAction(peer, button, payload) {
    const normalizedPeer = peer.toLowerCase();
    if (pendingConnectionActions.has(normalizedPeer)) return;

    pendingConnectionActions.add(normalizedPeer);
    if (button) button.disabled = true;
    sendSocketMessage(payload);

    setTimeout(() => {
      if (!pendingConnectionActions.delete(normalizedPeer)) return;
      refreshContactsList();
      if (state.activeTarget?.type === 'direct' && state.activeTarget.id === normalizedPeer) {
        loadConversation(state.activeTarget);
      }
    }, 3000);
  }

  // --- BOOTSTRAP INITIALIZATION ---
  initEmojiPicker();

  if (state.token) {
    elements.authWrapper.style.display = 'none';
    connectWebSocket();
  } else {
    elements.authWrapper.style.display = 'flex';
  }

})();
