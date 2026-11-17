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

## 🌐 Deployment to Render

Render runs the Node.js server, while Neon PostgreSQL stores songs persistently and shares updates with all visitors.

1. Create a Neon project and copy its connection string.
2. In Render, create or open the Web Service connected to this repository. Use build command `npm install` and start command `npm start`.
3. In the service's **Environment** settings, add `DATABASE_URL` with the Neon connection string and `ADMIN_PASSWORD` with a unique password of at least 16 characters.
4. Save the settings and deploy. The first API request creates the database table and seeds an empty database from `songs.json`.
5. Open `your-render-url/#/admin` and sign in with the `ADMIN_PASSWORD` value. There is no admin username. Add, edit, delete, or import songs there; changes are saved in Neon and shared with every device.

If the current Render instance has songs that are not in the checked-in `songs.json`, export them from Admin before switching to Neon. After deployment, import that JSON from Admin to move the catalog into the shared database. Keep the Neon connection string and admin password private; do not commit real values to `.env` or source control. Without `DATABASE_URL`, local development continues to use `songs.json`.

---

## 📁 File Structure

- `index.html` — Main responsive application shell and layout
- `app.js` — Client-side router, song loader, search engine, and Admin Panel
- `extras.js` — Fullscreen Worship Mode and WakeLock
- `extras.css` — Theme variables and Worship Mode styling
- `server.js` — Lightweight Node.js server with REST API (`/api/songs`)
- `songs.json` — Starter catalog used to initialize an empty database
- `assets/logo_home.jpg` — First image: Church Emblem (Home page, header, splash)
- `assets/bg_church.jpg` — Second image: Sacred Church Silhouette background watermark
- `letter.txt` — Church Welcome Letter message
- `manifest.webmanifest` & `sw.js` — PWA configuration and offline cache

