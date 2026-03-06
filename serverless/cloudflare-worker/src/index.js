export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    const allowedOrigins = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const corsOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || '*');
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
    }

    try {
      const body = await request.json();
      if (url.pathname === '/api/nova-ata') {
        const payload = validatePayloadNewAta(body);
        const issueTitle = `[NOVA ATA] Ata ${String(payload.numero).padStart(3, '0')} • ${payload.titulo}`;
        const issueBody = buildIssueBodyNewAta(payload);

        const ghRes = await createIssue(env, issueTitle, issueBody, ['nova-ata']);
        if (!ghRes.ok) {
          return json({ ok: false, error: ghRes.error || 'Falha ao criar issue no GitHub.' }, 400, corsHeaders);
        }

        return json({
          ok: true,
          issue_url: ghRes.issue_url,
          issue_number: ghRes.issue_number,
          message: 'Issue criada. Workflow de publicação foi acionado.'
        }, 200, corsHeaders);
      }

      if (url.pathname === '/api/atualizar-ata') {
        const payload = validatePayloadUpdateAta(body);
        const issueTitle = `[ATUALIZAR ATA] ${payload.slug}`;
        const issueBody = buildIssueBodyUpdateAta(payload);

        const ghRes = await createIssue(env, issueTitle, issueBody, ['atualizar-ata']);
        if (!ghRes.ok) {
          return json({ ok: false, error: ghRes.error || 'Falha ao criar issue no GitHub.' }, 400, corsHeaders);
        }

        return json({
          ok: true,
          issue_url: ghRes.issue_url,
          issue_number: ghRes.issue_number,
          message: 'Issue de atualização criada. Workflow foi acionado.'
        }, 200, corsHeaders);
      }

      return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
    } catch (err) {
      return json({ ok: false, error: err.message || 'Erro interno.' }, 500, corsHeaders);
    }
  }
};

function json(obj, status, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}

async function createIssue(env, title, body, labels) {
  const ghRes = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'ata-hub-worker'
    },
    body: JSON.stringify({ title, body, labels })
  });

  const ghJson = await ghRes.json().catch(() => ({}));
  if (!ghRes.ok) {
    return { ok: false, error: ghJson.message || 'Falha ao criar issue no GitHub.' };
  }

  return { ok: true, issue_url: ghJson.html_url, issue_number: ghJson.number };
}

function validatePayloadNewAta(input) {
  const required = ['numero', 'data', 'titulo', 'participantes', 'prioridade', 'status_inicial'];
  const data = {};

  for (const key of required) {
    const value = String(input?.[key] ?? '').trim();
    if (!value) throw new Error(`Campo obrigatório ausente: ${key}`);
    data[key] = value;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.data)) {
    throw new Error('Campo data deve estar no formato AAAA-MM-DD.');
  }

  const okStatus = ['rascunho', 'publicada'];
  if (!okStatus.includes(data.status_inicial.toLowerCase())) {
    throw new Error('status_inicial deve ser rascunho ou publicada.');
  }

  return {
    ...data,
    status_inicial: data.status_inicial.toLowerCase()
  };
}

function validatePayloadUpdateAta(input) {
  const slug = String(input?.slug ?? '').trim().toLowerCase();
  const html = String(input?.html ?? '').trim();
  const titulo = String(input?.titulo ?? '').trim();
  if (!slug) throw new Error('Campo obrigatório ausente: slug');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('slug inválido.');
  if (!html) throw new Error('Campo obrigatório ausente: html');
  if (html.length > 250000) throw new Error('Conteúdo HTML excede o tamanho permitido.');
  return { slug, html, titulo };
}

function buildIssueBodyNewAta(payload) {
  return [
    'Solicitação automática de nova ata.',
    '',
    '<!-- ATA_PAYLOAD_START -->',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '<!-- ATA_PAYLOAD_END -->'
  ].join('\n');
}

function buildIssueBodyUpdateAta(payload) {
  return [
    'Solicitação automática de atualização de ata.',
    '',
    '<!-- ATA_UPDATE_PAYLOAD_START -->',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '<!-- ATA_UPDATE_PAYLOAD_END -->'
  ].join('\n');
}
