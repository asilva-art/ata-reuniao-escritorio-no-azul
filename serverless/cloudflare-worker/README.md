# Ata Hub Publisher (Cloudflare Worker)

Endpoint serverless para publicar atas sem token no navegador.

## O que faz
- Recebe `POST /api/nova-ata` com o payload da ata.
- Cria um issue com label `nova-ata` no GitHub.
- O workflow do repositório processa automaticamente e publica/atualiza a ata.

## Deploy
1. Instale e autentique o Wrangler (`npm i -g wrangler`, `wrangler login`).
2. Entre nesta pasta.
3. Configure o secret:
   - `wrangler secret put GITHUB_TOKEN`
4. Publique:
   - `wrangler deploy`

## Variáveis
Definidas em `wrangler.toml`:
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `ALLOWED_ORIGINS`

Secret obrigatório:
- `GITHUB_TOKEN` (escopos `repo` e `workflow`)

## Payload esperado
```json
{
  "numero": "002",
  "data": "2026-03-06",
  "titulo": "Reunião de Pendências",
  "participantes": "...",
  "prioridade": "média",
  "status_inicial": "rascunho"
}
```
