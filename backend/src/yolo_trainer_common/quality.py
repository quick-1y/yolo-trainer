"""Model-quality assessment based on mAP50.

Extracted verbatim from the legacy `train_yolo.py` / `finetune_yolo.py`
scripts (D-24). The returned strings are Russian user-facing output, not
comments — they are intentionally NOT translated.
"""

from __future__ import annotations


def quality_assessment(map50: float) -> str:
    """Classify model quality from an mAP50 score into a Russian-language label."""
    if map50 >= 0.90:
        return "🔥 Отличная модель"
    elif map50 >= 0.75:
        return "👍 Хороший результат"
    elif map50 >= 0.60:
        return "⚠️ Среднее качество (можно улучшить)"
    else:
        return "❌ Требуется дообучение"
