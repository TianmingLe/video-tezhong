from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass(frozen=True)
class PromptTemplate:
    system: str
    user: str


class PromptStore:
    def __init__(self, templates: Dict[str, PromptTemplate]):
        self._templates = templates

    @staticmethod
    def from_files(llm_config_path: str) -> "PromptStore":
        cfg = yaml.safe_load(Path(llm_config_path).read_text(encoding="utf-8")) or {}
        prompt_file = cfg.get("prompt_file")
        if not prompt_file:
            raise ValueError("prompt_file is required in llm_config.yaml")

        data: Dict[str, Any] = yaml.safe_load(Path(prompt_file).read_text(encoding="utf-8")) or {}
        templates = {
            k: PromptTemplate(system=v.get("system", ""), user=v.get("user", ""))
            for k, v in data.items()
        }
        return PromptStore(templates)

    def get(self, name: str) -> PromptTemplate:
        return self._templates[name]

