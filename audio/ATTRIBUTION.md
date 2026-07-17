# Prerecorded audio — sources

Audio files are downloaded by `npm run fetch-audio` from [Internet Archive](https://archive.org).

| File | Story ID | Source |
|------|----------|--------|
| `audio/rhymes/en/twinkle-star.mp3` | twinkle-star | [78rpm — Twinkle Twinkle](https://archive.org/details/78_4-twinkle-twinkle-little-star_gbia0198136h) |
| `audio/rhymes/en/baa-baa-black-sheep.mp3` | baa-baa-black-sheep | [78rpm — Jack and Jill set](https://archive.org/details/78_2-jack-and-jill_gbia0210109) |
| `audio/rhymes/en/humpty-dumpty.mp3` | humpty-dumpty | [78rpm — Jack and Jill set](https://archive.org/details/78_2-jack-and-jill_gbia0210109) |
| `audio/rhymes/en/row-your-boat.mp3` | row-your-boat | [78rpm — Robin Hood Players](https://archive.org/details/78_row-row-row-your-boat-the-gingerbread-man_the-robin-hood-players_gbia0534688b) |
| `audio/rhymes/en/itsy-bitsy-spider.mp3` | itsy-bitsy-spider | [Archive — Incy Wincy Spider](https://archive.org/details/incy-wincy-spider) |
| `audio/stories/en/lion-and-mouse.mp3` | lion-and-mouse | [78rpm — Aesop](https://archive.org/details/78_the-lion-and-the-mouse_aesop_gbia0533949b) |
| `audio/stories/en/tortoise-race.mp3` | tortoise-race | [78rpm — Aesop](https://archive.org/details/78_the-tortoise-and-the-hare_sterling-holloway-aesop-idriss-tibbles-paul-fitzpatrick_gbia0459280b) |
| `audio/rhymes/hi/nani-teri-morni.mp3` | nani-teri-morni | [Archive community upload](https://archive.org/details/nani-teri-morni) |
| `audio/rhymes/hi/chanda-mama.mp3` | chanda-mama | [Archive community upload](https://archive.org/details/chanda-mama-dur-ke) |

Historical **78rpm** children’s recordings are generally public domain in the United States. Hindi community uploads may have unclear rights — replace with your own recordings for commercial release if needed.

## Production (rhymes-only)

| Content | Risk for a free hobby site (e.g. GitHub Pages) | Notes |
|---------|--------------------------------------------------|-------|
| Nursery rhyme **lyrics** (Twinkle, Humpty, etc.) | Low | Traditional; widely treated as public domain |
| English **78rpm** rhyme audio | Low–medium | Pre-1928 US recordings; keep links in this file |
| **Itsy Bitsy Spider** (community Archive upload) | Medium | Not a verified 78rpm label release — prefer your own recording before monetizing |
| Hindi **nani-teri-morni** / **chanda-mama** (community uploads) | Medium–high | Rights unclear in India; fine for personal/demo; re-record or license for a paid app |
| **Story** text/audio (currently hidden in app) | N/A until re-enabled | Aesop plots are PD; specific recordings have separate rights |

This is not legal advice. For a commercial product, have a lawyer review or use only audio you recorded or licensed (e.g. Sleepytale exports in `audio/generated/`).

Entries **without** an `audio` field in `stories/*.json` still use gentle browser TTS.

To refresh files: `npm run fetch-audio`
