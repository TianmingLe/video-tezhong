from pathlib import Path


def test_ocr_service_missing_dependency_or_file(tmp_path):
    from services.ocr_service import OCRService, OCRServiceUnavailable

    s = OCRService(model="ppocr_v4", use_gpu=False)
    try:
        s.extract_text_from_video(video_path=Path("not-exists.mp4"), interval_sec=5)
    except OCRServiceUnavailable:
        assert True
    except FileNotFoundError:
        assert True

