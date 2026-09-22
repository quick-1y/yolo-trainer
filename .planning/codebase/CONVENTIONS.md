---
last_mapped_commit: 229bea01a5922fee6dcff3c76b5dceb1c3e11db9
last_mapped_at: 2026-09-22
---
# Coding Conventions

**Analysis Date:** 2026-09-22

## Naming Patterns

**Files:**

- Snake case with underscores: `train_yolo.py`, `finetune_yolo.py`, `gpu_test.py`
- Descriptive names indicating purpose (train, finetune, test)
- Module files in project root: `C:/Users/admin/PycharmProjects/yolo-trainer/`

**Functions:**

- Snake case throughout: `parse_device()`, `auto_batch()`, `quality_assessment()`, `train()`, `finetune()`
- Descriptive names indicating action/purpose
- Helper functions grouped in "Вспомогательные функции" (Helper Functions) sections
- Main functions named after their primary operation

**Variables:**

- Snake case: `device_str`, `imgsz`, `total_epochs`, `batch`, `verbose_mode`, `gpu_name`, `start_time`, `best_path`
- Loop variables and local variables follow same pattern
- Config dict access uses descriptive names

**Types/Classes:**

- Not applicable - no custom classes defined
- Uses standard library types and Ultralytics YOLO model class

## Code Style

**Formatting:**

- No automated formatter configured (no Black, autopep8, or equivalent)
- Manual formatting observed with consistent 4-space indentation
- Line length appears target ~80-100 characters based on observed code

**Linting:**

- No linting configuration found (.pylintrc, .flake8, etc.)
- Not using PyLint, Flake8, or similar tools
- Style is maintained manually

**Observed conventions:**

- Consistent indentation with 4 spaces
- Blank lines separate logical sections (2 blank lines for major sections)
- Inline spacing consistent around operators

## Import Organization

**Order:**

1. Standard library imports (ultralytics, configparser, torch, os, logging, datetime)
2. Third-party imports (rich - Console, Table, Panel, box)
3. No local imports in observed files

**Path Aliases:**

- Not used in current codebase
- All imports are direct module/class imports

**Examples:**

```python
from ultralytics import YOLO
import configparser
import torch
import os
import logging
from datetime import datetime

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import box
```

## Error Handling

**Patterns:**

- Explicit file existence checks before operations: `if not os.path.exists(base_model_path)`
- Raises `FileNotFoundError` with descriptive message: `raise FileNotFoundError(f"Модель не найдена: {base_model_path}")`
- Config dict access with fallbacks: `config.getboolean("verbose", fallback=False)`
- Type-safe config access using methods: `config.getint()`, `config.getfloat()`, `config.getboolean()`
- Console error printing before exceptions: `console.print(f"[bold red]❌ Модель не найдена: {base_model_path}[/bold red]")`

**Example:**

```python
if not os.path.exists(base_model_path):
    console.print(f"[bold red]❌ Модель не найдена: {base_model_path}[/bold red]")
    raise FileNotFoundError(f"Модель не найдена: {base_model_path}")
```

## Logging

**Framework:** Python `logging` module

**Patterns:**

- Logger obtained by name: `logging.getLogger("ultralytics")`
- Level set conditionally based on verbose mode: `setLevel(logging.INFO)` or `setLevel(logging.CRITICAL)`
- Rich Console used for formatted UI output, not for logging
- Verbose mode controlled via config: `verbose_mode = config.getboolean("verbose", fallback=False)`

**When to log:**

- Toggle Ultralytics library logging based on verbose mode
- Console printing for user-facing messages (using Rich)
- Quiet mode suppresses non-critical logs

**Example:**

```python
if verbose_mode:
    logging.getLogger("ultralytics").setLevel(logging.INFO)
    console.print("📢 Режим вывода: [bold yellow]ПОДРОБНЫЙ[/bold yellow] (логи Ultralytics)")
else:
    logging.getLogger("ultralytics").setLevel(logging.CRITICAL)
    console.print("📢 Режим вывода: [bold]МИНИМАЛЬНЫЙ[/bold] (только итоговые метрики)")
```

## Comments

**When to Comment:**

- Section dividers for major logical blocks: use `# ==============================` pattern
- Section titles with Cyrillic descriptions: `# Основное обучение` (Main training)
- Helper function groups labeled: `# Вспомогательные функции` (Helper functions)
- Inline comments on specific logic decisions
- Comments in Russian matching codebase locale

**Style:**

- Decorative headers with `====` repeated (minimum 8-12 times)
- Section titles in comments directly below decorative line
- Inline comments preceded by space after `#`

**JSDoc/Documentation:**

- No docstrings observed
- Not using type hints
- Function purposes inferred from names and section comments

## Function Design

**Size:** 

- Helper functions range 5-10 lines (`parse_device`, `auto_batch`, `quality_assessment`)
- Main functions (`train`, `finetune`) 50-100 lines including output formatting
- Single responsibility principle: each function has one clear purpose

**Parameters:**

- Single `config` parameter of type ConfigParser section for main functions
- Simple parameters for utility functions (`device_str`, `map50`)
- Config object used for all configuration access
- No type hints used

**Return Values:**

- Utility functions return computed values: `parse_device()` returns device, `quality_assessment()` returns string
- Main functions return `None` (perform operations, print output, no return statement)
- Status communicated via console output and side effects

**Example utility:**

```python
def parse_device(device_str):
    device_str = device_str.strip()
    if device_str.lower() == "cpu":
        return "cpu"
    if "," in device_str:
        return [int(d) for d in device_str.split(",")]
    return int(device_str)
```

## Module Design

**Exports:**

- Each module has one primary function (`train()` in `train_yolo.py`, `finetune()` in `finetune_yolo.py`)
- Helper functions accessible but not explicitly exported
- Module run as script via `if __name__ == "__main__"` block

**Main block pattern:**

```python
if __name__ == "__main__":
    conf = configparser.ConfigParser()
    conf.read("config/config.ini")
    train(conf["Train"])  # or finetune(conf["Finetune"])
```

**Barrel Files:**

- Not used in current structure

---

*Convention analysis: 2026-09-22*
