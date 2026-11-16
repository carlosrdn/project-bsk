import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

key = os.environ.get("SPORTSGAMEODDS_API_KEY")
if not key:
    raise SystemExit("Secret SPORTSGAMEODDS_API_KEY indisponível.")
now = datetime.now(timezone.utc)
params = dict(
    leagueID="NBA", type="match", started="false", includeAltLines="false",
    startsAfter=now.isoformat(), startsBefore=(now + timedelta(hours=24)).isoformat(),
    limit=25,
)
events = {}
returned = 0
def get_page():
    request = Request("https://api.sportsgameodds.com/v2/events?" + urlencode(params),
                      headers={"x-api-key": key, "Accept": "application/json"})
    try:
        with urlopen(request, timeout=25) as response:
            return json.load(response)
    except HTTPError as error:
        raise SystemExit(f"SportsGameOdds respondeu HTTP {error.code}.")
    except (URLError, TimeoutError, ValueError):
        raise SystemExit("Falha ao consultar ou interpretar SportsGameOdds.")

complete = False
for page in range(1, 2):
    payload = get_page()
    rows = payload.get("data")
    if payload.get("success") is False or not isinstance(rows, list):
        raise SystemExit("Resposta de eventos fora do formato esperado.")
    returned += len(rows)
    events.update((event["eventID"], event) for event in rows)
    cursor = payload.get("nextCursor")
    if not cursor:
        complete = True
        break
    if cursor == params.get("cursor"):
        raise SystemExit("Cursor repetido pela SportsGameOdds.")
    params["cursor"] = cursor

canonical = {"points": "pts", "rebounds": "reb", "assists": "ast", "threePointersMade": "tres"}
if not complete:
    raise SystemExit("Paginação incompleta; feed anterior preservado.")
output = []
for event_id, event in events.items():
    start = event.get("status", {}).get("startsAt")
    if not start:
        continue
    sides = defaultdict(set)
    players = event.get("players") or {}
    for market in (event.get("odds") or {}).values():
        player = market.get("statEntityID", "")
        side = market.get("sideID")
        if not player.endswith("_NBA") or market.get("periodID") != "game":
            continue
        if market.get("betTypeID") != "ou" or side not in {"over", "under"}:
            continue
        stat = market.get("statID", "")
        category = canonical.get(stat)
        if not category:
            continue
        for book, item in (market.get("byBookmaker") or {}).items():
            if item.get("available") is not True:
                continue
            try:
                line = Decimal(str(item.get("overUnder")))
            except InvalidOperation:
                continue
            if line.is_finite():
                sides[category, player, book, line].add(side)
    candidates = defaultdict(lambda: defaultdict(set))
    for (category, player, book, line), available in sides.items():
        if available == {"over", "under"} and line > 0 and line % 1 == Decimal("0.5"):
            candidates[category, player][line].add(book)
    for (category, player), lines in sorted(candidates.items()):
        ordered = sorted(lines, key=lambda line: (-len(lines[line]), line))
        if len(ordered) > 1 and len(lines[ordered[0]]) == len(lines[ordered[1]]):
            continue
        name = players.get(player, {}).get("name")
        teams = event.get("teams", {})
        home = teams.get("home", {}).get("names", {}).get("short")
        away = teams.get("away", {}).get("names", {}).get("short")
        player_team = players.get(player, {}).get("teamID")
        team = next((code for side, code in (("home", home), ("away", away))
                     if player_team and player_team == teams.get(side, {}).get("teamID")), None)
        if name and home and away and team:
            output.append(dict(start=start, home=home, away=away, team=team,
                               player=name, stat=category, line=float(ordered[0])))

target = Path(os.environ["BSK_MARKET_LINES_PATH"])
temporary = target.with_suffix(".tmp")
temporary.write_text(json.dumps({"collectedAt": now.isoformat(), "lines": output},
                                ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
temporary.replace(target)
print(f"{len(events)} jogos, {returned} objetos retornados, {len(output)} linhas selecionadas.")
