"""ISO-8601 run metrics persistence."""
import json
from datetime import datetime, timezone
from pathlib import Path

def utc_now() -> str: return datetime.now(timezone.utc).isoformat()
def write_metrics(path: str, metrics: dict) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(metrics, indent=2, default=str), encoding="utf-8")
