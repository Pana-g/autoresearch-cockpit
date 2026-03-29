"""
One-time migration script: PostgreSQL → SQLite

Reads all data from the running PostgreSQL container and writes it
into the SQLite database at data/autoresearch.db.

Usage:
    cd backend
    python migrate_pg_to_sqlite.py
"""

import sqlite3
from pathlib import Path

import psycopg2

PG_DSN = "host=localhost port=5432 dbname=autoresearch user=postgres password=postgres"
SQLITE_PATH = Path(__file__).parent / "data" / "autoresearch.db"

# Order matters: parent tables first so FK constraints are satisfied.
TABLES = [
    "provider_credentials",
    "projects",
    "runs",
    "workspaces",
    "notification_channels",
    "agent_steps",
    "training_steps",
    "token_usage",
    "artifacts",
    "run_memory",
    "run_notes",
]


def migrate():
    pg = psycopg2.connect(PG_DSN)
    pg.set_client_encoding("UTF8")
    pg_cur = pg.cursor()

    sl = sqlite3.connect(str(SQLITE_PATH))
    sl.execute("PRAGMA journal_mode=WAL")
    sl.execute("PRAGMA foreign_keys=OFF")  # avoid FK issues during bulk insert
    sl_cur = sl.cursor()

    for table in TABLES:
        # Read all rows from PostgreSQL
        pg_cur.execute(f'SELECT * FROM "{table}"')  # noqa: S608
        rows = pg_cur.fetchall()
        if not rows:
            print(f"  {table}: 0 rows (skip)")
            continue

        col_names = [desc[0] for desc in pg_cur.description]
        placeholders = ", ".join(["?"] * len(col_names))
        cols = ", ".join(f'"{c}"' for c in col_names)
        insert_sql = f'INSERT OR IGNORE INTO "{table}" ({cols}) VALUES ({placeholders})'

        # Convert Python booleans to int for SQLite
        converted = []
        for row in rows:
            converted.append(
                tuple(int(v) if isinstance(v, bool) else v for v in row)
            )

        sl_cur.executemany(insert_sql, converted)
        print(f"  {table}: {len(converted)} rows migrated")

    sl.execute("PRAGMA foreign_keys=ON")
    sl.commit()
    sl.close()
    pg_cur.close()
    pg.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    if not SQLITE_PATH.exists():
        print(f"ERROR: SQLite DB not found at {SQLITE_PATH}")
        print("Start the backend once first so the schema is created, then re-run.")
        raise SystemExit(1)
    print(f"Migrating data from PostgreSQL → {SQLITE_PATH}\n")
    migrate()
