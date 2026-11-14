# 接案雷達

Static tracker for Taiwan-compatible contracts, freelance projects, and part-time roles. GitHub Pages serves `docs/`.

The checked-in feed is the initial snapshot. GitHub Actions refreshes the published snapshot at 08:17 Asia/Taipei daily, subject to GitHub scheduling, and on manual workflow dispatch. Failed refreshes leave the currently published site intact. Source data is from the [Himalayas API](https://himalayas.app/api) plus the public listings maintained in `docs/curated.json`. Eligibility and availability remain subject to each listing. Expired feed records are not displayed. The public repository does not contain personal application records. Browsers save their own notes and statuses, which can be exported or imported as JSON.

Local preview: `python -m http.server 8765 --directory docs`. Refresh the local data: `python scripts/refresh.py`.

