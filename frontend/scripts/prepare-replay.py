"""Prepare uma amostra cronológica ESPN para avaliar o motor React offline."""
import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from atualizar_dados_espn import aggregate, collect, utc, NBA_TZ
from gerar_dados import melhores_jogadores, media


def prepare(events, games):
    by_day = defaultdict(list)
    for event, box in zip(events, games, strict=True):
        by_day[utc(event["date"]).astimezone(NBA_TZ).date().isoformat()].append((event, box))
    prior_events, prior_games, cases = [], [], []
    points = defaultdict(list)
    for day, fixtures in sorted(by_day.items()):
        teams, recent, roster, last5 = aggregate(prior_events, prior_games)
        league = media([team["OFF_RATING"] for team in teams.values()])

        def profile(code):
            team = teams[code]
            return {
                "sigla": code, "nome": code, "jogos": team["GP"], "vitorias": team["W"],
                "derrotas": team["L"], "ataque": team["OFF_RATING"], "defesa": team["DEF_RATING"],
                "ritmo": team["PACE"], "vitorias_ultimos_10": recent[code], "ausencias": None,
                "jogadores": melhores_jogadores(code, roster, last5),
            }

        for event, (home, away) in fixtures:
            h, a = home["team"], away["team"]
            if h not in teams or a not in teams or min(teams[h]["GP"], teams[a]["GP"]) < 5:
                continue
            h_player, a_player = profile(h), profile(a)
            cases.append({
                "date": day, "league": league,
                "game": {"horario_utc": event["date"], "casa": h_player, "visitante": a_player},
                "actual": [home["pts"], away["pts"]],
                "baseline": [(media([p for p, _ in points[h]]) + media([o for _, o in points[a]])) / 2,
                             (media([p for p, _ in points[a]]) + media([o for _, o in points[h]])) / 2],
                "players": [{p["PLAYER_NAME"]: p for p in box["players"] if p["MIN"] > 0} for box in (home, away)],
            })
        # Nenhum jogo do mesmo dia entra nas projeções deste dia.
        prior_events = [event for event, _ in fixtures] + prior_events
        prior_games = [box for _, box in fixtures] + prior_games
        for _, (home, away) in fixtures:
            points[home["team"]].append((home["pts"], away["pts"]))
            points[away["team"]].append((away["pts"], home["pts"]))
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ate", type=date.fromisoformat, required=True, help="Data exclusiva em Nova York")
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    args = parser.parse_args()
    events, games, _, _ = collect(args.ate, args.cache)
    cases = prepare(events, games)
    if not cases:
        raise SystemExit("Sem partidas elegíveis para replay")
    args.saida.write_text(json.dumps(cases, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    print(f"{len(cases)} confrontos preparados a partir de {len(games)} box scores")


if __name__ == "__main__":
    main()
