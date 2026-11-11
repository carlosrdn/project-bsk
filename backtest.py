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


PESOS_COMPARACAO = (0.0, 0.2, 0.35, 0.5, 0.75, 1.0)


def projetar(valores, peso_recente=0.35):
    """Combina a média anterior com os cinco jogos cronologicamente mais recentes."""
    if len(valores) < JOGOS_MINIMOS:
        return None
    if not 0 <= peso_recente <= 1:
        raise ValueError("O peso recente deve estar entre zero e um.")
    recentes = valores[-5:]
    return media(valores) * (1 - peso_recente) + media(recentes) * peso_recente


def projetar_legado(valores):
    """Reproduz a implementação anterior (que escolhia os cinco mais antigos)."""
    if len(valores) < JOGOS_MINIMOS:
        return None
    return media(valores) * 0.65 + media(valores[:5]) * 0.35


def faixa_minutos_anteriores(anteriores):
    """Classifica estabilidade com base APENAS nos cinco jogos anteriores elegíveis."""
    if len(anteriores) < JOGOS_MINIMOS:
        return None
    minutos = [minutos_em_decimal(j.get("MIN")) for j in anteriores[-5:]]
    return "estavel" if max(minutos) - min(minutos) <= 5 else "variavel"


def avaliar_comparacao(linhas):
    """Avalia todos os pesos nos MESMOS jogos, sem consultar resultados futuros."""
    por_jogador = defaultdict(list)
    for linha in linhas:
        por_jogador[linha["PLAYER_ID"]].append(linha)

    registros = {
        chave: {nome: [] for nome in ("legado", *(f"peso_{p:.2f}" for p in PESOS_COMPARACAO))}
        for chave in ESTATISTICAS
    }
    segmentos = {
        chave: {classe: {nome: [] for nome in registros[chave]} for classe in ("estavel", "variavel")}
        for chave in ESTATISTICAS
    }

    for jogos in por_jogador.values():
        jogos.sort(key=lambda j: (data_ordenavel(j["GAME_DATE"]), j["GAME_ID"]))
        historico = []
        for jogo in jogos:
            data_atual = data_ordenavel(jogo["GAME_DATE"])
            anteriores = [
                h for h in historico
                if data_ordenavel(h["GAME_DATE"]) < data_atual
                and minutos_em_decimal(h.get("MIN")) >= MINUTOS_MINIMOS
            ]
            if (minutos_em_decimal(jogo.get("MIN")) >= MINUTOS_MINIMOS
                    and len(anteriores) >= JOGOS_MINIMOS):
                classe = faixa_minutos_anteriores(anteriores)
                for chave, campo in ESTATISTICAS.items():
                    valores = [float(h[campo] or 0) for h in anteriores]
                    real = float(jogo[campo] or 0)
                    previsoes = {"legado": projetar_legado(valores)}
                    previsoes.update({
                        f"peso_{peso:.2f}": projetar(valores, peso)
                        for peso in PESOS_COMPARACAO
                    })
                    for nome, previsao in previsoes.items():
                        registro = {"previsao": previsao, "real": real}
                        registros[chave][nome].append(registro)
                        segmentos[chave][classe][nome].append(registro)
            historico.append(jogo)

    def agregar(dados):
        return {nome: metricas(linhas) for nome, linhas in dados.items()}

    return {
        "pesos_testados": list(PESOS_COMPARACAO),
        "metodo_legado": "35% dos cinco primeiros jogos anteriores (erro de ordenação da versão inicial)",
        "metodo_corrigido": "média geral anterior + peso dos cinco últimos jogos anteriores",
        "por_estatistica": {chave: agregar(dados) for chave, dados in registros.items()},
        "por_estabilidade_minutos": {
            chave: {classe: agregar(dados) for classe, dados in classes.items()}
            for chave, classes in segmentos.items()
        },
        "nota": "Comparação retrospectiva exploratória; escolher o melhor peso aqui não garante resultado futuro.",
    }


def carregar_jogos():
    # Importação tardia: permite executar os testes offline sem instalar nba_api.
    from nba_api.stats.endpoints import leaguegamelog

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
                    previsao = projetar_legado(valores)
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
    comparacao = avaliar_comparacao(linhas)

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
        "comparacao_modelos": comparacao,
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
            "A seção estatisticas preserva o modelo inicial (legado); comparacao_modelos testa a correção.",
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
    print("\\nComparacao de pesos (MAE; menor e melhor):")
    for chave, modelos in comparacao["por_estatistica"].items():
        print(chave.upper(), {nome: dados["mae"] for nome, dados in modelos.items()})


if __name__ == "__main__":
    main()
