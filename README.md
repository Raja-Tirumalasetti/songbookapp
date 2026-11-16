# Maranatha Visvasa Samajam - Songs Book (మరనాత పాటల పుస్తకం)

A Christian Songbook and Worship Progressive Web App (PWA) created for **Maranatha Visvasa Samajam** (**మరనాత విశ్వాస సమాజము**).

> **ప్రేమ - త్యాగం · For God & Country**

---

## 🌟 Key Features

1. **Custom Church Branding**:
   - **First Image (`assets/logo_home.jpg`)**: Featured in the **Home Hero Section** with a golden glowing seal, in the top navigation brand header, on the splash screen, and as the application icon.
   - **Second Image (`assets/bg_church.jpg`)**: Positioned as an ambient **Background Watermark Layer** across the entire app and worship screen, with gentle illumination that maintains 100% text readability.
   - Church Name in English & Telugu: **Maranatha Visvasa Samajam** / **మరనాత విశ్వాస సమాజము**
   - Motto: **ప్రేమ - త్యాగం · For God & Country**

2. **Full Admin Panel to Add & Manage Songs Manually**:
   - Open the top-left navigation menu and select **Admin** (`#/admin`).
   - Admin actions require a server-side password configured with the `ADMIN_PASSWORD` environment variable.
   - **Add New Song Manually**:
     - Song Title (Telugu or Romanized English)
     - Day Number (Day 1 - 5 or custom days)
     - Category (Worship, Praise, Devotional, Thanksgiving, Opening, Communion, Offering, Youth, Christmas, Special)
     - Artist / Choir / Author
     - Telugu Lyrics (`te`) with stanza support
     - Romanized Lyrics (`rom`)
     - English Meaning / Translation (`en`)
     - "✨ Fill Sample Telugu Hymn" button for 1-click testing
   - **Manage Existing Songs**:
     - Instant search and filtering of all 117+ songs in the library
     - Edit existing songs (updates titles, lyrics, categories, days)
     - Delete songs with confirmation
   - **Backup & Export**:
     - One-click **Download songs.json** to save the updated library to your computer
     - Import JSON files to add songs in bulk

3. **Dual Persistence Architecture**:
   - **Server Mode**: When running with Node (`node server.js` or `npm start`), songs added or edited in the Admin panel are saved directly to `songs.json` on disk!
   - **Offline / Static Mode**: Song browsing works offline. Adding, editing, or deleting songs requires the authenticated Node.js server.

4. **Worship Mode (Distraction-Free Church Display)**:
   - Fullscreen lyrics view
   - **Screen WakeLock**: Prevents mobile screen from sleeping or dimming during church worship service
   - Font zoom controls (`A+` / `A-`)
   - Language switcher (`తెలుగు` / `English`)
   - Swipe gestures (left/right) & keyboard arrow shortcuts
   - Tap lyrics to toggle controls

5. **White & Rose Color Scheme**:
   - White surfaces with a rose accent palette throughout the app.

6. **100% Offline Progressive Web App (PWA)**:
   - Cached with Service Worker
   - Works without an internet connection
   - Installable on Android, iPhone, Windows, and Mac as a native-like app.

---

## 🚀 How to Run Locally

### Option 1: Node.js Server (Recommended for Direct Disk Saving)

```bash
# In the project directory:
npm start
# OR:
node server.js
```

Before starting the server, create a local `.env` file and set a strong, unique password:

```env
ADMIN_PASSWORD=replace-with-a-long-random-password
```

You can start from `.env.example`, then replace the placeholder with a random password of at least 16 characters. The `.env` file is excluded from Git. Configure the same environment variable in your hosting provider to enable admin sign-in.

Then open your browser and navigate to:
**http://localhost:3000**

- Home page: `http://localhost:3000/#/`
- Admin panel: `http://localhost:3000/#/admin` (requires the configured administrator password)

---

## 🌐 Deployment

The included `server.js` is a long-running Node.js HTTP server. Deploy it on a Node.js host that supports running this server and persistent storage for `songs.json`.

Set `ADMIN_PASSWORD` in the host's environment configuration before deploying. It must contain at least 16 characters. Static-only hosting can serve the songbook, but administrator sign-in and song changes require the Node.js API. Vercel deployment needs an adapter for its function runtime and persistent storage; that adapter is not included here.

---

## 📁 File Structure

- `index.html` — Main responsive application shell and layout
- `app.js` — Client-side router, song loader, search engine, and Admin Panel
- `extras.js` — Fullscreen Worship Mode and WakeLock
- `extras.css` — Theme variables and Worship Mode styling
- `server.js` — Lightweight Node.js server with REST API (`/api/songs`)
- `songs.json` — Song database containing 117+ Christian worship songs
- `assets/logo_home.jpg` — First image: Church Emblem (Home page, header, splash)
- `assets/bg_church.jpg` — Second image: Sacred Church Silhouette background watermark
- `letter.txt` — Church Welcome Letter message
- `manifest.webmanifest` & `sw.js` — PWA configuration and offline cache

