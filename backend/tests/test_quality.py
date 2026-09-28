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
