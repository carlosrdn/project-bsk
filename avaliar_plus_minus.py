"""Compara minutos recentes com e sem o saldo em quadra dos últimos cinco jogos."""
import argparse
import json
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean

from atualizar_dados_espn import NBA_TZ, collect, utc


def samples(events, games):
    history = defaultdict(list)
    rows = []
    for event, teams in sorted(zip(events, games, strict=True), key=lambda pair: pair[0]["date"]):
        day = utc(event["date"]).astimezone(NBA_TZ).date()
        for team in teams:
            for player in team["players"]:
                logs = history[(team["team"], player["PLAYER_ID"])]
                recent = [previous for played_on, previous in logs if played_on < day][-5:]
                if len(recent) == 5 and all(row["PLUS_MINUS"] is not None for row in recent):
                    minutes = mean(row["MIN"] for row in recent)
                    if minutes >= 10:
                        balance = mean(row["PLUS_MINUS"] for row in recent)
                        rows.append((day, minutes, balance, player["MIN"]))
                logs.append((day, player))
    return rows


def evaluate(rows):
    days = sorted({row[0] for row in rows})
    if len(days) < 5:
        raise ValueError("Rodadas insuficientes para separar ajuste e avaliação")
    split = days[len(days) * 7 // 10]
    train = [(balance, actual - baseline) for day, baseline, balance, actual in rows if day < split]
    center = mean(balance for balance, _ in train)
    bias = mean(error for _, error in train)
    variance = sum((balance - center) ** 2 for balance, _ in train)
    slope = sum((balance - center) * error for balance, error in train) / variance if variance else 0
    test = [(baseline, balance, actual) for day, baseline, balance, actual in rows if day >= split]
    return {
        "inicio_teste": split.isoformat(),
        "amostra_ajuste": len(train),
        "amostra_teste": len(test),
        "erro_absoluto_base_min": mean(abs(actual - max(0, baseline + bias)) for baseline, _, actual in test),
        "erro_absoluto_com_plus_minus_min": mean(
            abs(actual - max(0, baseline + bias + slope * (balance - center)))
            for baseline, balance, actual in test
        ),
        "coeficiente_plus_minus": slope,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, type=date.fromisoformat)
    parser.add_argument("--cache", type=Path, default=Path(".cache/espn-box-v1"))
    args = parser.parse_args()
    events, games, _, _ = collect(args.data, args.cache)
    print(json.dumps(evaluate(samples(events, games)), indent=2, ensure_ascii=False))
