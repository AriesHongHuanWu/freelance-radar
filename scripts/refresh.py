import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "feed.json"
BASE = "https://himalayas.app/jobs/api/search"
TRACKS = {
    "AI／資料": r"\b(ai|llm|machine learning|annotat\w*|data scientist|data label\w*|prompt|rater|transcri\w*|linguist|localiz\w*|translation|mandarin)\b",
    "前端／軟體": r"\b(front[ -]?end|full[ -]?stack|web developer|software\b|python|typescript|react|wordpress|webflow|qa\b|quality assurance|automation|backend)\b",
    "影片／音訊": r"\b(video|motion graphics|audio|voice|podcast|multimedia|post.production)\b",
    "UI／產品": r"\b(ux\b|ui\b|product design\w*|web design\w*|visual design\w*|graphic design\w*)\b",
    "3D／CAD": r"\b(cad|openscad|solidworks|3d|mechanical design|robotics|blender)\b",
}
RESTRICTED_TITLE = re.compile(r"\b(us.a? only|u\.s\. based|us based|uk only|europe only|eu only|united states only|canada only|philippines only|india only|usc only)\b", re.I)

def get_page(filters, page):
    query = urlencode({"country": "TW", "employment_type": "Contractor,Part Time,Temporary,Intern",
                       "sort": "recent", "page": page, **filters})
    request = Request(f"{BASE}?{query}", headers={"User-Agent": "FreelanceRadar/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=18) as response:
        payload = json.load(response)
    return payload["jobs"]

def shape(job, now):
    title = job.get("title", "").strip()
    expiry = job.get("expiryDate")
    if not title or not expiry or expiry <= now or RESTRICTED_TITLE.search(title):
        return None
    countries = job.get("locationRestrictions") or []
    if countries and not any(c.lower() in {"taiwan", "tw"} for c in countries):
        return None
    offsets = job.get("timezoneRestrictions") or []
    if offsets and not any(str(o).upper().removeprefix("UTC") in {"+8", "+08", "+08:00", "8"} for o in offsets):
        return None
    by_title = next((name for name, pattern in TRACKS.items() if re.search(pattern, title, re.I)), None)
    if not by_title:
        return None
    link = job.get("applicationLink", "")
    source = job.get("guid", "")
    if not isinstance(source, str) or urlsplit(source).hostname != "himalayas.app" or urlsplit(link).scheme != "https":
        return None
    pay = ""
    lo, hi = job.get("minSalary"), job.get("maxSalary")
    if (lo or hi) and job.get("currency"):
        period = {"hourly":"小時", "weekly":"週", "fortnightly":"兩週", "monthly":"月", "annual":"年"}.get(job.get("salaryPeriod") or "annual", "")
        amount = f"{lo:,}–{hi:,}" if lo and hi and lo != hi else f"{(lo or hi):,}"
        pay = f"{job['currency']} {amount}" + (f"／{period}" if period else "")
    return {
        "id": source, "title": title, "company": job["companyName"],
        "category": by_title, "type": job["employmentType"],
        "region": "台灣列入" if countries else "全球 · 仍查時區",
        "url": link, "sourceUrl": source, "source": "Himalayas", "screen": "未公布",
        "pay": pay, "hourly": (lo or hi or 0) if job.get("currency") == "USD" and job.get("salaryPeriod") == "hourly" else 0,
        "posted": job.get("pubDate"), "expires": expiry, "note": "",
    }

def refresh():
    now = int(time.time())
    searches = [({}, 7), ({"q": "frontend"}, 2), ({"q": "video editor"}, 2),
                ({"q": "product designer"}, 2), ({"q": "AI"}, 3),
                ({"q": "3D"}, 2), ({"q": "software engineer"}, 3),
                ({"q": "traditional chinese"}, 2)]
    seen = {}
    errors = []
    for filters, pages in searches:
        for page in range(1, pages + 1):
            try:
                raw = get_page(filters, page)
            except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as error:
                errors.append(f"{filters.get('q', 'general')}, page {page}: {error}")
                break
            for job in raw:
                item = shape(job, now)
                if item:
                    seen[item["id"]] = item
            if not raw:
                break
            time.sleep(0.3)
    if errors or not seen:
        raise SystemExit("Feed refresh failed; existing snapshot retained. " + "; ".join(errors))
    jobs = sorted(seen.values(), key=lambda item: item["posted"] or 0, reverse=True)
    payload = {"updated": datetime.now(timezone.utc).isoformat(timespec="seconds"), "jobs": jobs}
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Collected {len(jobs)} active feed entries.")

if __name__ == "__main__":
    refresh()

