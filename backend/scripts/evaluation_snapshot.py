"""Capture allowlisted source files, including uncommitted work, without .env files."""
import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone
from zipfile import ZipFile, ZIP_DEFLATED


def main():
    root = Path(__file__).resolve().parents[2]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = root / "backend/evaluation/runs/baselines" / stamp
    target.mkdir(parents=True, exist_ok=False)
    folders = ["backend/app", "backend/scripts", "backend/tests", "mobile/app", "mobile/components",
               "mobile/lib", "mobile/hooks", "mobile/constants", ".github/workflows"]
    files = {p for folder in folders for p in (root / folder).rglob("*")
             if p.is_file() and p.suffix in {".py", ".ts", ".tsx", ".yml", ".yaml"}
             and "__pycache__" not in p.parts}
    for name in ["backend/requirements.txt", "backend/requirements-eval.txt", "mobile/package.json",
                 "mobile/package-lock.json", "mobile/app.json", "mobile/tsconfig.json"]:
        if (root / name).exists():
            files.add(root / name)
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=root, text=True).strip()
    hashes = {}
    with ZipFile(target / "source.zip", "w", ZIP_DEFLATED) as archive:
        for path in sorted(files):
            name = path.relative_to(root).as_posix()
            data = path.read_bytes()
            hashes[name] = hashlib.sha256(data).hexdigest()
            archive.writestr(name, data)
    corpus = root / "backend/data/final_clean_laws.csv"
    manifest = dict(created_at=datetime.now(timezone.utc).isoformat(), git_revision=git("rev-parse", "HEAD"),
        working_tree=git("status", "--short"), source_sha256=hashes,
        corpus_sha256=hashlib.sha256(corpus.read_bytes()).hexdigest() if corpus.exists() else None,
        index_snapshot=None, deployed_build=None,
        limitations="Allowlisted source snapshot; excludes assets, credentials and external index. Local build only.")
    (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
