import json
import re
import unicodedata
from datetime import datetime

import requests

from nba_api.live.nba.endpoints import scoreboard
from nba_api.stats.endpoints import leaguedashplayerstats, leaguedashteamstats, leaguegamelog

TEMPORADA = "2026-27"


def estatisticas(ultimos_jogos=0):
    """Busca as estatísticas avançadas de todos os times.
    ultimos_jogos=0 significa a temporada inteira."""
    dados = leaguedashteamstats.LeagueDashTeamStats(
        season=TEMPORADA,
        measure_type_detailed_defense="Advanced",
        per_mode_detailed="PerGame",
        last_n_games=ultimos_jogos,
        timeout=60,
    ).get_normalized_dict()["LeagueDashTeamStats"]
    return {linha["TEAM_ID"]: linha for linha in dados}


URL_LESOES = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
ALIAS_SIGLAS = {"GS": "GSW", "NO": "NOP", "NY": "NYK", "SA": "SAS", "UTAH": "UTA", "WSH": "WAS"}


def normalizar(texto):
    """Deixa o nome comparável: sem acentos, pontos, maiúsculas ou sufixos (Jr., III)."""
    texto = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode()
    texto = re.sub(r"[^a-z ]", "", texto.lower())
    palavras = [p for p in texto.split() if p not in ("jr", "sr", "ii", "iii", "iv")]
    return " ".join(palavras)


def classificar(status, comentario):
    """A ESPN às vezes marca 'Day-To-Day' mesmo quando o texto diz que o jogador está fora,
    por isso olhamos o status e também o comentário."""
    texto = (comentario or "").lower()
    termos_fora = ("ruled out", "listed as out", "downgraded to out", "is out", "will not play", "won't play")
    if status == "Out" or any(t in texto for t in termos_fora):
        return "Fora"
    if "doubtful" in texto or status == "Doubtful":
        return "Provável ausência"
    if "probable" in texto or status == "Probable":
        return "Provável"
    return "Dúvida"


def buscar_lesoes():
    """Lê a lista de lesões da ESPN (fonte não oficial). Se falhar, o script segue sem ela."""
    try:
        resposta = requests.get(URL_LESOES, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        resposta.raise_for_status()
        dados = resposta.json()
    except Exception as erro:
        print(f"Aviso: não consegui buscar as lesões ({erro}). Seguindo sem elas.")
        return []

    lesoes = []
    for time in dados.get("injuries", []):
        for item in time.get("injuries", []):
            atleta = item.get("athlete", {})
            detalhes = item.get("details", {})
            sigla = atleta.get("team", {}).get("abbreviation", "")
            lesoes.append({
                "nome": atleta.get("displayName", ""),
                "time": time.get("displayName", ""),
                "sigla": ALIAS_SIGLAS.get(sigla, sigla),
                "situacao": classificar(item.get("status"), item.get("shortComment")),
                "motivo": " ".join(filter(None, [detalhes.get("type"), detalhes.get("detail")])),
                "retorno": detalhes.get("returnDate"),
                "atualizado": (item.get("date") or "")[:10],
                "comentario": item.get("shortComment", ""),
            })
    return lesoes


def marcar_situacao(jogadores_time, lesoes, sigla):
    """Marca cada jogador da tabela como Disponível, Dúvida, Provável ausência ou Fora."""
    # Correspondência por TIME + nome: evita contaminar status de homônimos
    # presentes em equipes diferentes.
    por_nome = {normalizar(l["nome"]): l["situacao"] for l in lesoes if l.get("sigla") == sigla}
    for jogador in jogadores_time:
        jogador["situacao"] = por_nome.get(normalizar(jogador["nome"]), "Disponível")
    return jogadores_time


def ausencias_do_time(time, lesoes, elenco):
    """Todos os jogadores do time na lista de lesões, com as médias da temporada (se houver)."""
    nome_time = normalizar(f'{time["teamCity"]} {time["teamName"]}')
    do_elenco = {normalizar(j["PLAYER_NAME"]): j for j in elenco if j["TEAM_ID"] == time["teamId"]}

    lista = []
    for l in lesoes:
        if normalizar(l["time"]) != nome_time and l["sigla"] != time["teamTricode"]:
            continue
        j = do_elenco.get(normalizar(l["nome"]))
        minutos = round(j["MIN"], 1) if j else 0
        if l["situacao"] == "Dúvida" and minutos < 10:
            continue  # ignora quem quase não joga (contratos two-way, por exemplo)
        lista.append({
            "nome": l["nome"],
            "situacao": l["situacao"],
            "motivo": l["motivo"],
            "retorno": l["retorno"],
            "atualizado": l["atualizado"],
            "comentario": l["comentario"],
            "jogos": j["GP"] if j else 0,
            "minutos": minutos,
            "pts": j["PTS"] if j else 0,
            "reb": j["REB"] if j else 0,
            "ast": j["AST"] if j else 0,
        })
    lista.sort(key=lambda a: a["pts"] + a["reb"] + a["ast"], reverse=True)
    return lista


# Histórico jogo a jogo, preenchido no main (usado para analisar cada jogador)
CONTEXTO = {"jogos": {}, "nivel_sigla": {}, "niveis_id": {}}
ESTATISTICAS = {"pts": "PTS", "reb": "REB", "ast": "AST", "tres": "FG3M", "blk": "BLK", "stl": "STL"}


def media(valores):
    return sum(valores) / len(valores) if valores else None


def desvio(valores):
    if len(valores) < 2:
        return None
    m = media(valores)
    return (sum((v - m) ** 2 for v in valores) / (len(valores) - 1)) ** 0.5


def niveis_dos_times(geral):
    """Divide os times em três níveis pelo saldo de pontos: forte, media e fraca."""
    ordenados = sorted(geral.values(), key=lambda t: t["NET_RATING"], reverse=True)
    total = len(ordenados)
    niveis = {}
    for i, t in enumerate(ordenados):
        niveis[t["TEAM_ID"]] = "forte" if i < total / 3 else ("media" if i < 2 * total / 3 else "fraca")
    return niveis


def carregar_contexto_props(geral):
    """Busca todos os jogos de todos os jogadores da temporada (uma chamada só)."""
    try:
        linhas = leaguegamelog.LeagueGameLog(
            season=TEMPORADA, player_or_team_abbreviation="P", timeout=60,
        ).get_normalized_dict()["LeagueGameLog"]
    except Exception as erro:
        print(f"Aviso: não consegui buscar o histórico dos jogadores ({erro}). Seguindo sem ele.")
        return
    niveis_id = niveis_dos_times(geral)
    por_jogador, nivel_sigla = {}, {}
    for l in linhas:
        por_jogador.setdefault(l["PLAYER_ID"], []).append(l)
        nivel_sigla[l["TEAM_ABBREVIATION"]] = niveis_id.get(l["TEAM_ID"], "media")
    for jogos in por_jogador.values():
        jogos.sort(key=lambda l: l["GAME_DATE"], reverse=True)  # mais recentes primeiro
    CONTEXTO.update({"jogos": por_jogador, "nivel_sigla": nivel_sigla, "niveis_id": niveis_id})


def minutos_em_decimal(valor):
    """Converte minutos da NBA (ex.: '34:12') para minutos decimais."""
    if valor is None:
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip()
    if not texto:
        return 0.0
    if ":" in texto:
        try:
            minutos, segundos = texto.split(":", 1)
            return int(minutos) + int(segundos) / 60
        except (ValueError, TypeError):
            return 0.0
    try:
        return float(texto)
    except (ValueError, TypeError):
        return 0.0


def props_do_jogador(player_id):
    """Média, últimos 5, oscilação e rendimento contra times fortes, médios e fracos."""
    # LeagueGameLog pode entregar MIN como texto no formato MM:SS.
    jogos = [
        j for j in CONTEXTO["jogos"].get(player_id, [])
        if minutos_em_decimal(j.get("MIN")) >= 12
    ]
    resultado = {}
    for chave, campo in ESTATISTICAS.items():
        valores = [j[campo] for j in jogos]
        if not valores:
            continue
        por_nivel = {}
        for nivel in ("forte", "media", "fraca"):
            v = [j[campo] for j in jogos if CONTEXTO["nivel_sigla"].get(j["MATCHUP"].split()[-1]) == nivel]
            por_nivel[nivel] = {"media": round(media(v), 1) if v else None, "jogos": len(v)}
        d = desvio(valores)
        resultado[chave] = {
            "media": round(media(valores), 2),
            "ultimos5": round(media(valores[:5]), 2),
            "desvio": round(d, 2) if d is not None else None,
            "jogos": len(valores),
            "por_nivel": por_nivel,
        }
    return resultado


def jogadores(ultimos_jogos=0):
    """Médias por jogo de todos os jogadores (0 = temporada inteira)."""
    return leaguedashplayerstats.LeagueDashPlayerStats(
        season=TEMPORADA,
        per_mode_detailed="PerGame",
        last_n_games=ultimos_jogos,
        timeout=60,
    ).get_normalized_dict()["LeagueDashPlayerStats"]


def melhores_jogadores(team_id, elenco, elenco5, quantidade=12):
    """Elenco de rotação: amplia a amostra para categorias defensivas e bolas de três."""
    do_time = [
        j for j in elenco
        if j["TEAM_ID"] == team_id and j["GP"] >= 2 and j["MIN"] >= 10
    ]
    do_time.sort(key=lambda j: (j["MIN"], j["PTS"] + j["REB"] + j["AST"]), reverse=True)
    recentes = {j["PLAYER_ID"]: j for j in elenco5}

    lista = []
    for j in do_time[:quantidade]:
        r = recentes.get(j["PLAYER_ID"])
        lista.append({
            "nome": j["PLAYER_NAME"],
            "jogos": j["GP"],
            "minutos": round(j["MIN"], 1),
            "pts": j["PTS"],
            "reb": j["REB"],
            "ast": j["AST"],
            "stl": j["STL"],
            "blk": j["BLK"],
            "fg": round(j["FG_PCT"] * 100, 1),
            "tres": round(j["FG3_PCT"] * 100, 1),
            "pts_5": r["PTS"] if r else None,
            "props": props_do_jogador(j["PLAYER_ID"]),
        })
    return lista


def montar_perfil(time, geral, recente, elenco, elenco5, lesoes):
    g = geral[time["teamId"]]
    r = recente[time["teamId"]]
    return {
        "sigla": time["teamTricode"],
        "nome": f'{time["teamCity"]} {time["teamName"]}',
        "jogos": g["GP"],
        "vitorias": g["W"],
        "derrotas": g["L"],
        "ataque": g["OFF_RATING"],
        "defesa": g["DEF_RATING"],
        "ritmo": g["PACE"],
        "vitorias_ultimos_10": r["W"],
        "nivel": CONTEXTO["niveis_id"].get(time["teamId"], "media"),
        "jogadores": marcar_situacao(melhores_jogadores(time["teamId"], elenco, elenco5), lesoes, time["teamTricode"]),
        "ausencias": ausencias_do_time(time, lesoes, elenco),
    }


def main():
    print("Buscando estatísticas dos times...")
    geral = estatisticas()
    recente = estatisticas(10)

    print("Buscando estatísticas dos jogadores...")
    elenco = jogadores()
    elenco5 = jogadores(5)

    print("Buscando lesões...")
    lesoes = buscar_lesoes()

    print("Buscando o histórico jogo a jogo dos jogadores...")
    carregar_contexto_props(geral)

    # Médias da liga, usadas pela página para calibrar o modelo
    media_ataque = sum(t["OFF_RATING"] for t in geral.values()) / len(geral)
    media_ritmo = sum(t["PACE"] for t in geral.values()) / len(geral)

    print("Buscando os jogos de hoje...")
    placar = scoreboard.ScoreBoard().get_dict()["scoreboard"]

    jogos = []
    for jogo in placar["games"]:
        jogos.append({
            "horario_utc": jogo["gameTimeUTC"],
            "casa": montar_perfil(jogo["homeTeam"], geral, recente, elenco, elenco5, lesoes),
            "visitante": montar_perfil(jogo["awayTeam"], geral, recente, elenco, elenco5, lesoes),
        })

    saida = {
        "atualizado_em": datetime.now().isoformat(timespec="seconds"),
        "data_jogos": placar["gameDate"],
        "lesoes_ok": bool(lesoes),
        "media_liga": {"ataque": round(media_ataque, 2), "ritmo": round(media_ritmo, 2)},
        "jogos": jogos,
    }

    with open("jogos.json", "w", encoding="utf-8") as arquivo:
        json.dump(saida, arquivo, ensure_ascii=False, indent=2)

    # A página lê este arquivo (funciona com duplo clique, sem servidor)
    with open("dados.js", "w", encoding="utf-8") as arquivo:
        arquivo.write("const DADOS = " + json.dumps(saida, ensure_ascii=False) + ";")

    print(f"Pronto! {len(jogos)} jogos salvos em jogos.json e dados.js")


main()
