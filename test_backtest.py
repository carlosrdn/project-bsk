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


if __name__ == "__main__":
    unittest.main()
