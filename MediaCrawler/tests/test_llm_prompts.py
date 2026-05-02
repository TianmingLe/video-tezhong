from pathlib import Path


def test_llm_config_files_exist():
    assert Path("config/llm_config.yaml").exists()
    assert Path("config/prompts.yaml").exists()

