from __future__ import annotations

from collections.abc import Sized
from functools import lru_cache
from math import sqrt
from typing import Any, Iterable, Literal, Mapping

CardDraw = Literal["A", 2, 3, 4, 5, 6, 7, 8, 9, 10]
DealerRule = Literal["S17", "H17"]
CardInput = str | int
PlayerStateInput = tuple[int, int] | Mapping[str, Any] | Iterable[CardInput]

CARD_PROBS: dict[CardDraw, float] = {
    "A": 1.0 / 13.0,
    2: 1.0 / 13.0,
    3: 1.0 / 13.0,
    4: 1.0 / 13.0,
    5: 1.0 / 13.0,
    6: 1.0 / 13.0,
    7: 1.0 / 13.0,
    8: 1.0 / 13.0,
    9: 1.0 / 13.0,
    10: 4.0 / 13.0,
}
DRAW_OUTCOMES: tuple[tuple[CardDraw, float], ...] = tuple(CARD_PROBS.items())
DEALER_KEYS: tuple[int | str, ...] = (17, 18, 19, 20, 21, "bust")
RANK_SET = {"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "T"}
SUIT_SET = {"S", "H", "D", "C"}


def _parse_rule(rule: str) -> DealerRule:
    upper = str(rule).strip().upper()
    if upper not in {"S17", "H17"}:
        raise ValueError(f"Invalid dealer rule: {rule}")
    return upper  # type: ignore[return-value]


def _parse_card_token(card: CardInput) -> CardDraw:
    if isinstance(card, int):
        if card == 1:
            return "A"
        if 2 <= card <= 10:
            return card  # type: ignore[return-value]
        raise ValueError(f"Invalid numeric card value: {card}")

    raw = str(card).strip().upper()
    if not raw:
        raise ValueError("Empty card value")
    if len(raw) >= 2 and raw[-1] in SUIT_SET and raw[:-1] in RANK_SET:
        raw = raw[:-1]

    if raw in {"A"}:
        return "A"
    if raw in {"T", "10", "J", "Q", "K"}:
        return 10
    if raw in {"2", "3", "4", "5", "6", "7", "8", "9"}:
        return int(raw)  # type: ignore[return-value]
    raise ValueError(f"Invalid card token: {card}")


def _normalize_total(total: int, soft_aces: int) -> tuple[int, int]:
    adjusted_total = int(total)
    adjusted_soft = max(0, int(soft_aces))
    while adjusted_total > 21 and adjusted_soft > 0:
        adjusted_total -= 10
        adjusted_soft -= 1
    return adjusted_total, adjusted_soft


def add_card_to_total(total: int, soft_aces: int, card_value: CardInput) -> tuple[int, int]:
    token = _parse_card_token(card_value)
    next_total = int(total)
    next_soft = int(soft_aces)

    if token == "A":
        next_total += 11
        next_soft += 1
    else:
        next_total += int(token)
    return _normalize_total(next_total, next_soft)


def best_total(total: int, soft_aces: int) -> tuple[int, bool]:
    final_total, final_soft_aces = _normalize_total(total, soft_aces)
    return final_total, final_total <= 21 and final_soft_aces > 0


def player_state_from_cards(cards: Iterable[CardInput]) -> tuple[int, int]:
    running_total, running_soft_aces = 0, 0
    for card in cards:
        running_total, running_soft_aces = add_card_to_total(running_total, running_soft_aces, card)
    return running_total, running_soft_aces


def _coerce_player_state(player_state: PlayerStateInput) -> tuple[int, int]:
    if (
        isinstance(player_state, tuple)
        and len(player_state) == 2
        and isinstance(player_state[0], int)
        and isinstance(player_state[1], int)
    ):
        total = int(player_state[0])
        soft_aces = int(player_state[1])
        return _normalize_total(total, soft_aces)

    if isinstance(player_state, Mapping):
        if "cards" in player_state:
            raw_cards = player_state["cards"]
            if not isinstance(raw_cards, Iterable) or isinstance(raw_cards, (str, bytes)):
                raise ValueError("player_state.cards must be an iterable of cards")
            return player_state_from_cards(raw_cards)  # type: ignore[arg-type]
        if "total" in player_state:
            total = int(player_state["total"])
            soft_aces = int(player_state.get("soft_aces", 0))
            return _normalize_total(total, soft_aces)
        raise ValueError("player_state mapping must contain either total or cards")

    if isinstance(player_state, Iterable) and not isinstance(player_state, (str, bytes)):
        return player_state_from_cards(player_state)

    raise ValueError("Unsupported player_state input")


def _to_prob_dict(prob_tuple: tuple[float, float, float, float, float, float]) -> dict[int | str, float]:
    return {
        17: prob_tuple[0],
        18: prob_tuple[1],
        19: prob_tuple[2],
        20: prob_tuple[3],
        21: prob_tuple[4],
        "bust": prob_tuple[5],
    }


@lru_cache(maxsize=None)
def _dealer_finish_probs(total: int, soft_aces: int, rule: DealerRule) -> tuple[float, float, float, float, float, float]:
    dealer_total, dealer_soft_aces = _normalize_total(total, soft_aces)
    if dealer_total > 21:
        return (0.0, 0.0, 0.0, 0.0, 0.0, 1.0)

    is_soft = dealer_total <= 21 and dealer_soft_aces > 0
    should_draw = dealer_total < 17 or (dealer_total == 17 and is_soft and rule == "H17")
    if not should_draw:
        if 17 <= dealer_total <= 21:
            buckets = [0.0] * 6
            buckets[dealer_total - 17] = 1.0
            return tuple(buckets)  # type: ignore[return-value]
        return (0.0, 0.0, 0.0, 0.0, 0.0, 1.0)

    totals = [0.0] * 6
    for draw_card, prob in DRAW_OUTCOMES:
        next_total, next_soft = add_card_to_total(dealer_total, dealer_soft_aces, draw_card)
        child = _dealer_finish_probs(next_total, next_soft, rule)
        for idx, value in enumerate(child):
            totals[idx] += prob * value
    return tuple(totals)  # type: ignore[return-value]


def dealer_distribution(upcard: CardInput, rule: DealerRule | str) -> dict[int | str, float]:
    parsed_rule = _parse_rule(rule)
    parsed_upcard = _parse_card_token(upcard)
    base_total, base_soft_aces = add_card_to_total(0, 0, parsed_upcard)

    totals = [0.0] * 6
    for hidden_card, prob in DRAW_OUTCOMES:
        next_total, next_soft = add_card_to_total(base_total, base_soft_aces, hidden_card)
        child = _dealer_finish_probs(next_total, next_soft, parsed_rule)
        for idx, value in enumerate(child):
            totals[idx] += prob * value

    return _to_prob_dict(tuple(totals))  # type: ignore[arg-type]


def _aggregate_outcomes(entries: Iterable[tuple[float, float]]) -> list[tuple[float, float]]:
    buckets: dict[float, float] = {}
    for delta, prob in entries:
        if prob <= 0:
            continue
        buckets[float(delta)] = buckets.get(float(delta), 0.0) + float(prob)
    return sorted(buckets.items(), key=lambda item: item[0])


def stand_delta_distribution(
    player_total: int, dealer_upcard: CardInput, bet: int | float, rule: DealerRule | str
) -> list[tuple[float, float]]:
    stake = float(bet)
    if stake < 0:
        raise ValueError("bet must be non-negative")
    if player_total > 21:
        return [(-stake, 1.0)]

    dealer_dist = dealer_distribution(dealer_upcard, rule)
    outcomes: list[tuple[float, float]] = []
    for dealer_outcome, prob in dealer_dist.items():
        if dealer_outcome == "bust":
            outcomes.append((stake, prob))
            continue
        dealer_total = int(dealer_outcome)
        if player_total > dealer_total:
            outcomes.append((stake, prob))
        elif player_total < dealer_total:
            outcomes.append((-stake, prob))
        else:
            outcomes.append((0.0, prob))
    return _aggregate_outcomes(outcomes)


def ev_stand(player_total: int, dealer_upcard: CardInput, bet: int, rule: DealerRule | str) -> float:
    return sum(delta * prob for delta, prob in stand_delta_distribution(player_total, dealer_upcard, bet, rule))


def hit_one_step_delta_distribution(
    player_state: PlayerStateInput, dealer_upcard: CardInput, bet: int | float, rule: DealerRule | str
) -> list[tuple[float, float]]:
    total, soft_aces = _coerce_player_state(player_state)
    stake = float(bet)
    outcomes: list[tuple[float, float]] = []

    for draw_card, draw_prob in DRAW_OUTCOMES:
        next_total, next_soft = add_card_to_total(total, soft_aces, draw_card)
        if next_total > 21:
            outcomes.append((-stake, draw_prob))
            continue
        stand_outcomes = stand_delta_distribution(next_total, dealer_upcard, stake, rule)
        for delta, prob in stand_outcomes:
            outcomes.append((delta, draw_prob * prob))
    return _aggregate_outcomes(outcomes)


def ev_hit_one_step(player_state: PlayerStateInput, dealer_upcard: CardInput, bet: int, rule: DealerRule | str) -> float:
    return sum(delta * prob for delta, prob in hit_one_step_delta_distribution(player_state, dealer_upcard, bet, rule))


def double_delta_distribution(
    player_state: PlayerStateInput, dealer_upcard: CardInput, bet: int | float, rule: DealerRule | str
) -> list[tuple[float, float]]:
    total, soft_aces = _coerce_player_state(player_state)
    stake = float(bet) * 2.0
    outcomes: list[tuple[float, float]] = []

    for draw_card, draw_prob in DRAW_OUTCOMES:
        next_total, next_soft = add_card_to_total(total, soft_aces, draw_card)
        if next_total > 21:
            outcomes.append((-stake, draw_prob))
            continue
        stand_outcomes = stand_delta_distribution(next_total, dealer_upcard, stake, rule)
        for delta, prob in stand_outcomes:
            outcomes.append((delta, draw_prob * prob))
    return _aggregate_outcomes(outcomes)


def ev_double(player_state: PlayerStateInput, dealer_upcard: CardInput, bet: int, rule: DealerRule | str) -> float:
    return sum(delta * prob for delta, prob in double_delta_distribution(player_state, dealer_upcard, bet, rule))


def expected_utility(bankroll: int | float, outcomes: Iterable[tuple[float, float]]) -> float:
    base = float(bankroll)
    return sum(prob * sqrt(max(base + delta, 0.0)) for delta, prob in outcomes)


def security_level(
    outcomes: Iterable[tuple[float, float]], risk_lambda: float = 1.0
) -> tuple[float, float, float]:
    entries = list(outcomes)
    mu = sum(delta * prob for delta, prob in entries)
    variance = sum(prob * ((delta - mu) ** 2) for delta, prob in entries)
    score = mu - float(risk_lambda) * sqrt(max(variance, 0.0))
    return score, mu, variance


def _infer_can_double(
    player_state: PlayerStateInput, bet: int | float, bankroll: int | float, infer_can_double: bool
) -> bool:
    if isinstance(player_state, Mapping):
        explicit = player_state.get("can_double")
        if isinstance(explicit, bool):
            return explicit

    if not infer_can_double:
        return True

    if float(bet) <= 0 or float(bankroll) < float(bet):
        return False

    if isinstance(player_state, Mapping):
        if "cards" in player_state:
            cards = player_state.get("cards")
            if isinstance(cards, Sized) and not isinstance(cards, (str, bytes)):
                return len(cards) == 2
            return False
        if "card_count" in player_state:
            return int(player_state["card_count"]) == 2
        if "num_cards" in player_state:
            return int(player_state["num_cards"]) == 2
        return False

    return False


def _recommend(actions: dict[str, dict[str, Any]], metric_key: str) -> str | None:
    best_name: str | None = None
    best_score = float("-inf")
    for action_name in ("stand", "hit", "double"):
        info = actions.get(action_name)
        if not info or not info.get("allowed", False):
            continue
        score = info.get(metric_key)
        if score is None:
            continue
        score_value = float(score)
        if score_value > best_score:
            best_score = score_value
            best_name = action_name
    return best_name


def _serialize_outcomes(outcomes: list[tuple[float, float]]) -> list[dict[str, float]]:
    return [{"delta": float(delta), "prob": float(prob)} for delta, prob in outcomes]


def analyze_decision_state(
    player_state: PlayerStateInput,
    dealer_upcard: CardInput,
    bet: int,
    bankroll: int,
    rule: DealerRule | str,
    can_double: bool | None = None,
    infer_can_double: bool = False,
    risk_lambda: float = 1.0,
) -> dict[str, Any]:
    parsed_rule = _parse_rule(rule)
    player_total, player_soft_aces = _coerce_player_state(player_state)
    parsed_upcard = _parse_card_token(dealer_upcard)

    if can_double is None:
        allow_double = _infer_can_double(player_state, bet, bankroll, infer_can_double)
    else:
        allow_double = bool(can_double)

    stand_outcomes = stand_delta_distribution(player_total, dealer_upcard, bet, parsed_rule)
    hit_outcomes = hit_one_step_delta_distribution(player_state, dealer_upcard, bet, parsed_rule)
    double_outcomes = (
        double_delta_distribution(player_state, dealer_upcard, bet, parsed_rule) if allow_double else []
    )

    stand_security, stand_mu, stand_var = security_level(stand_outcomes, risk_lambda)
    hit_security, hit_mu, hit_var = security_level(hit_outcomes, risk_lambda)
    double_security, double_mu, double_var = (
        security_level(double_outcomes, risk_lambda) if allow_double else (None, None, None)
    )

    actions: dict[str, dict[str, Any]] = {
        "stand": {
            "allowed": True,
            "ev": stand_mu,
            "utility_score": expected_utility(bankroll, stand_outcomes),
            "security_score": stand_security,
            "variance": stand_var,
            "outcomes": _serialize_outcomes(stand_outcomes),
        },
        "hit": {
            "allowed": True,
            "ev": hit_mu,
            "utility_score": expected_utility(bankroll, hit_outcomes),
            "security_score": hit_security,
            "variance": hit_var,
            "outcomes": _serialize_outcomes(hit_outcomes),
        },
        "double": {
            "allowed": allow_double,
            "ev": double_mu if allow_double else None,
            "utility_score": expected_utility(bankroll, double_outcomes) if allow_double else None,
            "security_score": double_security if allow_double else None,
            "variance": double_var if allow_double else None,
            "outcomes": _serialize_outcomes(double_outcomes) if allow_double else [],
        },
    }

    recommendations = {
        "ev_maximizer": _recommend(actions, "ev"),
        "risk_averse": _recommend(actions, "utility_score"),
        "security_level": _recommend(actions, "security_score"),
    }

    return {
        "inputs": {
            "player_total": player_total,
            "player_soft_aces": player_soft_aces,
            "dealer_upcard": "A" if parsed_upcard == "A" else int(parsed_upcard),
            "bet": int(bet),
            "bankroll": int(bankroll),
            "rule": parsed_rule,
            "can_double": allow_double,
            "risk_lambda": float(risk_lambda),
        },
        "dealer_distribution": dealer_distribution(dealer_upcard, parsed_rule),
        "actions": actions,
        "recommendations": recommendations,
    }
