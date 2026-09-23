import io
import json
import os
import sys

from ultralytics import YOLO


sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


def run_detection(input_path, output_path):
    model_path = os.environ.get("YOLO_MODEL_PATH", "best.pt")
    model = YOLO(model_path)

    results = model(input_path, verbose=False)
    results[0].save(filename=output_path)

    counts = {"bus": 0, "car": 0, "freight": 0, "truck": 0, "van": 0}
    names = model.names

    for box in results[0].boxes:
        cls_name = names[int(box.cls)].lower()

        if "bus" in cls_name:
            counts["bus"] += 1
        elif "freight" in cls_name:
            counts["freight"] += 1
        elif "truck" in cls_name:
            counts["truck"] += 1
        elif "van" in cls_name:
            counts["van"] += 1
        else:
            counts["car"] += 1

    print("SUCCESS_JSON:" + json.dumps(counts, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("ERROR: usage: python detect.py <input_image> <output_image>")
        sys.exit(1)

    try:
        run_detection(sys.argv[1], sys.argv[2])
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
