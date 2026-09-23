import glob
from pathlib import Path

root = Path(__file__).parent.parent / "example_ready_dataset"
for split in ["train", "valid", "test"]:
    labels_dir = root / split / "labels"
    files = sorted(labels_dir.glob("*.txt"))
    total_rows = 0
    box_rows = 0   # exactly 5 values
    seg_rows = 0   # more than 6 values (real polygon)
    files_with_seg = []
    for f in files:
        lines = [l.strip() for l in f.read_text().splitlines() if l.strip()]
        for line in lines:
            n = len(line.split())
            total_rows += 1
            if n == 5:
                box_rows += 1
            elif n > 6:
                seg_rows += 1
                if f.name not in files_with_seg:
                    files_with_seg.append(f.name)
            else:
                print(f"  UNEXPECTED column count {n} in {f}")
    print(f"{split}: files={len(files)} total_objects={total_rows} plain_box_rows(5-val)={box_rows} polygon_rows(>6-val)={seg_rows}")
    print(f"  files containing >=1 polygon row: {files_with_seg}")
