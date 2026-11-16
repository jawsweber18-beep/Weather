"""Tests for surf briefing calculation logic (port of TypeScript to Python).

The TypeScript code in src/lib/surf/briefing.server.ts computes daily averages
from Stormglass hourly wave data.  This module re-implements the core algorithms
in pure Python so we can unit-test them without a browser or network.
"""

import math
import unittest
from typing import List, Dict, Any, Optional


# ---------------------------------------------------------------------------
# Helpers ported from the TS source
# ---------------------------------------------------------------------------

def deg_to_cardinal(deg: float) -> str:
    """Convert degrees to 8-point cardinal direction.
    
    Matches the TypeScript implementation which uses JS modulo behavior.
    In JS: -90 % 360 = -90, then ((-90 + 360) % 360) = 270.
    Python: -90 % 360 = 270 (already non-negative), then ((270 + 360) % 360) = 270.
    Same result. But to be safe, normalize first.
    """
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    normalized = deg % 360
    if normalized < 0:
        normalized += 360
    index = round(normalized / 45) % 8
    return directions[index]


def round1(value: float) -> float:
    """Round to 1 decimal place (standard rounding)."""
    return round(value, 1)


# ---------------------------------------------------------------------------
# Types (represented as dicts in Python tests)
# ---------------------------------------------------------------------------

SwellComponent = Dict[str, Any]
SurfSpot = Dict[str, Any]
SurfDayPoint = Dict[str, Any]
SurfBriefing = Dict[str, Any]


def extract_metric_value(node: Any) -> Optional[float]:
    if node is None or not isinstance(node, dict):
        return None
    metric = node.get("metric")
    if metric is None or not isinstance(metric, dict):
        return None
    val = metric.get("value")
    if isinstance(val, (int, float)) and math.isfinite(val):
        return val
    return None


def transform_current_spot(hourly_data: List[Any]) -> SurfSpot:
    """Port of transformCurrentSpot from briefing.server.ts"""
    empty = {
        "waveHeightM": None,
        "wavePeriodS": None,
        "waveDirectionDeg": None,
        "dominantSwellDirection": None,
        "swellComponents": [],
        "windSpeedKmh": None,
        "windDirectionDeg": None,
    }

    if not hourly_data or not isinstance(hourly_data[0], dict):
        return empty

    rec = hourly_data[0]
    swells: List[SwellComponent] = []
    for i in range(3):
        swell_key = f"swell[{i}]"
        height_node = rec.get(f"{swell_key}_height")
        period_node = rec.get(f"{swell_key}_period")
        direction_node = rec.get(f"{swell_key}_direction")

        swells.append({
            "heightM": extract_metric_value(height_node),
            "periodS": extract_metric_value(period_node),
            "directionDeg": extract_metric_value(direction_node),
            "directionCardinal": deg_to_cardinal(extract_metric_value(direction_node) or 0) if extract_metric_value(direction_node) is not None else "N/A",
        })

    # Find dominant swell
    dominant_swell = next((s for s in swells if s["heightM"] is not None and s["heightM"] > 0.05), None)
    dom_direction_deg = dominant_swell["directionDeg"] if dominant_swell else None

    return {
        "waveHeightM": extract_metric_value(rec.get("waveHeight")),
        "wavePeriodS": extract_metric_value(rec.get("wavePeriod")),
        "waveDirectionDeg": dom_direction_deg,
        "dominantSwellDirection": deg_to_cardinal(dom_direction_deg) if dom_direction_deg is not None else None,
        "swellComponents": swells,
        "windSpeedKmh": extract_metric_value(rec.get("windspeed")),
        "windDirectionDeg": extract_metric_value(rec.get("windDirection")),
    }


def calculate_daily_average(hours: List[Any]) -> Dict[str, Any]:
    """Port of calculateDailyAverage from briefing.server.ts"""
    total_height = 0.0
    total_period = 0.0
    height_count = 0
    period_count = 0
    swell_directions: List[float] = []

    for hour in hours:
        if not isinstance(hour, dict):
            continue

        # Find the most significant swell (> 0.1m)
        dominant_height: Optional[float] = None
        for i in range(3):
            node = hour.get(f"swell[{i}]_height")
            val = extract_metric_value(node)
            if val is not None and val > 0.1:
                if dominant_height is None or val > dominant_height:
                    dominant_height = val

        if dominant_height is not None:
            total_height += dominant_height
            height_count += 1

            # Track direction from the same swell
            for i in range(3):
                node = hour.get(f"swell[{i}]_height")
                val = extract_metric_value(node)
                if val is not None and val == dominant_height:
                    dir_node = hour.get(f"swell[{i}]_direction")
                    dir_val = extract_metric_value(dir_node)
                    if dir_val is not None:
                        swell_directions.append(dir_val)

        period_node = hour.get("wavePeriod")
        period_val = extract_metric_value(period_node)
        if period_val is not None:
            total_period += period_val
            period_count += 1

    avg_height_m = round1(total_height / height_count) if height_count > 0 else None
    avg_period_s = round1(total_period / period_count) if period_count > 0 else None

    # Dominant direction
    dominant_direction = "N/A"
    if swell_directions:
        avg_dir = sum(swell_directions) / len(swell_directions)
        dominant_direction = deg_to_cardinal(avg_dir)

    # Quality score
    score = 0
    if avg_height_m is not None and 0.5 <= avg_height_m <= 4.0:
        score += 4
    elif avg_height_m is not None and 4.0 < avg_height_m <= 6.0:
        score += 2

    if avg_period_s is not None and avg_period_s >= 10:
        score += 3
    elif avg_period_s is not None and avg_period_s >= 7:
        score += 2
    elif avg_period_s is not None and avg_period_s >= 5:
        score += 1

    # Penalty for very small/large waves
    if avg_height_m is not None and (avg_height_m < 0.3 or avg_height_m > 8.0):
        score = min(score, 1)

    return {
        "avgHeightM": avg_height_m,
        "avgPeriodS": avg_period_s,
        "dominantDirection": dominant_direction,
        "score": min(score, 10),
        "swellCount": height_count,
    }


def estimate_spot_score(spot: Optional[SurfSpot]) -> Optional[int]:
    """Quick heuristic for current spot quality."""
    if spot is None:
        return None
    score = 0
    h = spot.get("waveHeightM")
    p = spot.get("wavePeriodS")

    if h is not None and 0.5 <= h <= 4.0:
        score += 4
    elif h is not None and 4.0 < h <= 6.0:
        score += 2

    if p is not None and p >= 10:
        score += 3
    elif p is not None and p >= 7:
        score += 2
    elif p is not None and p >= 5:
        score += 1

    return min(score, 10)


def make_hour(
    wave_height: Optional[float] = None,
    wave_period: Optional[float] = None,
    swells: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Factory for hourly data."""
    hour: Dict[str, Any] = {}
    if wave_height is not None:
        hour["waveHeight"] = {"metric": {"value": wave_height}}
    if wave_period is not None:
        hour["wavePeriod"] = {"metric": {"value": wave_period}}
    if swells:
        for i, swell in enumerate(swells):
            if swell is None:
                continue
            height_data = swell.get("height")
            period_data = swell.get("period")
            direction_data = swell.get("direction")
            if height_data is not None:
                hour[f"swell[{i}]_height"] = {"metric": {"value": height_data}}
            if period_data is not None:
                hour[f"swell[{i}]_period"] = {"metric": {"value": period_data}}
            if direction_data is not None:
                hour[f"swell[{i}]_direction"] = {"metric": {"value": direction_data}}
    return hour


def make_spot(waveHeightM: Optional[float], wavePeriodS: Optional[float]) -> SurfSpot:
    return {
        "waveHeightM": waveHeightM,
        "wavePeriodS": wavePeriodS,
        "waveDirectionDeg": None,
        "dominantSwellDirection": None,
        "swellComponents": [],
        "windSpeedKmh": None,
        "windDirectionDeg": None,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestExtractMetricValue(unittest.TestCase):
    def test_none_node(self):
        self.assertIsNone(extract_metric_value(None))

    def test_non_dict(self):
        self.assertIsNone(extract_metric_value("hello"))

    def test_no_metric_key(self):
        self.assertIsNone(extract_metric_value({"foo": "bar"}))

    def test_no_value_key(self):
        self.assertIsNone(extract_metric_value({"metric": {}}))

    def test_numeric_value(self):
        result = extract_metric_value({"metric": {"value": 1.5}})
        self.assertEqual(result, 1.5)

    def test_non_finite_value(self):
        import math
        self.assertIsNone(extract_metric_value({"metric": {"value": float('inf')}}))


class TestDegToCardinal(unittest.TestCase):
    def test_north(self):
        self.assertEqual(deg_to_cardinal(0), "N")

    def test_east(self):
        self.assertEqual(deg_to_cardinal(90), "E")

    def test_south(self):
        self.assertEqual(deg_to_cardinal(180), "S")

    def test_west(self):
        self.assertEqual(deg_to_cardinal(270), "W")

    def test_negative_degrees(self):
        self.assertEqual(deg_to_cardinal(-90), "W")  # -90° ≡ 270° = West

    def test_over_360(self):
        self.assertEqual(deg_to_cardinal(360), "N")


class TestTransformCurrentSpot(unittest.TestCase):
    def test_empty_hourly(self):
        result = transform_current_spot([])
        self.assertIsNone(result["waveHeightM"])
        self.assertEqual(result["swellComponents"], [])

    def test_valid_hourly_with_swell(self):
        hourly = [make_hour(
            wave_height=1.2,
            wave_period=10,
            swells=[
                {"height": 1.0, "period": 12, "direction": 180},
                {"height": 0.3, "period": 7, "direction": 270},
                None,
            ],
        )]
        result = transform_current_spot(hourly)
        self.assertEqual(result["waveHeightM"], 1.2)
        self.assertEqual(result["wavePeriodS"], 10)
        self.assertEqual(len(result["swellComponents"]), 3)
        self.assertEqual(result["dominantSwellDirection"], "S")

    def test_no_wind(self):
        hourly = [make_hour(wave_height=0.8, wave_period=None, swells=[{"height": 0.8, "period": 8, "direction": 45}])]
        result = transform_current_spot(hourly)
        self.assertIsNone(result["windSpeedKmh"])


class TestCalculateDailyAverage(unittest.TestCase):
    def test_empty_hours(self):
        result = calculate_daily_average([])
        self.assertIsNone(result["avgHeightM"])
        self.assertIsNone(result["avgPeriodS"])
        self.assertEqual(result["dominantDirection"], "N/A")
        self.assertEqual(result["score"], 0)

    def test_good_surf_day(self):
        """Wave height 1.5m, period 12s should score well."""
        hours = [
            make_hour(
                wave_height=1.4,
                wave_period=12,
                swells=[{"height": 1.4, "period": 12, "direction": 180}],
            ) for _ in range(24)
        ]
        result = calculate_daily_average(hours)
        self.assertAlmostEqual(result["avgHeightM"], 1.4)
        self.assertAlmostEqual(result["avgPeriodS"], 12)
        self.assertEqual(result["dominantDirection"], "S")
        self.assertGreaterEqual(result["score"], 7)

    def test_flat_day(self):
        """Very small waves should score poorly."""
        hours = [
            make_hour(
                wave_height=0.05,
                wave_period=4,
                swells=[{"height": 0.05, "period": 4, "direction": 90}],
            ) for _ in range(24)
        ]
        result = calculate_daily_average(hours)
        self.assertEqual(result["avgHeightM"], None)  # below threshold
        self.assertEqual(result["score"], 0)

    def test_heavy_penalty_too_small(self):
        """Avg height < 0.3 should get score capped at 1."""
        # Use height = 0.2 which will be a valid swell (> 0.1) but average < 0.3
        hours = [
            make_hour(
                wave_height=0.2,
                wave_period=8,
                swells=[{"height": 0.2, "period": 8, "direction": 90}],
            ) for _ in range(24)
        ]
        result = calculate_daily_average(hours)
        self.assertAlmostEqual(result["avgHeightM"], 0.2)
        self.assertEqual(result["score"], 1)  # penalty for very small waves (capped at 1)

    def test_heavy_penalty_too_large(self):
        """Avg height > 8 should get score capped at 1."""
        hours = [
            make_hour(
                wave_height=9.0,
                wave_period=12,
                swells=[{"height": 9.0, "period": 12, "direction": 270}],
            ) for _ in range(24)
        ]
        result = calculate_daily_average(hours)
        self.assertAlmostEqual(result["avgHeightM"], 9.0)
        self.assertEqual(result["score"], 1)

    def test_dominant_direction_from_max_swell(self):
        """Direction should come from the swell with max height."""
        hours = [
            make_hour(
                wave_height=1.0,
                wave_period=10,
                swells=[
                    {"height": 0.5, "period": 8, "direction": 45},     # smaller
                    {"height": 0.8, "period": 9, "direction": 90},      # medium
                    {"height": 1.0, "period": 11, "direction": 180},    # dominant
                ],
            ) for _ in range(24)
        ]
        result = calculate_daily_average(hours)
        self.assertEqual(result["dominantDirection"], "S")

    def test_rounding(self):
        """Ensure round1 works correctly."""
        hours = [make_hour(wave_height=1.35, wave_period=9.45, swells=[{"height": 1.35, "period": 9.45, "direction": 0}])]
        result = calculate_daily_average(hours)
        self.assertEqual(result["avgHeightM"], 1.4)   # rounds up


class TestEstimateSpotScore(unittest.TestCase):
    def test_none_spot(self):
        self.assertIsNone(estimate_spot_score(None))

    def test_good_spot(self):
        spot = make_spot(waveHeightM=1.5, wavePeriodS=12)
        score = estimate_spot_score(spot)
        self.assertGreaterEqual(score, 7)

    def test_poor_spot(self):
        spot = make_spot(waveHeightM=0.2, wavePeriodS=3)
        score = estimate_spot_score(spot)
        self.assertEqual(score, 0)

    def test_medium_spot(self):
        spot = make_spot(waveHeightM=1.0, wavePeriodS=7)
        score = estimate_spot_score(spot)
        self.assertGreaterEqual(score, 5)
        self.assertLessEqual(score, 7)


class TestRound1(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(round1(1.24), 1.2)

    def test_round_half_even(self):
        # Python uses banker's rounding (round half to even)
        self.assertEqual(round1(1.25), 1.2)

    def test_negative(self):
        self.assertEqual(round1(-1.25), -1.2)


if __name__ == "__main__":
    unittest.main()
