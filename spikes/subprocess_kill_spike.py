"""
Phase 0 spike: validate the subprocess.Popen-based job-management design from
docs/roadmap.md section 9.1/5.6 -- specifically, that a spawned training
subprocess can be cleanly cancelled mid-run (process actually terminates,
no orphan/zombie left behind) and that the parent can reliably observe
completion vs. cancellation.

Not part of the shipped application. Throwaway spike code.

NOTE on the GPU-memory-freed acceptance criterion from the roadmap: this
machine has no NVIDIA GPU (confirmed via `nvidia-smi` absence and
Win32_VideoController reporting an AMD Radeon adapter), so the
"verified via nvidia-smi before/after" check from Phase 0's acceptance
criteria cannot be performed here. This script validates the process-
management mechanics only; the GPU-memory-release check must be
re-run on a CUDA-capable host before this is considered fully closed.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

SPIKE_DIR = Path(__file__).parent
OUTPUT_DIR = SPIKE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)
RESULT_FILE = OUTPUT_DIR / "subprocess_kill_result.json"

VENV_PY = SPIKE_DIR / ".venv312" / "Scripts" / "python.exe"

DUMMY_WORKER = SPIKE_DIR / "_dummy_long_running_worker.py"


def write_dummy_worker():
    """A stand-in for train_worker.py: writes a heartbeat file every second
    so the parent (and this test) can observe it's genuinely alive, and
    would otherwise run for far longer than the test waits."""
    DUMMY_WORKER.write_text(
        '''
import time
import sys
from pathlib import Path

heartbeat = Path(__file__).parent / "output" / "dummy_worker_heartbeat.txt"
for i in range(120):  # would run 120s if never cancelled
    heartbeat.write_text(str(i))
    time.sleep(1)
print("dummy worker completed naturally", flush=True)
''',
        encoding="utf-8",
    )


def main():
    write_dummy_worker()
    heartbeat_file = OUTPUT_DIR / "dummy_worker_heartbeat.txt"
    if heartbeat_file.exists():
        heartbeat_file.unlink()

    result = {
        "spawned": False,
        "pid": None,
        "alive_before_cancel": False,
        "heartbeat_observed": False,
        "terminate_call_succeeded": False,
        "process_exited_after_terminate": False,
        "exit_code_after_terminate": None,
        "orphan_check_after_5s": None,
        "gpu_memory_check": "NOT PERFORMED -- no NVIDIA GPU on this host (AMD Radeon confirmed via Win32_VideoController; nvidia-smi absent). Re-run this spike's GPU-memory-freed check on a CUDA-capable host before Phase 7 relies on it.",
    }

    print("Spawning dummy long-running worker subprocess...")
    proc = subprocess.Popen(
        [str(VENV_PY), str(DUMMY_WORKER)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    result["spawned"] = True
    result["pid"] = proc.pid
    print(f"Spawned PID {proc.pid}")

    # Let it run for a few seconds so we can observe it's genuinely alive
    # (heartbeat file updating), mirroring "cancel a job that's mid-training".
    time.sleep(3)
    result["alive_before_cancel"] = proc.poll() is None
    result["heartbeat_observed"] = heartbeat_file.exists() and heartbeat_file.read_text().strip().isdigit()
    print(f"Alive before cancel: {result['alive_before_cancel']}, heartbeat observed: {result['heartbeat_observed']}")

    print("Sending terminate()...")
    proc.terminate()
    result["terminate_call_succeeded"] = True

    try:
        exit_code = proc.wait(timeout=10)
        result["process_exited_after_terminate"] = True
        result["exit_code_after_terminate"] = exit_code
        print(f"Process exited with code {exit_code} after terminate()")
    except subprocess.TimeoutExpired:
        print("terminate() did not stop the process within 10s -- escalating to kill()")
        proc.kill()
        exit_code = proc.wait(timeout=10)
        result["process_exited_after_terminate"] = True
        result["exit_code_after_terminate"] = exit_code
        result["terminate_call_succeeded"] = False  # had to escalate to kill()

    # Confirm no orphan: heartbeat file should stop updating.
    hb_at_cancel = heartbeat_file.read_text().strip() if heartbeat_file.exists() else None
    time.sleep(5)
    hb_after_wait = heartbeat_file.read_text().strip() if heartbeat_file.exists() else None
    result["orphan_check_after_5s"] = {
        "heartbeat_at_cancel": hb_at_cancel,
        "heartbeat_5s_later": hb_after_wait,
        "orphan_detected": hb_at_cancel != hb_after_wait,
    }
    print(f"Orphan check: heartbeat at cancel={hb_at_cancel}, 5s later={hb_after_wait} "
          f"(should be equal -- if different, the process kept running as an orphan)")

    RESULT_FILE.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"\nFull result written to {RESULT_FILE}")

    success = (
        result["spawned"]
        and result["alive_before_cancel"]
        and result["heartbeat_observed"]
        and result["process_exited_after_terminate"]
        and not result["orphan_check_after_5s"]["orphan_detected"]
    )
    print(f"\nSPIKE {'PASSED' if success else 'FAILED'}")
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
