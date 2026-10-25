# Growing in His Grace — Bible Quiz Millionaire

A mobile-first web game that can be edited in Acode and hosted on GitHub Pages. Online multiplayer uses Firebase Realtime Database and Anonymous Authentication. Supports up to 50 players per room.

## Features
- Room codes; host creates a room and players join from separate phones.
- 10 supplied Bible questions and answer key.
- 3-second answer window per question; small numbered circle at upper right.
- First correct answer gets ₱1,000, second ₱900, third ₱800, and so on by correct-answer timestamp. This reward ladder repeats for each question; the prize board is never shown.
- Top-three correct-answer popup for approximately 1 second after each question.
- Final total-prize ranking of all players.
- No hints or lifelines.

## A. Firebase setup (required for online multiplayer)
1. Open https://console.firebase.google.com/ and create a project.
2. In **Build → Authentication → Sign-in method**, enable **Anonymous**.
3. In **Build → Realtime Database**, create a database. Choose a region and start in locked mode.
4. In **Project settings → General → Your apps**, create/register a **Web app** and copy its Firebase config.
5. Open `firebase-config.js` in Acode and replace every `PASTE_...` placeholder with the values from your Firebase Web app. Use the exact `databaseURL` shown in Firebase.
6. In Realtime Database → **Rules**, paste `database.rules.json`, then Publish.
   - These are starter rules for a small private event/testing. They allow authenticated clients to read/write room data and are **not cheat-proof**. Do not use for a public competitive event without adding server-side validation (for example, Cloud Functions).
   - Never put service-account keys or other private server credentials in this project.

## B. Publish with GitHub Pages
1. Put `index.html`, `style.css`, `app.js`, `firebase-config.js`, `database.rules.json`, and this file into your existing public repository `growing-in-his-grace`.
2. In GitHub, open **Settings → Pages**. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. Wait for deployment. Open the GitHub Pages HTTPS URL on the host phone and every player phone. ES modules and Firebase need HTTPS or a local development server; opening the HTML directly as `file://` will not work.
4. Host taps **Gumawa ng Room** and shares the 6-character code. Other phones enter a name and the code, then tap **Sumali sa Room**.
5. When all players are in the lobby, the host taps **Simulan ang Laro**. Keep the host phone connected until the game finishes.

## C. Acode editing
- Open the downloaded/extracted project folder in Acode.
- Edit files using the file browser. Keep all five runtime files in the same folder.
- To test online multiplayer, use the deployed HTTPS GitHub Pages URL on the phones. Acode's local preview may not support module imports or HTTPS-dependent Firebase correctly.

## D. Prize settings
`app.js` contains:
- `BASE_PRIZE = 1000`
- `PRIZE_STEP = 100`
- `QUESTION_SECONDS = 3`
- `MAX_PLAYERS = 50`

The first correct response in a round receives ₱1,000, the second ₱900, third ₱800, etc. Players who answer incorrectly or time out receive ₱0 for that question. The prize board is hidden from the player UI. These are game points displayed with a peso symbol, not real money.

## Important limitations
- This is a web app, not a compiled APK. It runs in Android Chrome and can be edited with Acode. You can add it to the home screen from Chrome.
- Firebase client-side code cannot guarantee fair timing or prevent cheating; the supplied starter rules are permissive for prototyping. For a church event with 50 players, test with several phones before the event and use trusted network conditions.
- The 1-second leaderboard is controlled by the host device; slow internet can make the display timing vary slightly across phones.
- Keep the host connected throughout the game. Do not reuse room codes for sensitive data.
