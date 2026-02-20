import random
from typing import List, Tuple

RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
SUITS = ["S", "H", "D", "C"]


def new_shoe(decks: int) -> List[str]:
    cards = [f"{rank}{suit}" for rank in RANKS for suit in SUITS] * decks
    random.shuffle(cards)
    return cards


def card_value(rank: str) -> int:
    if rank in {"J", "Q", "K"}:
        return 10
    if rank == "A":
        return 1
    return int(rank)


def hand_value(cards: List[str]) -> Tuple[int, bool]:
    total = 0
    aces = 0
    for card in cards:
        rank = card[:-1]
        if rank == "A":
            aces += 1
        total += card_value(rank)

    is_soft = False
    while aces > 0 and total + 10 <= 21:
        total += 10
        aces -= 1
        is_soft = True
    return total, is_soft
