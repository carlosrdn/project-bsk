"""Backtesting walk-forward das projeções individuais do Project BSK.

Uso:
    python backtest.py

O script consulta os logs da temporada corrente. Para prever cada partida,
usa exclusivamente jogos anteriores do mesmo jogador (nunca o jogo avaliado).
Não utiliza lesões históricas nem linhas de casas de apostas.
"""
import json
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from nba_api.stats.endpoints import leaguegamelog

TEMPORADA = "2026-27"
MINUTOS_MINIMOS = 12
JOGOS_MINIMOS = 5
ESTATISTICAS = {
    "pts": "PTS",
    "reb": "REB",
    "ast": "AST",
    "tres": "FG3M",
}


def minutos_em_decimal(valor):
    """Converte número ou texto MM:SS em minutos decimais."""
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


def data_ordenavel(valor):
    """Converte formatos de data da NBA para datetime, sem ordenar texto."""
    texto = str(valor or "").strip()
    for formato in ("%b %d, %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato)
        except ValueError:
            pass
    raise ValueError(f"Formato de GAME_DATE não reconhecido: {valor!r}")


def media(valores):
    return sum(valores) / len(valores) if valores else None


def projetar(valores):
    """Replica a combinação temporada + últimos 5 usada no painel diário."""
    if len(valores) < JOGOS_MINIMOS:
        return None
    recentes = valores[:5]
    peso_recente = 0.35 * min(len(valores), 5) / 5
    return media(valores) * (1 - peso_recente) + media(recentes) * peso_recente


def carregar_jogos():
    resposta = leaguegamelog.LeagueGameLog(
        season=TEMPORADA,
        player_or_team_abbreviation="P",
        timeout=60,
    )
    return resposta.get_normalized_dict()["LeagueGameLog"]


def avaliar(linhas):
    por_jogador = defaultdict(list)
    for linha in linhas:
        por_jogador[linha["PLAYER_ID"]].append(linha)

    resultados = {chave: [] for chave in ESTATISTICAS}
    total_jogos = 0

    for player_id, jogos in por_jogador.items():
        # Ordenação crescente para caminhar cronologicamente.
        jogos.sort(key=lambda j: (data_ordenavel(j["GAME_DATE"]), j["GAME_ID"]))
        historico = []

        for jogo in jogos:
            data_jogo = data_ordenavel(jogo["GAME_DATE"])
            # Só entram jogos anteriores em outra data. Isso evita que uma
            # segunda partida no mesmo dia contamine a previsão da primeira.
            anteriores = [
                h for h in historico
                if data_ordenavel(h["GAME_DATE"]) < data_jogo
                and minutos_em_decimal(h.get("MIN")) >= MINUTOS_MINIMOS
            ]

            if minutos_em_decimal(jogo.get("MIN")) >= MINUTOS_MINIMOS:
                total_jogos += 1
                for chave, campo in ESTATISTICAS.items():
                    valores = [float(h[campo] or 0) for h in anteriores]
                    previsao = projetar(valores)
                    if previsao is None:
                        continue
                    real = float(jogo[campo] or 0)
                    resultados[chave].append({
                        "player_id": player_id,
                        "jogador": jogo.get("PLAYER_NAME", ""),
                        "data": data_jogo.strftime("%Y-%m-%d"),
                        "adversario": jogo.get("MATCHUP", ""),
                        "jogos_anteriores": len(valores),
                        "previsao": round(previsao, 2),
                        "real": real,
                        "erro": round(previsao - real, 2),
                    })

            historico.append(jogo)

    return resultados, total_jogos


def metricas(registros):
    if not registros:
        return {
            "previsoes": 0,
            "mae": None,
            "rmse": None,
            "vies": None,
            "dentro_1_ponto": None,
        }
    erros = [r["previsao"] - r["real"] for r in registros]
    n = len(erros)
    return {
        "previsoes": n,
        "mae": round(sum(abs(e) for e in erros) / n, 3),
        "rmse": round(math.sqrt(sum(e * e for e in erros) / n), 3),
        "vies": round(sum(erros) / n, 3),
        "dentro_1_ponto": round(
            sum(1 for e in erros if abs(e) <= 1) / n * 100, 1
        ),
    }


def main():
    print(f"Buscando logs da temporada {TEMPORADA}...")
    linhas = carregar_jogos()
    resultados, jogos_validos = avaliar(linhas)

    resumo = {
        "temporada": TEMPORADA,
        "gerado_em": datetime.now().isoformat(timespec="seconds"),
        "metodo": "walk-forward cronológico por jogador",
        "criterios": {
            "minutos_minimos": MINUTOS_MINIMOS,
            "jogos_anteriores_minimos": JOGOS_MINIMOS,
            "peso_ultimos_5": 0.35,
        },
        "jogos_com_minutos_suficientes": jogos_validos,
        "estatisticas": {
            chave: {
                **metricas(registros),
                "resultados": registros,
            }
            for chave, registros in resultados.items()
        },
        "limitacoes": [
            "Usa somente médias históricas do próprio jogador.",
            "Não incorpora adversário, mando, lesões ou escalações históricas.",
            "Não usa linhas reais de casas de apostas; não mede ROI.",
            "Amostras com menos de 5 jogos anteriores elegíveis são ignoradas.",
        ],
    }

    caminho = Path("backtest_resultados.json")
    caminho.write_text(
        json.dumps(resumo, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Backtesting concluído. Arquivo: {caminho.resolve()}")
    for chave, dados in resumo["estatisticas"].items():
        m = {k: v for k, v in dados.items() if k != "resultados"}
        print(f"{chave.upper()}: {m}")


if __name__ == "__main__":
    main()
