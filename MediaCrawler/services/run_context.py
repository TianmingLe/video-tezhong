from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RunContext:
    run_root: Path
    run_id: str

    def run_dir(self) -> Path:
        return self.run_root / "results" / "runs" / self.run_id

    def output_path(self, *, kind: str, index: int, aweme_id: str) -> Path:
        idx = f"{index:03d}"
        if kind == "mvp_output":
            name = f"mvp_output_{idx}_{aweme_id}.json"
        elif kind == "mvp_analysis":
            name = f"mvp_analysis_{idx}_{aweme_id}.json"
        elif kind == "mvp_report":
            name = f"mvp_report_{idx}_{aweme_id}.md"
        else:
            raise ValueError(f"unknown kind: {kind}")
        return self.run_dir() / name

    def processed_ids_path(self) -> Path:
        return self.run_dir() / f"processed_ids_{self.run_id}.jsonl"

    def dry_run_plan_path(self) -> Path:
        return self.run_dir() / f"dry_run_plan_{self.run_id}.json"

    def kb_index_path(self) -> Path:
        return self.run_dir() / f"kb_index_{self.run_id}.jsonl"

    def kb_tags_path(self) -> Path:
        return self.run_dir() / f"kb_tags_{self.run_id}.json"

    def kb_summary_path(self) -> Path:
        return self.run_dir() / f"kb_summary_{self.run_id}.md"

