#!/usr/bin/env python3
"""Load a Base44 export's data/*.json files into the Postgres tables from schema.sql.

Usage: python3 load_data.py <export-app-folder>/data <postgres-url>
Needs: pip install "psycopg[binary]"

Re-runnable: each table is emptied first. Values that don't fit a column's type are
kept (as text) in the "_extra" column and reported, never dropped.
"""
import csv, datetime, io, json, os, sys
import psycopg

BASE = ["id", "created_date", "updated_date", "created_by", "created_by_id", "is_sample"]


def parse_ts(v):
    datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
    return v


def parse_date(v):
    datetime.date.fromisoformat(v[:10])
    return v[:10]


def coerce(v, pgtype):
    """Return (text_for_copy, ok). None means NULL."""
    if v is None or v == "":
        return None, True
    try:
        if pgtype == "jsonb":
            return json.dumps(v), True
        if pgtype == "boolean":
            if isinstance(v, bool):
                return "t" if v else "f", True
            return None, False
        if pgtype in ("double precision", "bigint"):
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                return None, False
            return str(v), True
        if pgtype == "timestamptz":
            return parse_ts(v), True
        if pgtype == "date":
            return parse_date(v), True
        return (v if isinstance(v, str) else json.dumps(v)), True
    except Exception:
        return None, False


def main():
    data_dir, url = sys.argv[1], sys.argv[2]
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute("""select table_name, column_name, data_type from information_schema.columns
                       where table_schema = 'public' order by table_name, ordinal_position""")
        tables = {}
        for t, c, d in cur.fetchall():
            tables.setdefault(t, {})[c] = d
        total_bad = 0
        for name in sorted(tables):
            path = os.path.join(data_dir, f"{name}.json")
            if not os.path.exists(path):
                print(f"{name}: no data file, skipped")
                continue
            rows = json.load(open(path))
            cols = [c for c in tables[name] if c != "_extra"]
            types = {c: ("timestamptz" if tables[name][c].startswith("timestamp") else
                         tables[name][c].replace("character varying", "text")) for c in cols}
            buf, bad = io.StringIO(), 0
            w = csv.writer(buf)
            for r in rows:
                extra = {k: v for k, v in r.items() if k not in tables[name]}
                out = []
                for c in cols:
                    val, ok = coerce(r.get(c), types[c])
                    if not ok:
                        extra[f"_unparsed_{c}"] = r.get(c)
                        bad += 1
                    out.append(val)
                out.append(json.dumps(extra) if extra else None)
                w.writerow(["\\N" if v is None else v for v in out])
            cur.execute(f'truncate "{name}"')
            collist = ", ".join(f'"{c}"' for c in cols + ["_extra"])
            with cur.copy(f'copy "{name}" ({collist}) from stdin with (format csv, null \'\\N\')') as cp:
                cp.write(buf.getvalue())
            total_bad += bad
            print(f"{name}: {len(rows)} rows" + (f", {bad} values kept in _extra" if bad else ""))
        conn.commit()
    print(f"done; {total_bad} values didn't fit their column type" if total_bad else "done; all values fit")


main()
