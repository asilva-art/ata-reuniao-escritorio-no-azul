#!/usr/bin/env python3
import argparse
import json
import re
from datetime import date
from pathlib import Path


def slugify(text: str) -> str:
    text = text.lower()
    repl = {
        "a": "[áàâãä]",
        "e": "[éèêë]",
        "i": "[íìîï]",
        "o": "[óòôõö]",
        "u": "[úùûü]",
        "c": "[ç]",
    }
    for target, pat in repl.items():
        text = re.sub(pat, target, text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"^-+|-+$", "", text)
    return text[:80]


def load_payload(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    required = ["numero", "data", "titulo", "participantes", "prioridade", "status_inicial"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise ValueError(f"Campos obrigatorios ausentes: {', '.join(missing)}")
    return data


def render_ata(template: str, payload: dict, slug: str) -> str:
    num = str(payload["numero"]).zfill(3)
    dt = payload["data"]
    dt_br = dt
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", dt)
    if m:
        dt_br = f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return template.format(
        ata_numero=num,
        ata_titulo=payload["titulo"],
        data_iso=payload["data"],
        data_br=dt_br,
        participantes=payload["participantes"],
        slug=slug,
    )


def build_catalog_html(entries: list[dict]) -> str:
    rows = []
    for it in entries:
        rows.append(
            """
          <tr>
            <td>{titulo}</td>
            <td>{categoria}</td>
            <td>{slug}</td>
            <td>{tipo}</td>
            <td>{data}</td>
            <td><a href=".{link_final}">{link_final}</a></td>
            <td>{prioridade}</td>
            <td>{status}</td>
          </tr>
            """.strip().format(
                titulo=it["titulo"],
                categoria=it["categoria"],
                slug=it["slug"],
                tipo=it["tipo"],
                data=it["data"],
                link_final=it["link_final"],
                prioridade=it["prioridade"],
                status=it.get("status", "publicada"),
            )
        )

    rows_html = "\n".join(rows)

    return f"""<!doctype html>
<html lang=\"pt-BR\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>Catalogo de Atas</title>
  <style>
    :root {{ --bg:#f7f7f5; --card:#fff; --text:#1f2328; --line:#e7e8ea; --accent:#0f766e; }}
    body {{ margin:0; font-family:\"Avenir Next\",\"Segoe UI\",sans-serif; background:var(--bg); color:var(--text); }}
    main {{ width:min(960px,92vw); margin:32px auto; }}
    .card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; }}
    h1 {{ margin:0 0 14px; font-size:1.4rem; }}
    table {{ width:100%; border-collapse:collapse; font-size:.95rem; }}
    th,td {{ border:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }}
    th {{ background:#f8fafb; }}
    a {{ color:var(--accent); text-decoration:none; }}
    a:hover {{ text-decoration:underline; }}
  </style>
</head>
<body>
  <main>
    <section class=\"card\">
      <h1>Catalogo de Atas</h1>
      <p style=\"margin:0 0 12px; color:#5f6b7a;\"><a href=\"./index.html\">Voltar ao Hub de Atas</a></p>
      <p style=\"margin:0 0 12px; color:#5f6b7a;\">Atas com status <strong>rascunho</strong> nao aparecem no Hub principal.</p>
      <table>
        <thead>
          <tr>
            <th>Titulo</th><th>Categoria</th><th>Slug</th><th>Tipo</th><th>Data</th><th>Link final</th><th>Prioridade</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows_html}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True)
    parser.add_argument("--repo-base-url", required=True)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    payload = load_payload(Path(args.payload))

    numero = str(payload["numero"]).zfill(3)
    slug = f"ata-{numero}-{slugify(payload['titulo'])}"
    link_final = f"/profissional/entregas/{slug}/"

    template_path = root / "templates" / "ata_template.html"
    html_template = template_path.read_text(encoding="utf-8")
    final_html = render_ata(html_template, payload, slug)

    ata_dir = root / "profissional" / "entregas" / slug
    ata_dir.mkdir(parents=True, exist_ok=True)
    (ata_dir / "index.html").write_text(final_html, encoding="utf-8")

    catalog_path = root / "catalogo.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))

    status_inicial = payload.get("status_inicial", "rascunho").strip().lower()
    published = status_inicial == "publicada"
    status = "publicada" if published else "rascunho"

    new_entry = {
        "titulo": f"Ata {numero} • {payload['titulo']}",
        "categoria": "profissional/entregas",
        "slug": slug,
        "tipo": "profissional",
        "data": payload["data"],
        "link_final": link_final,
        "prioridade": payload["prioridade"],
        "status": status,
        "publicado": published,
        "fonte_criacao": "workflow_auto",
        "atualizado_em": date.today().isoformat(),
    }

    updated = False
    for i, item in enumerate(catalog):
        if item.get("slug") == slug:
            catalog[i] = new_entry
            updated = True
            break
    if not updated:
        catalog.insert(0, new_entry)

    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    catalog_html = build_catalog_html(catalog)
    (root / "catalogo.html").write_text(catalog_html, encoding="utf-8")

    result = {
        "slug": slug,
        "status": status,
        "publicado": published,
        "url": f"{args.repo_base_url}{link_final}",
        "catalogo_url": f"{args.repo_base_url}/catalogo.html",
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
