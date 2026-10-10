"""Unit tests for yolo_trainer_common.quality (quality_assessment thresholds)."""

from __future__ import annotations

from yolo_trainer_common.quality import quality_assessment


class TestQualityAssessment:
    def test_excellent_at_090(self):
        assert quality_assessment(0.90) == "🔥 Отличная модель"

    def test_good_just_below_090(self):
        assert quality_assessment(0.8999) == "👍 Хороший результат"

    def test_good_at_075(self):
        assert quality_assessment(0.75) == "👍 Хороший результат"

    def test_average_just_below_075(self):
        assert quality_assessment(0.7499) == "⚠️ Среднее качество (можно улучшить)"

    def test_average_at_060(self):
        assert quality_assessment(0.60) == "⚠️ Среднее качество (можно улучшить)"

    def test_needs_training_just_below_060(self):
        assert quality_assessment(0.5999) == "❌ Требуется дообучение"


class TestQualityLevel:
    """Language-neutral verdict key the UI translates (Pitfall 15)."""

    def test_levels_at_the_thresholds(self):
        from yolo_trainer_common.quality import quality_level

        assert quality_level(0.90) == "excellent"
        assert quality_level(0.8999) == "good"
        assert quality_level(0.75) == "good"
        assert quality_level(0.7499) == "fair"
        assert quality_level(0.60) == "fair"
        assert quality_level(0.5999) == "poor"


def _summary(map50: float | None) -> dict:
    from datetime import UTC, datetime

    from yolo_trainer_api.schemas import RunSummary

    return RunSummary(
        id=1,
        project_id=1,
        name="run-1",
        status="completed",
        task_type="detect",
        base_kind="official",
        base_name="yolo26n",
        map50=map50,
        created_at=datetime(2026, 1, 15, 10, 0, tzinfo=UTC),
    ).model_dump(mode="json")


class TestRunSummaryQuality:
    def test_quality_follows_map50(self):
        assert _summary(0.812)["quality"] == "good"

    def test_quality_is_null_without_map50(self):
        assert _summary(None)["quality"] is None
