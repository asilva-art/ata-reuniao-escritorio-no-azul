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

    if (url.pathname !== '/api/nova-ata' || request.method !== 'POST') {
      return json({ ok: false, error: 'Not found' }, 404, corsHeaders);
    }

    try {
      const body = await request.json();
      const payload = validatePayload(body);

      const issueTitle = `[NOVA ATA] Ata ${String(payload.numero).padStart(3, '0')} • ${payload.titulo}`;
      const issueBody = buildIssueBody(payload);

      const ghRes = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ata-hub-worker'
        },
        body: JSON.stringify({
          title: issueTitle,
          body: issueBody,
          labels: ['nova-ata']
        })
      });

      const ghJson = await ghRes.json();
      if (!ghRes.ok) {
        return json({ ok: false, error: ghJson.message || 'Falha ao criar issue no GitHub.' }, 400, corsHeaders);
      }

      return json({
        ok: true,
        issue_url: ghJson.html_url,
        issue_number: ghJson.number,
        message: 'Issue criada. Workflow de publicação foi acionado.'
      }, 200, corsHeaders);
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

function validatePayload(input) {
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

function buildIssueBody(payload) {
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
