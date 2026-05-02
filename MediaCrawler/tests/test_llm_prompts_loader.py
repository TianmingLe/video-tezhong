from services.llm_prompts import PromptStore


def test_prompt_store_loads_templates():
    store = PromptStore.from_files("config/llm_config.yaml")
    tpl = store.get("knowledge_extract")
    assert "{transcript}" in tpl.user

