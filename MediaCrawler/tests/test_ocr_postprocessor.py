from services.ocr_postprocessor import OCRPostprocessor


def test_ocr_postprocess_dedup_and_summary():
    blocks = [
        {"text": "A", "confidence": 0.9, "timestamp": "00:00:05", "bbox": [0, 0, 10, 10], "frame_index": 1},
        {"text": "A", "confidence": 0.9, "timestamp": "00:00:10", "bbox": [0, 0, 10, 10], "frame_index": 2},
        {"text": "B", "confidence": 0.9, "timestamp": "00:00:15", "bbox": [0, 0, 10, 10], "frame_index": 3},
    ]
    p = OCRPostprocessor()
    out = p.postprocess(blocks, token_budget_chars=2000)
    assert out["ocr_summary"]["total_blocks"] == 3
    assert out["ocr_summary"]["key_texts"]
    assert "ocr_text" in out

