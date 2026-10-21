from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


def stamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else _hash_stream(handle)


def _hash_stream(handle) -> str:
    result = hashlib.sha256()
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        result.update(chunk)
    return result.hexdigest()


def normalize_label(label: str) -> str:
    label = label.strip()
    for start, end in ((r"\[", r"\]"), (r"\(", r"\)"), ("$$", "$$"), ("$", "$")):
        if label.startswith(start) and label.endswith(end):
            label = label[len(start):-len(end)].strip()
            break
    if not label or len(label) > 4000:
        raise ValueError("Empty or oversized human transcription")
    return label


def canonical_image(path: Path) -> tuple[Image.Image, str, str]:
    with Image.open(path) as original:
        if original.width * original.height > 16_000_000:
            raise ValueError("Oversized image")
        image = ImageOps.exif_transpose(original).convert("RGBA")
        paper = Image.new("RGBA", image.size, "white")
        paper.alpha_composite(image)
        image = paper.convert("RGB")
    # Ignore lossless encoding and white margins in duplicate identity.
    bbox = ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
    if not bbox:
        raise ValueError("Blank image")
    image = image.crop(bbox)
    pixels = image.convert("L")
    if sum(count for value, count in enumerate(pixels.histogram()) if value < 200) < 10:
        raise ValueError("Insufficient visible handwriting")
    identity = hashlib.sha256(f"{image.width}x{image.height}:".encode() + image.tobytes()).hexdigest()
    small = list(pixels.resize((9, 8)).getdata())
    dhash = sum((small[y * 9 + x] > small[y * 9 + x + 1]) << (y * 8 + x) for y in range(8) for x in range(8))
    return image, identity, f"{dhash:016x}"


class Registry:
    """One local authoritative ledger. No reset, force-retrain or resume operation."""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        marker, db = self.root / "registry-id.json", self.root / "registry.sqlite3"
        if marker.exists() != db.exists():
            raise ValueError("Incomplete training registry. Restore the WHOLE registry; never recreate its ledger.")
        if not marker.exists():
            if any(self.root.iterdir()):
                raise ValueError("Nonempty training directory without ledger; refusing to initialize")
            # Exclusive creation prevents two initializers from silently making independent ledgers.
            with marker.open("x", encoding="utf-8") as handle:
                json.dump({"registry_id": uuid.uuid4().hex, "schema": 1}, handle)
        self.identity = json.loads(marker.read_text(encoding="utf-8"))["registry_id"]
        self.db = sqlite3.connect(db, timeout=20)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS samples (
              hash TEXT PRIMARY KEY, sample_id TEXT UNIQUE NOT NULL, label TEXT NOT NULL,
              writer TEXT NOT NULL, dhash TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0,
              split TEXT, reviewed_at TEXT, reviewer TEXT, image_sha256 TEXT NOT NULL,
              source_metadata TEXT NOT NULL, source_sha256 TEXT NOT NULL, quarantined INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS aliases (sample_id TEXT PRIMARY KEY, hash TEXT NOT NULL REFERENCES samples(hash));
            CREATE TABLE IF NOT EXISTS writers (writer TEXT PRIMARY KEY, split TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, status TEXT NOT NULL, manifest TEXT NOT NULL,
              created_at TEXT NOT NULL, completed_at TEXT, detail TEXT);
            CREATE TABLE IF NOT EXISTS uses (hash TEXT PRIMARY KEY REFERENCES samples(hash), run_id TEXT NOT NULL REFERENCES runs(id));
        """)
        self.audit()

    def close(self):
        self.db.close()

    @contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def audit(self):
        if self.db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Corrupt training ledger")
        # A restored/stale DB cannot silently reuse images recorded by newer on-disk receipts.
        receipts = {path.parent.name for path in (self.root / "runs").glob("*/reservation.json")}
        runs = {row["id"]: json.loads(row["manifest"]) for row in self.db.execute("SELECT * FROM runs")}
        if receipts != set(runs):
            raise ValueError("Run receipts/ledger mismatch. Fail-closed: restore a consistent complete backup.")
        for run_id, manifest in runs.items():
            receipt = json.loads((self.root / "runs" / run_id / "reservation.json").read_text(encoding="utf-8"))
            if receipt != manifest or manifest["registry_id"] != self.identity:
                raise ValueError("Modified training manifest or wrong registry")
            used = {r[0] for r in self.db.execute("SELECT hash FROM uses WHERE run_id=?", (run_id,))}
            if used != {r["hash"] for r in manifest["train"]}:
                raise ValueError("Sample-use ledger mismatch")

    def scan(self, source: Path, repo: Path) -> dict:
        source = source.resolve()
        counts = {"imported": 0, "duplicates": 0, "rejected": []}
        for path in sorted((source / "metadata").glob("*.json")):
            try:
                meta = json.loads(path.read_text(encoding="utf-8"))
                if meta.get("consent") is not True or meta.get("human_verified") is not True:
                    raise ValueError("Missing explicit consent/human verification; legacy data is not implicitly approved")
                writer = str(meta.get("writer_id", "")).strip()
                if not writer or writer in ("anonymous", "unknown", "qa-synthetic-exclude"):
                    raise ValueError("Named pseudonymous writer required; anonymous/QA samples excluded")
                sample_id = str(meta["sample_id"])
                if not sample_id or len(sample_id) > 150:
                    raise ValueError("Invalid sample ID")
                image_path = Path(meta["image_path"])
                image_path = (repo / image_path).resolve() if not image_path.is_absolute() else image_path.resolve()
                if not image_path.is_relative_to(source / "images"):
                    raise ValueError("Image path escapes source/images")
                label = normalize_label(meta["ground_truth_latex"])
                image, identity, dhash = canonical_image(image_path)
                with self.transaction():
                    previous = self.db.execute("SELECT * FROM samples WHERE hash=?", (identity,)).fetchone()
                    alias = self.db.execute("SELECT hash FROM aliases WHERE sample_id=?", (sample_id,)).fetchone()
                    if alias and alias[0] != identity:
                        raise ValueError("Existing sample ID changed image content")
                    if previous and (previous["label"] != label or previous["writer"] != writer):
                        raise ValueError("Duplicate image has conflicting label/writer; manual investigation required")
                    if not previous:
                        objects = self.root / "objects"; objects.mkdir(exist_ok=True)
                        dest = objects / f"{identity}.png"
                        if dest.exists():
                            raise ValueError("Untracked object already exists; investigate interrupted import")
                        image.save(dest, format="PNG")
                        self.db.execute("INSERT INTO samples(hash,sample_id,label,writer,dhash,image_sha256,source_metadata,source_sha256) VALUES(?,?,?,?,?,?,?,?)", (identity, sample_id, label, writer, dhash, digest(dest), str(path.resolve()), digest(path)))
                    self.db.execute("INSERT OR IGNORE INTO aliases VALUES(?,?)", (sample_id, identity))
                counts["duplicates" if previous else "imported"] += 1
            except (ValueError, KeyError, OSError, sqlite3.IntegrityError) as error:
                if str(error).startswith("Duplicate image has conflicting"):
                    self.db.execute("UPDATE samples SET quarantined=1 WHERE hash=?", (identity,))
                    self.db.commit()
                counts["rejected"].append({"file": path.name, "reason": str(error)})
        return counts

    def status(self) -> dict:
        rows = [dict(row) for row in self.db.execute("SELECT s.*,u.run_id FROM samples s LEFT JOIN uses u ON s.hash=u.hash ORDER BY sample_id")]
        for row in rows:
            row["near_duplicates"] = [other["sample_id"] for other in rows if other["hash"] != row["hash"] and (int(row["dhash"], 16) ^ int(other["dhash"], 16)).bit_count() <= 3]
        return {"registry_id": self.identity, "samples": rows, "runs": [dict(r) for r in self.db.execute("SELECT id,status,created_at,completed_at,detail FROM runs ORDER BY created_at")]}

    def review(self, sample_id: str, split: str, reviewer: str, checked_near_duplicates: bool = False):
        if split not in ("train", "validation", "test") or not reviewer.strip():
            raise ValueError("Explicit split and reviewer are required")
        with self.transaction():
            row = self.db.execute("SELECT s.* FROM samples s JOIN aliases a ON s.hash=a.hash WHERE a.sample_id=?", (sample_id,)).fetchone()
            if row is None:
                raise ValueError("Unknown sample")
            if row["quarantined"]:
                raise ValueError("Conflicting duplicate is quarantined; cannot approve for training")
            if self.db.execute("SELECT 1 FROM uses WHERE hash=?", (row["hash"],)).fetchone():
                raise ValueError("Consumed/reserved images cannot be relabeled, repartitioned or reused")
            previous = self.db.execute("SELECT split FROM writers WHERE writer=?", (row["writer"],)).fetchone()
            if previous and previous[0] != split:
                raise ValueError("Writer already belongs to another split; no train/evaluation leakage allowed")
            near = [r for r in self.db.execute("SELECT hash,dhash FROM samples WHERE hash!=?", (row["hash"],)) if (int(r["dhash"], 16) ^ int(row["dhash"], 16)).bit_count() <= 3]
            if near and not checked_near_duplicates:
                raise ValueError("Near-duplicate candidates exist; inspect images before --checked-near-duplicates")
            if row["approved"] and row["split"] != split:
                raise ValueError("Approved split is immutable")
            self.db.execute("INSERT OR IGNORE INTO writers VALUES(?,?)", (row["writer"], split))
            self.db.execute("UPDATE samples SET approved=1,split=?,reviewed_at=?,reviewer=? WHERE hash=?", (split, stamp(), reviewer.strip(), row["hash"]))

    def plan(self) -> dict:
        self.audit()
        if self.db.execute("SELECT 1 FROM runs WHERE status='running'").fetchone():
            raise ValueError("A run is active or was interrupted. No automatic retry/unlock is allowed.")
        groups = {}
        for split in ("train", "validation", "test"):
            rows = self.db.execute("SELECT s.* FROM samples s LEFT JOIN uses u ON s.hash=u.hash WHERE s.approved=1 AND s.quarantined=0 AND s.split=? AND u.hash IS NULL ORDER BY s.hash", (split,))
            groups[split] = [dict(r) for r in rows]
        return {"registry_id": self.identity, **groups}

    def verify_objects(self, manifest: dict):
        for split in ("train", "validation", "test"):
            for sample in manifest[split]:
                path = self.root / "objects" / f"{sample['hash']}.png"
                if digest(path) != sample["image_sha256"]:
                    raise ValueError("Training image was modified after review")
                if digest(Path(sample["source_metadata"])) != sample["source_sha256"]:
                    raise ValueError("Source consent/label metadata changed after import; training is blocked")

    def reserve(self, expected_plan: dict, config: dict) -> tuple[str, dict]:
        with self.transaction():
            plan = self.plan()
            if plan != expected_plan:
                raise ValueError("Dataset changed after preflight. Review a new plan.")
            if not plan["train"] or not plan["validation"]:
                raise ValueError("At least one reviewed train writer and a separate validation writer are required")
            self.verify_objects(plan)
            run_id = uuid.uuid4().hex
            manifest = {**plan, "run_id": run_id, "config": config, "created_at": stamp()}
            run_dir = self.root / "runs" / run_id; run_dir.mkdir(parents=True)
            # Receipt is written BEFORE the DB transaction commits. A crash between these
            # writes intentionally blocks all future runs rather than risking reuse.
            with (run_dir / "reservation.json").open("x", encoding="utf-8") as handle:
                json.dump(manifest, handle, ensure_ascii=False, indent=2)
                handle.flush()
                import os
                os.fsync(handle.fileno())
            self.db.execute("INSERT INTO runs(id,status,manifest,created_at) VALUES(?,?,?,?)", (run_id, "running", json.dumps(manifest, ensure_ascii=False), manifest["created_at"]))
            self.db.executemany("INSERT INTO uses VALUES(?,?)", [(r["hash"], run_id) for r in plan["train"]])
        return run_id, manifest

    def finish(self, run_id: str, status: str, detail: str):
        if status not in ("completed", "failed"):
            raise ValueError("Invalid final run status")
        with self.transaction():
            cursor = self.db.execute("UPDATE runs SET status=?,completed_at=?,detail=? WHERE id=? AND status='running'", (status, stamp(), detail, run_id))
            if cursor.rowcount != 1:
                raise ValueError("Run already finalized or unknown")
        # No deletion from uses, even on failure. No checkpoint resume.
