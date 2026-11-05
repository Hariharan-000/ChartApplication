# 🚀 SecureChat Pro — Advanced Real-Time Messenger

[![Run on StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/Hariharan-000/ChartApplication)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Hariharan-000/ChartApplication)

A high-performance, real-time messaging and collaboration web application with fluid glassmorphism UI, spring animations, WebRTC audio/video calling, procedural Web Audio synthesizer, and secure token-based authentication.

---

## 🌐 Instant Run Links

You can run this project online directly from this GitHub repository using any of the following:

1. **Instant Browser Run (No installation required):**
   👉 [**Open and Run on StackBlitz**](https://stackblitz.com/github/Hariharan-000/ChartApplication)
   *(Runs Node.js + Express + WebSockets directly inside your browser)*

2. **Free 24/7 Cloud Deployment (Live Public Web URL):**
   👉 [**Deploy on Render**](https://render.com/deploy?repo=https://github.com/Hariharan-000/ChartApplication)
   *(Creates a free live HTTPS URL like `https://chartapplication.onrender.com`)*

---

## ✨ Features

- **⚡ Real-Time Full-Duplex Messaging:** Instant bidirectional messaging powered by native WebSockets with multi-device fan-out.
- **🎨 Ultra-Animated Aurora Glassmorphism UI:** Built with custom CSS keyframes, spring physics (`cubic-bezier`), dynamic gradients, and 3 vibrant themes (Dark Violet, Cyber Neon, Clean Light).
- **📹 WebRTC Audio & Video Calling:** Peer-to-peer 1-on-1 calls with SDP negotiation, ICE candidate exchange, local/remote camera preview, mute controls, and call pulse animations.
- **🎙️ Voice Memos & Waveform Player:** Record audio directly via MediaRecorder API, upload with base64 streaming, and listen with an animated multi-bar equalizer waveform player.
- **🔍 Smart Fuzzy Search with Levenshtein Distance:** Tokenized AND-matching search engine with typo tolerance, autocomplete suggestions, and color-highlighted keyword chips.
- **📌 Pinning, Reactions & Replies:** Add emoji reactions (`👍`, `❤️`, `🔥`, `😂`, `🎉`, `🚀`, `👏`), quote messages with jump-to-source navigation, and pin important announcements.
- **🖼️ Media Sharing & Lightbox:** Upload and preview image attachments with click-to-zoom modal preview.
- **🔔 Procedural Sound Synthesis:** Zero external sound files — chimes and ringtones generated in real time using the browser's Web Audio API oscillators.
- **📱 Responsive & PWA Ready:** Mobile slide-over drawer layout with installable `manifest.json` for Android and desktop.

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Glassmorphism, Keyframe animations), Vanilla JavaScript (ES2022+), Web Audio API, WebRTC, MediaRecorder.
- **Backend:** Node.js, Express.js, `ws` (High-performance WebSocket server), `cors`.
- **Security & Storage:** PBKDF2 password hashing with SHA-512 and salt, RFC 4122 UUID v4, rolling debounced atomic write-back JSON database.

---

## 💻 Run Locally

```bash
# 1. Clone repository
git clone https://github.com/Hariharan-000/ChartApplication.git

# 2. Enter folder
cd ChartApplication

# 3. Install dependencies
npm install

# 4. Start the server
npm start
```
The server will start at `http://localhost:3000`.

---

## 📄 License
ISC
