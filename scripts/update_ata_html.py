#!/usr/bin/env python3
import argparse
import json
import re
from datetime import date
from pathlib import Path


def load_payload(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    slug = str(data.get("slug", "")).strip()
    html = str(data.get("html", "")).strip()
    if not slug:
        raise ValueError("Campo obrigatorio ausente: slug")
    if not html:
        raise ValueError("Campo obrigatorio ausente: html")
    if not re.match(r"^[a-z0-9][a-z0-9-]*$", slug):
        raise ValueError("Slug invalido.")
    return {"slug": slug, "html": html}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payload", required=True)
    parser.add_argument("--repo-base-url", required=True)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    payload = load_payload(Path(args.payload))
    slug = payload["slug"]

    ata_file = root / "profissional" / "entregas" / slug / "index.html"
    if not ata_file.exists():
        raise SystemExit(f"Ata nao encontrada para o slug: {slug}")

    ata_file.write_text(payload["html"] + "\n", encoding="utf-8")

    catalog_path = root / "catalogo.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    found = None
    for item in catalog:
        if item.get("slug") == slug:
            item["atualizado_em"] = date.today().isoformat()
            found = item
            break
    if found is None:
        raise SystemExit(f"Slug nao encontrado no catalogo: {slug}")

    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    result = {
        "slug": slug,
        "status": found.get("status", ""),
        "url": f"{args.repo_base_url}{found.get('link_final', '')}",
        "catalogo_url": f"{args.repo_base_url}/catalogo.html",
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
