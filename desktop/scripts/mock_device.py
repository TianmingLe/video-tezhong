import argparse
import json
import sys
import time


def _emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", default="normal")
    parser.add_argument("--trace-id", default="")
    args = parser.parse_args()

    _emit({"ts": int(time.time() * 1000), "level": "info", "service": "mock-device", "msg": "mock_device started", "trace_id": args.trace_id or "trace-001"})

    if args.scenario == "spam":
        for i in range(1100):
            _emit({"ts": int(time.time() * 1000), "level": "info", "service": "mock-device", "msg": f"line {i}", "trace_id": args.trace_id or "trace-001"})
        return 0

    for i in range(3):
        _emit({"ts": int(time.time() * 1000), "level": "info", "service": "mock-device", "msg": f"tick {i}", "trace_id": args.trace_id or "trace-001"})
        time.sleep(0.1)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

