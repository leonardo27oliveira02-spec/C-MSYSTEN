// ============================================================
//  MEGAVISION ECOSYSTEM — MÓDULO CENTRAL DE DADOS v3.0
//  Correções: user_id consistente, fallback seguro, sem vazamento
// ============================================================

const MV_CONFIG = {
  url: 'https://eguvqvcvutrkwyyxfyye.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXZxdmN2dXRya3d5eXhmeXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTA2MzgsImV4cCI6MjA4NzM4NjYzOH0.xg2QY_EO8ZhZylmAdG7lx0vLFS6mpn2Bjm3-OksFpK8',
  versao: '3.0',
  ecosistema: 'MEGAVISION'
};

let _mvClient = null;
let _mvUserId = null; // cache do user_id atual

// ── INIT ──────────────────────────────────────────────────────
function _initMV() {
  if (_mvClient) return _mvClient;
  try {
    _mvClient = supabase.createClient(MV_CONFIG.url, MV_CONFIG.key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    console.log('%c[MEGAVISION] Supabase v3 conectado ✅', 'color:#6366f1;font-weight:bold');
  } catch(e) {
    console.warn('[MEGAVISION] Erro ao conectar:', e.message);
  }
  return _mvClient;
}

// ── USER ID SEGURO ────────────────────────────────────────────
// Sempre pega o user_id da sessão ativa — nunca do localStorage
async function _getUserId() {
  if (!_mvClient) return null;
  try {
    const { data: { session } } = await _mvClient.auth.getSession();
    _mvUserId = session?.user?.id || null;
    return _mvUserId;
  } catch(e) { return null; }
}

// ── CHAVE LOCAL SEGURA ────────────────────────────────────────
// Prefixada com user_id para nunca misturar dados de usuários diferentes
function _localKey(userId, tabela, tipo) {
  if (!userId) return null;
  return `mv_${userId}_${tabela}_${tipo||'all'}`;
}

// ══════════════════════════════════════════════════════════════
//  API PÚBLICA: MVData
// ══════════════════════════════════════════════════════════════
const MVData = {

  // ── SALVAR ──────────────────────────────────────────────────
  async salvar(tabela, dados) {
    _initMV();
    const userId = await _getUserId();

    // Tenta atualizar registro existente primeiro (evita duplicatas)
    if (dados.tipo && userId) {
      try {
        const { data: existe } = await _mvClient
          .from(tabela).select('id').eq('user_id', userId).eq('tipo', dados.tipo).single();
        if (existe?.id) {
          const { error } = await _mvClient.from(tabela)
            .update({ dados: dados.dados, criado_em: new Date().toISOString() })
            .eq('id', existe.id);
          if (!error) {
            // Atualiza cache local com chave segura
            const key = _localKey(userId, tabela, dados.tipo);
            if (key) localStorage.setItem(key, JSON.stringify(dados.dados));
            return { ok: true, origem: 'supabase_update' };
          }
        }
      } catch(e) {}
    }

    // Insere novo registro
    const registro = {
      ...dados,
      user_id: userId,
      ferramenta: dados.ferramenta || tabela,
      criado_em: new Date().toISOString(),
      ecosistema: MV_CONFIG.ecosistema
    };

    if (_mvClient && userId) {
      const { data, error } = await _mvClient.from(tabela).insert([registro]).select();
      if (!error) {
        const key = _localKey(userId, tabela, dados.tipo);
        if (key && dados.dados) localStorage.setItem(key, JSON.stringify(dados.dados));
        return { ok: true, data: data?.[0], origem: 'supabase_insert' };
      }
      console.warn('[MEGAVISION] Erro Supabase, salvando local:', error.message);
    }

    // Fallback offline — salva com user_id na chave
    const key = _localKey(userId || 'offline', tabela, dados.tipo);
    if (key && dados.dados) {
      localStorage.setItem(key, JSON.stringify(dados.dados));
      _marcarPendente(tabela, userId);
    }
    return { ok: true, origem: 'local' };
  },

  // ── BUSCAR ──────────────────────────────────────────────────
  async buscar(tabela, filtros = {}) {
    _initMV();
    const userId = await _getUserId();

    // Online com usuário logado → sempre prioriza Supabase
    if (_mvClient && userId) {
      try {
        let q = _mvClient.from(tabela).select('*').eq('user_id', userId);
        Object.entries(filtros).forEach(([col, val]) => { q = q.eq(col, val); });
        const { data, error } = await q.order('criado_em', { ascending: false });
        if (!error && data) {
          // Atualiza cache local
          if (filtros.tipo && data.length) {
            const key = _localKey(userId, tabela, filtros.tipo);
            if (key) localStorage.setItem(key, JSON.stringify(data[0].dados));
          }
          return data;
        }
      } catch(e) {}
    }

    // Fallback offline — só retorna dados DO usuário atual
    if (filtros.tipo) {
      const key = _localKey(userId || 'offline', tabela, filtros.tipo);
      if (key) {
        const cached = localStorage.getItem(key);
        if (cached) return [{ dados: JSON.parse(cached), tipo: filtros.tipo }];
      }
    }
    return [];
  },

  // ── DELETAR ─────────────────────────────────────────────────
  async deletar(tabela, id) {
    _initMV();
    const userId = await _getUserId();
    if (_mvClient && userId) {
      const { error } = await _mvClient.from(tabela).delete()
        .eq('id', id).eq('user_id', userId); // dupla verificação
      if (!error) return { ok: true };
    }
    return { ok: false };
  },

  // ── CONTAR ──────────────────────────────────────────────────
  async contar(tabela, filtros = {}) {
    const lista = await this.buscar(tabela, filtros);
    return lista.length;
  },

  // ── SINCRONIZAR pendentes offline → Supabase ────────────────
  async sincronizar() {
    _initMV();
    const userId = await _getUserId();
    if (!_mvClient || !userId) return { ok: false };
    const pendentes = JSON.parse(localStorage.getItem(`mv_pendentes_${userId}`) || '[]');
    if (!pendentes.length) return { ok: true, sincronizados: 0 };
    let sincronizados = 0;
    for (const { tabela, tipo } of pendentes) {
      const key = _localKey(userId, tabela, tipo);
      const dados = localStorage.getItem(key);
      if (dados) {
        await this.salvar(tabela, { tipo, dados: JSON.parse(dados) });
        sincronizados++;
      }
    }
    localStorage.removeItem(`mv_pendentes_${userId}`);
    return { ok: true, sincronizados };
  },

  // ── STATUS ──────────────────────────────────────────────────
  status() {
    return {
      online:   !!_mvClient,
      supabase: MV_CONFIG.key.startsWith('eyJ'),
      userId:   _mvUserId,
      logado:   !!_mvUserId,
      versao:   MV_CONFIG.versao
    };
  }
};

// ── HELPERS ───────────────────────────────────────────────────
function _marcarPendente(tabela, userId) {
  const key = `mv_pendentes_${userId||'offline'}`;
  const p = JSON.parse(localStorage.getItem(key) || '[]');
  if (!p.find(x => x.tabela === tabela)) {
    p.push({ tabela, timestamp: Date.now() });
    localStorage.setItem(key, JSON.stringify(p));
  }
}

// Auto-init + sincroniza pendentes quando voltar online
document.addEventListener('DOMContentLoaded', async () => {
  _initMV();
  // Sincroniza dados offline quando voltar online
  window.addEventListener('online', () => MVData.sincronizar());
  // Se tem pendentes, tenta sincronizar agora
  setTimeout(() => MVData.sincronizar(), 2000);
});
