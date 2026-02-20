from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.domain.strategy.gt_blackjack import analyze_decision_state

router = APIRouter()


class StrategyRequest(BaseModel):
    player_cards: list[str] | None = Field(default=None, description="Player hand cards")
    player_total: int | None = Field(default=None, ge=0, le=40)
    player_soft_aces: int = Field(default=0, ge=0, le=10)
    dealer_upcard: str = Field(min_length=1, max_length=3)
    bet: int = Field(ge=0)
    bankroll: int = Field(ge=0)
    rule: Literal["S17", "H17"] = "S17"
    can_double: bool | None = None
    infer_can_double: bool = False
    risk_lambda: float = Field(default=1.0, ge=0.0, le=4.0)


@router.post("/strategy/blackjack")
def blackjack_strategy(payload: StrategyRequest) -> dict:
    try:
        if payload.player_cards is not None and len(payload.player_cards) > 0:
            player_state: object = {"cards": payload.player_cards}
        elif payload.player_total is not None:
            player_state = (payload.player_total, payload.player_soft_aces)
        else:
            raise HTTPException(
                status_code=422,
                detail="Provide either player_cards or player_total",
            )

        return analyze_decision_state(
            player_state=player_state,  # type: ignore[arg-type]
            dealer_upcard=payload.dealer_upcard,
            bet=payload.bet,
            bankroll=payload.bankroll,
            rule=payload.rule,
            can_double=payload.can_double,
            infer_can_double=payload.infer_can_double,
            risk_lambda=payload.risk_lambda,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
