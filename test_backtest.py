"""Testes unitários offline do motor de backtesting.

Execute com: python -m unittest test_backtest.py
"""
import unittest

import backtest


def linha(data, pts, game_id, minutos="30:00"):
    return {
        "PLAYER_ID": 7,
        "PLAYER_NAME": "Jogador Teste",
        "GAME_DATE": data,
        "GAME_ID": str(game_id),
        "MATCHUP": "AAA vs. BBB",
        "MIN": minutos,
        "PTS": pts,
        "REB": 5,
        "AST": 4,
        "FG3M": 2,
    }


class TestBacktest(unittest.TestCase):
    def test_peso_recente_usa_ultimos_cinco(self):
        valores = [100, 100, 100, 100, 100, 0, 0, 0, 0, 0]
        self.assertEqual(backtest.projetar(valores, 1), 0)
        self.assertEqual(backtest.projetar(valores, 0), 50)
        self.assertEqual(backtest.projetar_legado(valores), 67.5)

    def test_comparacao_mesma_amostra_sem_antecipar_resultado(self):
        linhas = [
            linha(f"NOV {dia:02d}, 2026", 10 if dia <= 5 else 40, dia)
            for dia in range(1, 8)
        ]
        comparacao = backtest.avaliar_comparacao(linhas)
        modelos = comparacao["por_estatistica"]["pts"]
        self.assertEqual(len(set(v["previsoes"] for v in modelos.values())), 1)
        self.assertEqual(modelos["legado"]["previsoes"], 2)
        self.assertEqual(modelos["peso_0.35"]["previsoes"], 2)

    def test_faixa_minutos_usa_apenas_historico(self):
        anteriores = [linha(f"NOV {d:02d}, 2026", 10, d, "30:00") for d in range(1, 6)]
        self.assertEqual(backtest.faixa_minutos_anteriores(anteriores), "estavel")
        anteriores[-1]["MIN"] = "40:00"
        self.assertEqual(backtest.faixa_minutos_anteriores(anteriores), "variavel")

    def test_converte_data_da_nba_e_iso(self):
        self.assertEqual(
            backtest.data_ordenavel("NOV 11, 2026").strftime("%Y-%m-%d"),
            "2026-11-11",
        )
        self.assertEqual(
            backtest.data_ordenavel("2026-11-11").strftime("%Y-%m-%d"),
            "2026-11-11",
        )

    def test_converte_minutos(self):
        self.assertAlmostEqual(backtest.minutos_em_decimal("34:30"), 34.5)
        self.assertEqual(backtest.minutos_em_decimal("DNP"), 0)

    def test_projecao_exige_cinco_jogos_anteriores(self):
        self.assertIsNone(backtest.projetar([10, 12, 14, 16]))
        self.assertEqual(backtest.projetar([10, 12, 14, 16, 18]), 14)

    def test_walk_forward_nao_usa_o_jogo_avaliado(self):
        linhas = [
            linha("NOV 01, 2026", 10, 1),
            linha("NOV 02, 2026", 12, 2),
            linha("NOV 03, 2026", 14, 3),
            linha("NOV 04, 2026", 16, 4),
            linha("NOV 05, 2026", 18, 5),
            linha("NOV 06, 2026", 40, 6),
        ]
        resultados, _ = backtest.avaliar(linhas)
        alvo = [
            r for r in resultados["pts"]
            if r["data"] == "2026-11-06"
        ]
        self.assertEqual(len(alvo), 1)
        self.assertEqual(alvo[0]["jogos_anteriores"], 5)
        self.assertEqual(alvo[0]["previsao"], 14)
        self.assertEqual(alvo[0]["real"], 40)

    def test_jogo_no_mesmo_dia_nao_entra_no_historico(self):
        linhas = [
            linha("NOV 01, 2026", 10, 1),
            linha("NOV 02, 2026", 12, 2),
            linha("NOV 03, 2026", 14, 3),
            linha("NOV 04, 2026", 16, 4),
            linha("NOV 05, 2026", 18, 5),
            linha("NOV 06, 2026", 20, 6),
            linha("NOV 06, 2026", 50, 7),
        ]
        resultados, _ = backtest.avaliar(linhas)
        mesmo_dia = [r for r in resultados["pts"] if r["data"] == "2026-11-06"]
        self.assertTrue(all(r["jogos_anteriores"] == 5 for r in mesmo_dia))


    def test_holdout_temporal_nao_usa_datas_futuras_para_treino(self):
        linhas=[linha(f"NOV {dia:02d}, 2026", 10 if dia<=10 else 25, dia) for dia in range(1,17)]
        resumo=backtest.avaliar_holdout(linhas)
        self.assertEqual(resumo["status"],"holdout_temporal")
        self.assertLess(resumo["treino_ate"],resumo["teste_desde"])
        self.assertTrue(all(r["data"]>=resumo["teste_desde"] for r in resumo["estatisticas"]["pts"]["resultados"]))
        self.assertIn(resumo["peso_escolhido"]["pts"],backtest.PESOS_TREINO)

    def test_jogo_curto_conta_como_erro_no_holdout(self):
        linhas=[linha(f"NOV {dia:02d}, 2026", 15, dia) for dia in range(1,17)]
        # Jogo com apenas 3 minutos está no período de teste.
        linhas[-1]["MIN"]="03:00"
        linhas[-1]["PTS"]=0
        resumo=backtest.avaliar_holdout(linhas)
        regs=resumo["estatisticas"]["pts"]["resultados"]
        self.assertTrue(any(r["data"]=="2026-11-16" and r["real"]==0 for r in regs))
        self.assertGreater(len(regs),resumo["avaliacao_condicional_12_min"]["pts"]["previsoes"])

    def test_backtest_nunca_consulta_resultado_do_mesmo_dia(self):
        linhas=[linha(f"NOV {d:02d}, 2026", d, d) for d in range(1,7)]
        linhas.append(linha("NOV 06, 2026",100,200))
        result=backtest.previsoes_walk_forward(linhas)["pts"]
        mesmo_dia=[r for r in result if r["data"]=="2026-11-06"]
        self.assertEqual(len(mesmo_dia),2)
        self.assertEqual({r["previsao_0.00"] for r in mesmo_dia},{3.0})



if __name__ == "__main__":
    unittest.main()
