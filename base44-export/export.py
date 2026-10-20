#!/usr/bin/env python3
"""Export Base44 apps (source zip + every entity's records + users) into one zip.

Usage:
    BASE44_API_KEY=<your personal API key> python3 export.py [app_id ...]

With no app ids it exports all seven apps listed below.
Output: base44-export-<date>.zip in the current directory.
Needs only the Python standard library.
"""
import datetime, io, json, os, sys, urllib.error, urllib.parse, urllib.request, zipfile

BASE = "https://base44.app"
APPS = {
    "6a6d787f8e808727b935dd09": "Repeater Nation",
    "6ad14e548ab7093160006361": "bb4square",
    "6ad14241b6f9acfd065ad0c4": "BB4S-Church",
    "6a2765fd9a75663622343b5a": "ServerCraft",
    "69a4b3326b6d6e7b6e04026f": "Dr. Andrews Zone",
    "69cf1ca803958691d5c85530": "911 Dispatch Simulator (Copy)",
    "69ceb5b908f892c5d7001088": "DispatchSim",
}
KEY = os.environ.get("BASE44_API_KEY")
if not KEY:
    sys.exit("Set BASE44_API_KEY to your Base44 personal API key first.")


AUTH = {"Authorization": "Bearer " + KEY}


def get(path, **params):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url, headers=AUTH)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from None


def pick_auth():
    """Find which way of sending the key Base44 accepts, or stop."""
    global AUTH
    if KEY == "paste_key_here" or "your_real" in KEY:
        sys.exit("That is the placeholder text, not a real key. Paste your actual key.")
    for hdr in ({"Authorization": "Bearer " + KEY}, {"api_key": KEY}):
        AUTH = hdr
        try:
            get("/api/apps")
            print("Key accepted via", list(hdr)[0])
            return
        except Exception as e:
            print("Tried", list(hdr)[0], "->", e)
    sys.exit("Base44 rejected the key both ways. It is probably the wrong kind of key, "
             "expired, or not copied fully. Create a personal access token and try again.")


def get_json(path, **params):
    return json.loads(get(path, **params))


def entity_names(app_id):
    data = get_json(f"/api/apps/{app_id}/entity-schemas")
    items = data if isinstance(data, list) else data.get("schemas") or data.get("items") or []
    return [s.get("name") or s.get("title") for s in items if s.get("name") or s.get("title")], items


def all_records(app_id, name):
    out, cursor = [], None
    while True:
        page = get_json(f"/api/apps/{app_id}/entities/{name}/v2/list", limit=1000, cursor=cursor)
        out += page["items"]
        if not page.get("has_more"):
            return out
        cursor = page["next_cursor"]


def all_users(app_id):
    out, skip = [], 0
    while True:
        page = get_json(f"/api/apps/{app_id}/entities/User", limit=500, skip=skip)
        out += page
        if len(page) < 500:
            return out
        skip += 500


def main():
    pick_auth()
    ids = sys.argv[1:] or list(APPS)
    stamp = datetime.date.today().isoformat()
    zname = f"base44-export-{stamp}.zip"
    problems = []
    with zipfile.ZipFile(zname, "w", zipfile.ZIP_DEFLATED) as z:
        for app_id in ids:
            folder = (APPS.get(app_id, app_id)).replace("/", "-")
            print(f"== {folder} ({app_id})")
            try:  # source code
                src = get(f"/api/apps/{app_id}/coding/export-to-zip")
                with zipfile.ZipFile(io.BytesIO(src)) as sz:
                    for info in sz.infolist():
                        if not info.is_dir():
                            z.writestr(f"{folder}/source/{info.filename}", sz.read(info))
                print("   source ok")
            except Exception as e:
                problems.append(f"{folder}: source: {e}")
                print("   source FAILED:", e)
            try:  # schemas + records
                names, schemas = entity_names(app_id)
                z.writestr(f"{folder}/data/_entity_schemas.json", json.dumps(schemas, indent=1))
                for n in names:
                    try:
                        recs = all_records(app_id, n)
                        z.writestr(f"{folder}/data/{n}.json", json.dumps(recs, indent=1))
                        print(f"   {n}: {len(recs)}")
                    except Exception as e:
                        problems.append(f"{folder}: {n}: {e}")
                        print(f"   {n} FAILED:", e)
            except Exception as e:
                problems.append(f"{folder}: entities: {e}")
                print("   entities FAILED:", e)
            try:  # users (no passwords are exposed by Base44)
                users = all_users(app_id)
                z.writestr(f"{folder}/data/_users.json", json.dumps(users, indent=1))
                print(f"   users: {len(users)}")
            except Exception as e:
                problems.append(f"{folder}: users: {e}")
                print("   users FAILED:", e)
        if problems:
            z.writestr("PROBLEMS.txt", "\n".join(problems))
    print(f"\nWrote {zname}" + (f" with {len(problems)} problem(s) - see PROBLEMS.txt" if problems else ""))


main()
