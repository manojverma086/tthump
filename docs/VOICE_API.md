# Voice API (separate repo)

Family-voice cloning (XTTS / ElevenLabs) and the **Sleepytale monthly batch tool** live in:

**https://github.com/manojverma086/voice-api**

```bash
git clone https://github.com/manojverma086/voice-api.git
cd voice-api
cp .env.example .env
npm install
```

That repo provides:

- Local voice server (`npm run dev` on port **8787**)
- XTTS sidecar (`xtts-service/`, port **5002**)
- Sleepytale lullabies (`npm run sleepytale:fetch`) — see [MONTHLY_AUDIO.md](./MONTHLY_AUDIO.md)

## Connect frontend to local voice server

```bash
# Terminal 1 — voice-api repo
cd voice-api && npm run dev

# Terminal 2 — tthump frontend
cd tthump && python3 -m http.server 8765
```

In the browser console:

```js
localStorage.setItem("tapRoarVoiceApi", "http://127.0.0.1:8787");
```

Family voice UI is currently hidden in the frontend until hosting is ready (`FAMILY_VOICE_ENABLED` in `script.js`).

## Migrate secrets from old in-repo folder

If you still have `voice-api/.env` inside **tthump**:

```bash
cp tthump/voice-api/.env voice-api/.env
# Add SLEEPYTALE_API_KEY=sk_live_... for monthly lullabies
```

Then remove `tthump/voice-api/` once migrated.
