name: Auto Update Cubmu M3U

on:
  workflow_dispatch: # Mengizinkan eksekusi via pihak ketiga (cron-job.org)

jobs:
  update-m3u:
    runs-on: ubuntu-latest
    permissions:
      contents: write # Diperlukan agar bot bisa menimpa file cubmu.m3u

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install Dependencies & Playwright
        run: |
          npm install playwright
          npx playwright install chromium --with-deps

      - name: Run Scraper (cubmu.js)
        run: node cubmu.js

      - name: Commit & Push Changes
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add cubmu.m3u
          git commit -m "Auto-update Cubmu M3U [skip ci]" || echo "No changes to commit"
          git push
