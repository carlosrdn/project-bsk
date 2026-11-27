"""Alimenta o formato dados.js usando agenda e box scores da ESPN."""
import argparse
import json
import os
import tempfile
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from boletim_nba import official_injuries
from gerar_dados import (
    ALIAS_SIGLAS, CONTEXTO, ESTATISTICAS, ausencias_do_time, classificar, media,
    melhores_jogadores, niveis_dos_times, normalizar,
)

ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/"
NBA_TZ = ZoneInfo("America/New_York")
STAT_COLUMNS = {"PTS": "PTS", "REB": "REB", "AST": "AST", "STL": "STL", "BLK": "BLK"}


def request(path):
    for attempt in range(3):
        try:
            req = Request(ESPN + path, headers={"User-Agent": "Project-BSK/1.0", "Accept": "application/json"})
            with urlopen(req, timeout=12) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            if attempt == 2 or isinstance(error, HTTPError) and error.code not in (408, 429, 500, 502, 503, 504):
                raise
            time.sleep(2 ** attempt)


def utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def board(day):
    data = request("scoreboard?dates=" + day.strftime("%Y%m%d"))
    if not data.get("leagues") or not isinstance(data.get("events"), list):
        raise ValueError(f"Agenda ESPN inválida para {day}")
    return data


def code(team):
    abbreviation = team["abbreviation"]
    return ALIAS_SIGLAS.get(abbreviation, abbreviation)


def competitors(event):
    entries = {entry["homeAway"]: entry for entry in event["competitions"][0]["competitors"]}
    return entries["home"], entries["away"]


def shooting(value):
    made, attempts = map(int, value.split("-"))
    if not 0 <= made <= attempts:
        raise ValueError(f"Estatística de arremessos inválida: {value}")
    return made, attempts


def player_row(athlete, columns):
    cells = dict(zip(columns, athlete["stats"], strict=True))
    if cells["MIN"] in ("", "--", "—"):
        if all(value in ("", "--", "—", "0", "0-0") for value in cells.values()):
            return None
        raise ValueError("Atleta com estatísticas, mas sem minutagem")
    minutes, _, seconds = cells["MIN"].partition(":")
    player = athlete["athlete"]
    fg, fga = shooting(cells["FG"])
    threes, attempts = shooting(cells["3PT"])
    plus_minus = cells.get("+/-")
    return {
        "PLUS_MINUS": None if plus_minus in (None, "", "--", "—") else int(plus_minus),
        "PLAYER_ID": player["id"], "PLAYER_NAME": player["displayName"],
        "MIN": int(minutes) + int(seconds or 0) / 60,
        "POS": (player.get("position") or {}).get("abbreviation"),
        "FGM": fg, "FGA": fga, "FG3M": threes, "FG3A": attempts,
        **{key: int(cells[column]) for key, column in STAT_COLUMNS.items()},
    }


def boxscore(event):
    data = request("summary?event=" + event["id"])["boxscore"]
    home, away = competitors(event)
    teams = {}
    for entry in data["teams"]:
        stats = {x["name"]: x["displayValue"] for x in entry["statistics"]}
        _, fga = shooting(stats["fieldGoalsMade-fieldGoalsAttempted"])
        _, fta = shooting(stats["freeThrowsMade-freeThrowsAttempted"])
        teams[code(entry["team"])] = {
            "poss": fga + .44 * fta - int(stats["offensiveRebounds"]) + int(stats["totalTurnovers"]),
            "players": {},
        }
    for entry in data["players"]:
        roster = teams[code(entry["team"])]["players"]
        for group in entry["statistics"]:
            for athlete in group["athletes"]:
                if athlete.get("didNotPlay") or not athlete.get("stats"):
                    continue
                row = player_row(athlete, group.get("names") or group["labels"])
                if row is not None:
                    roster[row["PLAYER_ID"]] = row
    result = []
    for entry in (home, away):
        team = teams[code(entry["team"])]
        pts = int(entry["score"])
        if not team["players"] or sum(p["PTS"] for p in team["players"].values()) != pts or team["poss"] <= 0:
            raise ValueError(f"Box score incompleto: jogo {event['id']} · {code(entry['team'])}")
        result.append({"team": code(entry["team"]), "pts": pts, "poss": team["poss"], "players": list(team["players"].values())})
    return result


def atomic_write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, mode="w", encoding="utf-8", delete=False) as handle:
        temp = Path(handle.name)
        try:
            handle.write(text)
            handle.close()
            os.replace(temp, path)
        finally:
            temp.unlink(missing_ok=True)


def read_game(event, cache):
    event_id = str(int(event["id"]))
    path = cache / (event_id + "-v2.json")
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        result = boxscore(event)
        atomic_write(path, json.dumps(result, ensure_ascii=False, allow_nan=False))
        return result


def collect(day, cache):
    today = board(day)
    league = today["leagues"][0]
    year = int(league["season"]["year"])
    start = utc(league["season"]["startDate"]).date()
    days = [start + timedelta(days=i) for i in range(max(0, (day - start).days))]
    # O calendário oficial da agenda evita requisições em datas sem jogos.
    calendar = league.get("calendar")
    if isinstance(calendar, list) and calendar and all(isinstance(item, str) for item in calendar):
        scheduled = {utc(item).date() for item in calendar}
        days = [value for value in days if value in scheduled]
    with ThreadPoolExecutor(max_workers=6) as pool:
        events = {event["id"]: event for daily in pool.map(board, days) for event in daily["events"]
                  if event.get("season", {}).get("type") == 2 and event["season"].get("year") == year
                  and event["status"]["type"].get("name") == "STATUS_FINAL"
                  and utc(event["date"]).astimezone(NBA_TZ).date() < day}
        ordered = sorted(events.values(), key=lambda event: utc(event["date"]), reverse=True)
        games = list(pool.map(lambda event: read_game(event, cache), ordered))
    fixtures = [event for event in today["events"] if utc(event["date"]).astimezone(NBA_TZ).date() == day
                and event["status"]["type"].get("name") not in ("STATUS_CANCELED", "STATUS_POSTPONED")]
    return ordered, games, fixtures, year


def aggregate(events, games):
    teams, players = defaultdict(list), defaultdict(list)
    for event, (home, away) in zip(events, games, strict=True):
        possessions = (home["poss"] + away["poss"]) / 2
        period = int(event["status"]["period"])
        pace = possessions * 48 / (48 + 5 * max(0, period - 4))
        for team, opponent in ((home, away), (away, home)):
            sigla = team["team"]
            teams[sigla].append((team["pts"], opponent["pts"], possessions, pace))
            for player in team["players"]:
                players[player["PLAYER_ID"]].append({
                    **player, "TEAM_ID": sigla, "MATCHUP": f"{sigla} vs. {opponent['team']}"
                })
    geral, recente = {}, {}
    for sigla, logs in teams.items():
        pts, allowed, poss, pace = map(sum, zip(*logs))
        wins = sum(p > a for p, a, _, _ in logs)
        geral[sigla] = {
            "TEAM_ID": sigla, "GP": len(logs), "W": wins, "L": len(logs) - wins,
            "OFF_RATING": round(100 * pts / poss, 2), "DEF_RATING": round(100 * allowed / poss, 2),
            "PACE": round(pace / len(logs), 2), "NET_RATING": 100 * (pts - allowed) / poss,
        }
        recente[sigla] = sum(p > a for p, a, _, _ in logs[:10])

    def averages(logs):
        latest = logs[0]
        result = {key: latest[key] for key in ("TEAM_ID", "PLAYER_ID", "PLAYER_NAME", "POS")}
        for key in ("MIN", *ESTATISTICAS.values()):
            result[key] = round(media([row[key] for row in logs]), 2)
        plus_minus = [row["PLUS_MINUS"] for row in logs if row["PLUS_MINUS"] is not None]
        result["PLUS_MINUS"] = round(media(plus_minus), 2) if plus_minus else None
        result["PLUS_MINUS_GP"] = len(plus_minus)
        for key, made, attempts in (("FG_PCT", "FGM", "FGA"), ("FG3_PCT", "FG3M", "FG3A")):
            shots = sum(row[attempts] for row in logs)
            result[key] = sum(row[made] for row in logs) / shots if shots else 0
        return {**result, "GP": len(logs)}

    levels = niveis_dos_times(geral)
    CONTEXTO.update(jogos=players, niveis_id=levels, nivel_sigla=levels)
    return geral, recente, [averages(logs) for logs in players.values()], [averages(logs[:5]) for logs in players.values()]


def injuries():
    try:
        report = request("injuries")["injuries"]
        if not isinstance(report, list):
            raise ValueError("Boletim ESPN inválido")
        result = []
        for team in report:
            for item in team["injuries"]:
                athlete = item["athlete"]
                abbreviation = (athlete.get("team") or {}).get("abbreviation") or (team.get("team") or {}).get("abbreviation", "")
                details = item.get("details") or {}
                result.append({
                    "nome": athlete["displayName"], "time": team.get("displayName", ""),
                    "sigla": ALIAS_SIGLAS.get(abbreviation, abbreviation),
                    "situacao": classificar(item.get("status"), item.get("shortComment")),
                    "motivo": " ".join(filter(None, (details.get("type"), details.get("detail")))),
                    "retorno": details.get("returnDate"), "atualizado": (item.get("date") or "")[:10],
                    "comentario": item.get("shortComment", ""),
                })
        if result and not any(row["sigla"] for row in result):
            raise ValueError("Boletim ESPN sem equipes identificáveis")
        return result
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, TypeError) as error:
        print(f"Lesões indisponíveis: {error}")
        return None


def previous_night(day, events, games):
    previous = day - timedelta(days=1)
    return {team["team"]: {p["PLAYER_NAME"] for p in team["players"] if p["MIN"] > 0}
            for event, box in zip(events, games, strict=True)
            if utc(event["date"]).astimezone(NBA_TZ).date() == previous
            for team in box}


def generate(day, cache, collected=None):
    events, games, fixtures, season = collected if collected is not None else collect(day, cache)
    back_to_back = previous_night(day, events, games)
    geral, recente, roster, last5 = aggregate(events, games)
    if fixtures and len(geral) != 30:
        raise ValueError(f"Cobertura insuficiente: {len(geral)}/30 equipes e {len(events)} jogos finalizados")
    report = injuries() if fixtures else None
    fixture_teams = {code(entry["team"]): entry["team"] for event in fixtures for entry in competitors(event)}
    named_teams = {sigla: [team["displayName"]] for sigla, team in fixture_teams.items()}
    if "LAC" in named_teams:
        named_teams["LAC"].extend(["LA Clippers", "Los Angeles Clippers"])
    official, injury_url = official_injuries(day, season, named_teams) if fixtures else ([], None)
    if official:
        merged = {(row["sigla"], normalizar(row["nome"])): row for row in report or []}
        merged.update(((row["sigla"], normalizar(row["nome"])), row) for row in official)
        report = list(merged.values())
    latest_game = {}
    for event in events:
        for entry in competitors(event):
            latest_game.setdefault(code(entry["team"]), event["id"])

    def profile(team):
        sigla = code(team)
        summary = geral[sigla]
        players = melhores_jogadores(sigla, roster, last5)
        if not players:
            raise ValueError(f"Sem jogadores com histórico suficiente: {sigla}")
        positions = {normalizar(row["PLAYER_NAME"]): row["POS"] for row in roster if row["TEAM_ID"] == sigla}
        absence_rows = ausencias_do_time({
            "teamCity": team["location"], "teamName": team["name"], "teamId": sigla, "teamTricode": sigla
        }, report or [], roster)
        statuses = {normalizar(row["nome"]): row["situacao"] for row in report or [] if row["sigla"] == sigla}
        for absence in absence_rows:
            name = normalizar(absence["nome"])
            if positions.get(name):
                absence["posicao"] = positions[name]
        official_statuses = {row["nome"]: row["situacao"] for row in official if row["sigla"] == sigla}
        for player in players:
            name = normalizar(player["nome"])
            player["situacao"] = statuses.get(name, "Disponível") if report is not None else "Desconhecido"
            player["back_to_back"] = player["nome"] in back_to_back.get(sigla, set())
            if positions.get(name):
                player["posicao"] = positions[name]
        return {
            "sigla": sigla, "nome": team["displayName"], "jogos": summary["GP"],
            "espn_id": team["id"], "ultimo_jogo_espn": latest_game.get(sigla),
            "boletim_nba": official_statuses,
            "back_to_back": sigla in back_to_back,
            "vitorias": summary["W"], "derrotas": summary["L"], "ataque": summary["OFF_RATING"],
            "defesa": summary["DEF_RATING"], "ritmo": summary["PACE"], "vitorias_ultimos_10": recente[sigla],
            "nivel": CONTEXTO["niveis_id"][sigla], "jogadores": players,
            "ausencias": absence_rows if report is not None else None,
        }

    if not geral:
        raise ValueError("Histórico regular da temporada indisponível")
    return {
        "atualizado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data_jogos": day.isoformat(), "lesoes_ok": report is not None,
        "media_liga": {"ataque": round(media([t["OFF_RATING"] for t in geral.values()]), 2),
                       "ritmo": round(media([t["PACE"] for t in geral.values()]), 2)},
        "fonte": {"agenda": "ESPN", "box_scores": "ESPN", "temporada": f"{season - 1}-{season % 100:02d}",
                  "jogos_finalizados": len(events), "ratings": "posses estimadas", "boletim_nba": injury_url},
        "jogos": [{"horario_utc": utc(event["date"]).isoformat().replace("+00:00", "Z"),
                   "casa": profile(competitors(event)[0]["team"]), "visitante": profile(competitors(event)[1]["team"])}
                  for event in fixtures],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=date.fromisoformat, default=datetime.now(NBA_TZ).date())
    parser.add_argument("--saida", type=Path, default=Path("."))
    parser.add_argument("--cache", type=Path, default=Path(".cache/espn-box-v1"))
    parser.add_argument("--replay", type=Path, help="Gerar amostra cronológica para o backtest React")
    args = parser.parse_args()
    collected = collect(args.data, args.cache)
    output = generate(args.data, args.cache, collected)
    if args.replay:
        import runpy

        prepare = runpy.run_path(str(Path(__file__).parent / "frontend/scripts/prepare-replay.py"))["prepare"]
        cases = prepare(*collected[:2])
        atomic_write(args.replay, json.dumps(cases, ensure_ascii=False, allow_nan=False))
    published = args.saida / "jogos.json"
    if published.exists():
        previous = json.loads(published.read_text())
        if previous.get("fonte", {}).get("temporada") == output["fonte"]["temporada"]:
            for key in ("calibration", "calibrationReport"):
                if key in previous:
                    output[key] = previous[key]
        if previous["data_jogos"] > output["data_jogos"]:
            raise ValueError("A data solicitada é anterior à coleta publicada")
        if previous["data_jogos"] == output["data_jogos"] and previous["jogos"] and not output["jogos"]:
            raise ValueError("Agenda vazia contradiz a coleta já publicada para a rodada")
    js = "const DADOS = " + json.dumps(output, ensure_ascii=False, allow_nan=False) + ";"
    json_text = json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False)
    atomic_write(published, json_text)
    atomic_write(args.saida / "dados.js", js)
    print(f"{output['data_jogos']}: {len(output['jogos'])} jogos na agenda e {output['fonte']['jogos_finalizados']} box scores usados")


if __name__ == "__main__":
    main()
