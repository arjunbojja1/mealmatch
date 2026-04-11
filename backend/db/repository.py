"""
User storage abstraction layer.

Active implementation : SQLiteUserRepository (stdlib sqlite3, zero extra deps).
Future implementation : DynamoDBUserRepository (stub — see class docstring).

Backend selection: set USER_REPO_BACKEND env var (default: "sqlite").
SQLite DB path   : set USER_DB_PATH env var     (default: "mealmatch_users.db").

Swap to DynamoDB:
    1. Install boto3
    2. Implement DynamoDBUserRepository methods per the docstring
    3. Set USER_REPO_BACKEND=dynamodb + AWS env vars
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from abc import ABC, abstractmethod


# ---------------------------------------------------------------------------
# Abstract interface
# ---------------------------------------------------------------------------

class UserRepository(ABC):
    @abstractmethod
    def get_by_email(self, email: str) -> dict | None: ...

    @abstractmethod
    def get_by_id(self, user_id: str) -> dict | None: ...

    @abstractmethod
    def save(self, user: dict) -> None: ...

    @abstractmethod
    def delete(self, email: str) -> None: ...

    @abstractmethod
    def all_users(self) -> list[dict]: ...

    @abstractmethod
    def clear(self) -> None: ...


# ---------------------------------------------------------------------------
# SQLite implementation
# ---------------------------------------------------------------------------

class SQLiteUserRepository(UserRepository):
    """
    Stores users as JSON blobs in a two-column SQLite table:

        users(id TEXT PK, email TEXT UNIQUE, data TEXT)

    Thread-safe: a threading.Lock guards all writes.
    Supports ":memory:" for isolated test runs (shared connection kept alive).
    """

    _DDL = (
        "CREATE TABLE IF NOT EXISTS users "
        "(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, data TEXT NOT NULL)"
    )

    def __init__(self, db_path: str | None = None):
        self._path = db_path or os.getenv("USER_DB_PATH", "mealmatch_users.db")
        self._lock = threading.Lock()
        # One shared connection for both :memory: and file-based DBs.
        # check_same_thread=False is safe because all writes are behind self._lock.
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute(self._DDL)
        self._conn.commit()

    # ── connection helper ────────────────────────────────────────────────────

    def _open(self) -> sqlite3.Connection:
        return self._conn

    # ── reads (no lock needed — SQLite readers don't block) ─────────────────

    def get_by_email(self, email: str) -> dict | None:
        conn = self._open()
        row = conn.execute(
            "SELECT data FROM users WHERE email = ?", (email.lower(),)
        ).fetchone()
        return json.loads(row["data"]) if row else None

    def get_by_id(self, user_id: str) -> dict | None:
        conn = self._open()
        row = conn.execute(
            "SELECT data FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return json.loads(row["data"]) if row else None

    def all_users(self) -> list[dict]:
        conn = self._open()
        rows = conn.execute("SELECT data FROM users").fetchall()
        return [json.loads(r["data"]) for r in rows]

    # ── writes ───────────────────────────────────────────────────────────────

    def save(self, user: dict) -> None:
        email = user["email"].lower()
        with self._lock:
            self._conn.execute(
                "INSERT INTO users (id, email, data) VALUES (?, ?, ?) "
                "ON CONFLICT(email) DO UPDATE SET id=excluded.id, data=excluded.data",
                (user["id"], email, json.dumps(user)),
            )
            self._conn.commit()

    def delete(self, email: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM users WHERE email = ?", (email.lower(),))
            self._conn.commit()

    def clear(self) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM users")
            self._conn.commit()


# ---------------------------------------------------------------------------
# DynamoDB stub
# ---------------------------------------------------------------------------

class DynamoDBUserRepository(UserRepository):
    """
    Future DynamoDB implementation. Activate by:
        1. pip install boto3
        2. Implement all abstract methods (see sketch below)
        3. Set env vars: USER_REPO_BACKEND=dynamodb, AWS_REGION,
           AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or use an instance role)
           DYNAMODB_TABLE_NAME (default: MealMatchUsers)

    Recommended table design:
        Table name   : MealMatchUsers
        Primary key  : email  (String)
        GSI          : id-index  (PK: id String)
        Billing      : PAY_PER_REQUEST

    boto3 sketch:
        import boto3
        table_name = os.getenv("DYNAMODB_TABLE_NAME", "MealMatchUsers")
        self._table = boto3.resource("dynamodb",
            region_name=os.getenv("AWS_REGION")).Table(table_name)

        get_by_email → self._table.get_item(Key={"email": email})["Item"]
        save         → self._table.put_item(Item=user_dict)
        get_by_id    → self._table.query(
                           IndexName="id-index",
                           KeyConditionExpression=Key("id").eq(user_id))["Items"][0]
        delete       → self._table.delete_item(Key={"email": email})
        all_users    → paginate self._table.scan()  [avoid in production; use GSI]
        clear        → paginate scan + batch_writer delete (test/dev only)
    """

    def __init__(self):
        raise NotImplementedError(
            "DynamoDB backend not implemented. "
            "See class docstring for the boto3 integration sketch, "
            "then remove this __init__ override."
        )

    def get_by_email(self, email: str) -> dict | None:
        raise NotImplementedError

    def get_by_id(self, user_id: str) -> dict | None:
        raise NotImplementedError

    def save(self, user: dict) -> None:
        raise NotImplementedError

    def delete(self, email: str) -> None:
        raise NotImplementedError

    def all_users(self) -> list[dict]:
        raise NotImplementedError

    def clear(self) -> None:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_user_repository() -> UserRepository:
    """Return the active repository based on USER_REPO_BACKEND (default: sqlite)."""
    backend = os.getenv("USER_REPO_BACKEND", "sqlite").lower()
    if backend == "dynamodb":
        return DynamoDBUserRepository()
    return SQLiteUserRepository()
