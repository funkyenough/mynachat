# Submission screenshots

Seeds a separate local database with realistic sample content, then captures
`screenshots/*.png` (repo root, git-ignored) with headless Chrome (2× desktop, 3× mobile, light theme).
All content is invented; no real accounts or health data.

```bash
npm i -g puppeteer-core            # or install it next to these scripts
rm -f web/data/screenshots.sqlite
# 1. start the app with the seeded DB and the dev stand-ins:
#    DB_PATH=data/screenshots.sqlite DEV_FAKE_WORLD_ID=1 DEV_FAKE_MYNA=1 pnpm --dir web dev
node web/scripts/screenshots/seed.mjs
# 2. stop it, backdate timestamps / set read state (see the note below), then restart
#    WITHOUT the stand-ins so no "(dev)" buttons appear:
#    DB_PATH=data/screenshots.sqlite pnpm --dir web dev
node web/scripts/screenshots/shots.mjs
```

Between the steps, timestamps were spread over the last few days and the viewer's
(`かえで`) read state was set with a short SQLite script, so the board shows "new"
topics and unread reply counts. Opening a topic marks it read, so reset
`thread_reads` before re-running `shots.mjs`. Set `CHROME=` if Chrome lives elsewhere.
