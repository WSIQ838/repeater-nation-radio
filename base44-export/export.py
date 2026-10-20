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


# Everything else in the app's sidebar. Each one is best-effort: a failure goes
# in PROBLEMS.txt and never stops the rest. Secret VALUES cannot be exported.
EXTRAS = {
    "emails": "/api/apps/{a}/emails",
    "workflows": "/api/apps/{a}/workflows?limit=200&include_archived=true",
    "workflow_runs": "/api/apps/{a}/workflows/runs",
    "domains": "/api/apps/{a}/custom-domains",
    "url_redirects": "/api/apps/{a}/url-redirects",
    "secret_names": "/api/apps/{a}/secrets",
    "backend_functions": "/api/apps/{a}/backend-functions",
    "analytics_event_names": "/api/apps/{a}/analytics/names",
    "sso_settings": "/api/apps/{a}/sso/settings",
    "mcp_config": "/api/apps/platform/{a}/mcp/config",
    "published_url": "/api/apps/platform/{a}/published-url",
    "api_reference": "/api/apps/{a}/openapi-spec",
    "app_info": "/api/apps/{a}",
    "github_connection": "/api/apps/{a}/github/connection",
    "checkpoints": "/api/apps/{a}/checkpoints",
}


def extras(app_id, folder, z, problems):
    got = {}
    for name, path in EXTRAS.items():
        try:
            got[name] = get_json(path.format(a=app_id))
            z.writestr(f"{folder}/settings/{name}.json", json.dumps(got[name], indent=1))
            print(f"   {name} ok")
        except Exception as e:
            problems.append(f"{folder}: {name}: {e}")
            print(f"   {name} FAILED:", e)
    items = got.get("workflows")
    for w in (items if isinstance(items, list) else []):  # full workflow definitions
        try:
            d = get_json(f"/api/apps/{app_id}/workflows/{w['id']}")
            z.writestr(f"{folder}/settings/workflows/{w.get('file_key') or w['id']}.json", json.dumps(d, indent=1))
        except Exception as e:
            problems.append(f"{folder}: workflow {w.get('id')}: {e}")
    for d in (got.get("domains") if isinstance(got.get("domains"), list) else []):
        try:
            dns = get_json(f"/api/apps/{app_id}/custom-domains/{d['id']}/dns-records")
            z.writestr(f"{folder}/settings/domain_dns_{d['id']}.json", json.dumps(dns, indent=1))
        except Exception as e:
            problems.append(f"{folder}: dns {d.get('id')}: {e}")
    try:  # uploaded files / media library
        assets = get_json(f"/api/apps/{app_id}/assets")
        z.writestr(f"{folder}/files/_assets.json", json.dumps(assets, indent=1))
        for a in assets:
            try:
                data = urllib.request.urlopen(urllib.request.Request(a["file_url"]), timeout=300).read()
            except Exception:
                data = get(a["file_url"][len(BASE):]) if a["file_url"].startswith(BASE) else None
            if data is None:
                problems.append(f"{folder}: file {a['file_name']}: could not download")
                continue
            z.writestr(f"{folder}/files/{a['id']}_{a['file_name']}", data)
        print(f"   files: {len(assets)}")
    except Exception as e:
        problems.append(f"{folder}: assets: {e}")
        print("   assets FAILED:", e)


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
            extras(app_id, folder, z, problems)
        if problems:
            z.writestr("PROBLEMS.txt", "\n".join(problems))
    print(f"\nWrote {zname}" + (f" with {len(problems)} problem(s) - see PROBLEMS.txt" if problems else ""))


main()
