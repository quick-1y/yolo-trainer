"""Model-quality assessment based on mAP50.

Extracted verbatim from the legacy `train_yolo.py` / `finetune_yolo.py`
scripts (D-24). The returned strings are Russian user-facing output, not
comments — they are intentionally NOT translated.

`quality_level` is the language-neutral key (Pitfall 15): the API sends it and the
web UI translates it, while `quality_assessment` keeps the legacy Russian strings.
"""

from __future__ import annotations

_RUSSIAN_LABELS = {
    "excellent": "🔥 Отличная модель",
    "good": "👍 Хороший результат",
    "fair": "⚠️ Среднее качество (можно улучшить)",
    "poor": "❌ Требуется дообучение",
}


def quality_level(map50: float) -> str:
    """Classify an mAP50 score as "excellent" (>= 0.90), "good", "fair" (>= 0.60) or "poor"."""
    if map50 >= 0.90:
        return "excellent"
    elif map50 >= 0.75:
        return "good"
    elif map50 >= 0.60:
        return "fair"
    else:
        return "poor"


def quality_assessment(map50: float) -> str:
    """Classify model quality from an mAP50 score into a Russian-language label."""
    return _RUSSIAN_LABELS[quality_level(map50)]
