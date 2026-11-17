"""Lê o boletim oficial da NBA para a data da rodada."""
import re
import subprocess
from datetime import datetime
from urllib.request import Request, urlopen

from gerar_dados import normalizar

STATUS = {
    "Out": "Fora", "Doubtful": "Provável ausência", "Questionable": "Dúvida",
    "Probable": "Provável", "Available": "Disponível",
}
REPORT_LINK = re.compile(
    r'https://(?:ak-static\.cms\.nba\.com|official\.nba\.com)/referee/injury/'
    r'Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf', re.I
)


def report_urls(html, day):
    reports = {}
    for match in REPORT_LINK.finditer(html):
        date, hour, minute, period = match.groups()
        if date == day.isoformat():
            timestamp = datetime.strptime(f"{hour}:{minute}{period.upper()}", "%I:%M%p").time()
            reports[timestamp] = match[0]
    return [reports[key] for key in sorted(reports, reverse=True)]


def parse_report(text, day, teams):
    """Mantém o contexto entre páginas e só aceita equipes da rodada solicitada."""
    wanted = day.strftime("%m/%d/%Y")
    team_names = {normalizar(name): code for code, names in teams.items() for name in names}
    date, team = None, None
    rows = []
    for line in text.splitlines():
        fields = re.split(r" {2,}", line.strip())
        for field in fields:
            if re.fullmatch(r"\d{2}/\d{2}/\d{4}", field):
                date, team = field, None
            elif re.fullmatch(r"[A-Z]{2,4}\s*@\s*[A-Z]{2,4}", field):
                team = None
            elif normalizar(field) in team_names:
                team = team_names[normalizar(field)]
        if date != wanted or not team:
            continue
        for index, field in enumerate(fields[1:], 1):
            name = fields[index - 1]
            if field not in STATUS or "," not in name:
                continue
            last, first = (part.strip() for part in name.split(",", 1))
            if not first or not last:
                continue
            rows.append({
                "nome": f"{first} {last}", "time": "", "sigla": team, "situacao": STATUS[field],
                "motivo": " ".join(fields[index + 1:]), "retorno": None, "atualizado": day.isoformat(),
                "comentario": "",
            })
    return rows


def download(url):
    with urlopen(Request(url, headers={"User-Agent": "Project-BSK/1.0"}), timeout=10) as response:
        return response.read(6_000_001)


def official_injuries(day, season, teams):
    index = f"https://official.nba.com/nba-injury-report-{season - 1}-{season % 100:02d}-season/"
    try:
        urls = report_urls(download(index).decode("utf-8", errors="replace"), day)
        for url in urls[:2]:
            try:
                pdf = download(url)
                if not pdf.startswith(b"%PDF-") or len(pdf) > 6_000_000:
                    continue
                text = subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf,
                                      capture_output=True, timeout=8, check=True).stdout.decode("utf-8")
                rows = parse_report(text, day, teams)
                if rows:
                    return rows, url
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                print(f"Leitura do boletim oficial indisponível: {error}")
    except (OSError, ValueError) as error:
        print(f"Índice do boletim oficial indisponível: {error}")
    return [], None
