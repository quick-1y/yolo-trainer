
import time
import sys
from pathlib import Path

heartbeat = Path(__file__).parent / "output" / "dummy_worker_heartbeat.txt"
for i in range(120):  # would run 120s if never cancelled
    heartbeat.write_text(str(i))
    time.sleep(1)
print("dummy worker completed naturally", flush=True)
