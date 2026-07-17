# Monthly Sleepytale lullabies

New **original** sung lullabies are generated in the **[voice-api](https://github.com/manojverma086/voice-api)** repo, then copied here manually.

## Each month

1. In **[voice-api](https://github.com/manojverma086/voice-api)**:
   ```bash
   cp .env.example .env   # SLEEPYTALE_API_KEY=sk_live_...
   npm run sleepytale:fetch
   ```
2. Open `sleepytale-service/output/YYYY-MM/UPLOAD.md`
3. Copy MP3s into this repo under `audio/generated/en/`
4. Add entries to `audio/manifest.json`
5. Optional: add stories/rhymes in `stories/en.json` with `"audio": "audio/generated/en/....mp3"`
6. Run `npm test` and deploy

## Free tier

Sleepytale free plan = **10 credits/month** → **10 lullabies** when using the batch script (1 credit each).

## Classic rhymes

Public-domain rhymes (Twinkle Twinkle, etc.) stay in `audio/rhymes/` via `npm run fetch-audio` — not Sleepytale.

See also: [VOICE_API.md](./VOICE_API.md)
