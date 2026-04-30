import json
from pathlib import Path
from typing import Any, Dict, Optional, Protocol

from services.llm_cache import LLMCache
from services.llm_analyzer import LLMAnalyzer, LLMRuntimeConfig
from services.llm_prompts import PromptStore
from services.report_renderer import render_report


class AnalyzerLike(Protocol):
    async def analyze(self, **kwargs) -> Dict[str, Any]: ...


class AnalysisPipeline:
    def __init__(
        self,
        *,
        analyzer: Optional[AnalyzerLike] = None,
        llm_config_path: str = "config/llm_config.yaml",
        output_analysis_file: Path = Path("results/mvp_analysis.json"),
        output_report_file: Optional[Path] = Path("results/mvp_report.md"),
        input_mvp_output_file: Path = Path("results/mvp_output.json"),
    ) -> None:
        self.llm_config_path = llm_config_path
        self.output_analysis_file = output_analysis_file
        self.output_report_file = output_report_file
        self.input_mvp_output_file = input_mvp_output_file

        self._analyzer = analyzer

    def _write_json(self, path: Path, data: Dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _write_text(self, path: Path, text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def _build_default_analyzer(self) -> LLMAnalyzer:
        try:
            import yaml  # type: ignore
        except Exception as e:
            raise ModuleNotFoundError("PyYAML is required for loading llm_config.yaml") from e

        cfg = yaml.safe_load(Path(self.llm_config_path).read_text(encoding="utf-8")) or {}
        store = PromptStore.from_files(self.llm_config_path)

        cache_ttl = int(cfg.get("cache_ttl_seconds") or 1800)
        cache = LLMCache(ttl_seconds=cache_ttl)

        runtime = LLMRuntimeConfig(
            temperature=float(cfg.get("temperature") or 0.2),
            max_tokens=int(cfg.get("max_tokens") or 1200),
            timeout_s=int(cfg.get("timeout_s") or 60),
        )
        return LLMAnalyzer(prompt_store=store, cache=cache, runtime=runtime)

    async def run(self, *, model: str, api_base: str, api_key: str) -> Dict[str, Any]:
        """
        读取 MVPPipeline 的输出（mvp_output.json），进行 LLM 分析并输出：
        - results/mvp_analysis.json
        - results/mvp_report.md
        """

        try:
            mvp = json.loads(self.input_mvp_output_file.read_text(encoding="utf-8"))
            video_url = str(mvp.get("video_url") or "")
            transcript = str(mvp.get("transcript") or "")
            aweme_id = str(mvp.get("aweme_id") or "")
            source_keyword = str(mvp.get("source_keyword") or "")
            liked_count = mvp.get("liked_count")
            comments = mvp.get("comments")

            analyzer = self._analyzer or self._build_default_analyzer()
            analysis = await analyzer.analyze(
                model=model,
                api_base=api_base,
                api_key=api_key,
                video_topic=video_url,
                transcript=transcript,
                comments=comments,
                ocr_text="",
            )

            analysis_out = {
                "video_url": video_url,
                "aweme_id": aweme_id,
                "source_keyword": source_keyword,
                "liked_count": liked_count,
                "status": analysis.get("status", "success"),
                **analysis,
            }
            self._write_json(self.output_analysis_file, analysis_out)

            if self.output_report_file is not None:
                md = render_report(
                    video_url=video_url,
                    transcript=transcript,
                    valuable_comments=(analysis.get("comment_value_judge") or {}).get("items") or [],
                    knowledge_points=analysis.get("knowledge_points") or [],
                    suggestions=analysis.get("suggestions") or [],
                    community_insights=analysis.get("community_insights") or {},
                )
                self._write_text(self.output_report_file, md)

            return analysis_out

        except Exception as e:
            out = {
                "status": "error",
                "error_code": "ERR_ANALYSIS_IO",
                "error_message": str(e),
            }
            self._write_json(self.output_analysis_file, out)
            if self.output_report_file is not None:
                self._write_text(self.output_report_file, f"# MVP 分析报告\n\n分析失败：{e}\n")
            return out
