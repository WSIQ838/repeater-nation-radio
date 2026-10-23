import datetime, io, json, os, sys, time, urllib.error, urllib.parse, urllib.request, zipfile

BASE = "https://base44.app"
APPS = {
    "6a6d787f8e808727b935dd09": "Repeater Nation",
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
    for attempt in range(10):
        time.sleep(0.4)  # stay under Base44's rate limit
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 9:
                wait = min(90, int(e.headers.get("Retry-After") or 0) or 5 * (attempt + 1))
                print(f"   rate limited, waiting {wait}s ...")
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from None


def pick_auth():
    global AUTH
    if KEY == "paste_key_here" or "your_real" in KEY or KEY == "your_key":
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
    keys = ("entity_name", "name", "title")
    names = [next(s[k] for k in keys if s.get(k)) for s in items if any(s.get(k) for k in keys)]
    if not names:
        raise RuntimeError(f"no entity names found in schema response: {str(data)[:300]}")
    return names, items


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
    for w in (items if isinstance(items, list) else []):
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
    try:
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
    print("Base44 export script v3 (retries on rate limits)")
    pick_auth()
    ids = sys.argv[1:] or list(APPS)
    stamp = datetime.date.today().isoformat()
    zname = f"base44-export-{stamp}.zip"
    problems = []
    with zipfile.ZipFile(zname, "w", zipfile.ZIP_DEFLATED) as z:
        for app_id in ids:
            folder = (APPS.get(app_id, app_id)).replace("/", "-")
            print(f"== {folder} ({app_id})")
            try:
                src = get(f"/api/apps/{app_id}/coding/export-to-zip")
                with zipfile.ZipFile(io.BytesIO(src)) as sz:
                    for info in sz.infolist():
                        if not info.is_dir():
                            z.writestr(f"{folder}/source/{info.filename}", sz.read(info))
                print("   source ok")
            except Exception as e:
                problems.append(f"{folder}: source: {e}")
                print("   source FAILED:", e)
            try:
                names, schemas = entity_names(app_id)
                z.writestr(f"{folder}/data/_entity_schemas.json", json.dumps(schemas, indent=1))
                for n in [n for n in names if n != "User"]:
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
            try:
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