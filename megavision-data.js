// ============================================================
//  MEGAVISION ECOSYSTEM — MÓDULO CENTRAL DE DADOS v2.0
// ============================================================

const MV_CONFIG = {
  url: 'https://eguvqvcvutrkwyyxfyye.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXZxdmN2dXRya3d5eXhmeXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTA2MzgsImV4cCI6MjA4NzM4NjYzOH0.xg2QY_EO8ZhZylmAdG7lx0vLFS6mpn2Bjm3-OksFpK8',  // ← chave anon que começa com eyJ...
  versao: '2.0',
  ecosistema: 'MEGAVISION'
};

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
let _mvClient = null;

function _initMV() {
  if (_mvClient) return _mvClient;
  try {
    _mvClient = supabase.createClient(MV_CONFIG.url, MV_CONFIG.key);
    console.log('%c[MEGAVISION] Supabase conectado ✅', 'color:#6366f1;font-weight:bold');
  } catch(e) {
    console.warn('[MEGAVISION] Erro ao conectar Supabase:', e.message);
  }
  return _mvClient;
}

// ── PEGAR USER_ID DO USUÁRIO LOGADO ──────────────────────────
async function _getUserId() {
  if (!_mvClient) return null;
  try {
    const { data: { session } } = await _mvClient.auth.getSession();
    return session?.user?.id || null;
  } catch(e) { return null; }
}

// ── API PÚBLICA: MVData ───────────────────────────────────────
const MVData = {

  // SALVAR — sempre inclui user_id
  async salvar(tabela, dados) {
    _initMV();
    const userId = await _getUserId();

    // Verifica se já existe registro com mesmo tipo para atualizar
    if (dados.tipo && userId) {
      const existe = await this.buscar(tabela, { tipo: dados.tipo });
      if (existe.length > 0) {
        // ATUALIZA em vez de inserir duplicado
        const { error } = await _mvClient
          .from(tabela)
          .update({ dados: dados.dados, criado_em: new Date().toISOString() })
          .eq('id', existe[0].id)
          .eq('user_id', userId);
        if (!error) {
          // Atualiza localStorage também
          _localSet(`${tabela}_${dados.tipo}`, dados.dados);
          return { ok: true, origem: 'supabase_update' };
        }
      }
    }

    const registro = {
      ...dados,
      user_id:    userId,
      ferramenta: dados.ferramenta || tabela,
      criado_em:  new Date().toISOString(),
      ecosistema: MV_CONFIG.ecosistema
    };

    if (_mvClient && userId) {
      const { data, error } = await _mvClient.from(tabela).insert([registro]).select();
      if (!error) {
        // Salva no localStorage como cache
        if (dados.tipo) _localSet(`${tabela}_${dados.tipo}`, dados.dados);
        return { ok: true, data: data?.[0], origem: 'supabase' };
      }
      console.warn('[MEGAVISION] Erro Supabase, salvando local:', error.message);
    }

    // Fallback offline
    if (dados.tipo) _localSet(`${tabela}_${dados.tipo}`, dados.dados);
    _marcarPendente(tabela);
    return { ok: true, origem: 'local' };
  },

  // BUSCAR — filtra por user_id automaticamente
  async buscar(tabela, filtros = {}) {
    _initMV();
    const userId = await _getUserId();

    if (_mvClient && userId) {
      let q = _mvClient.from(tabela).select('*').eq('user_id', userId);
      Object.entries(filtros).forEach(([col, val]) => { q = q.eq(col, val); });
      const { data, error } = await q.order('criado_em', { ascending: false });
      if (!error && data) return data;
      console.warn('[MEGAVISION] Erro Supabase, buscando local:', error?.message);
    }

    // Fallback: tenta buscar do localStorage
    if (filtros.tipo) {
      const cached = _localGet(`${tabela}_${filtros.tipo}`);
      if (cached) return [{ dados: cached, tipo: filtros.tipo }];
    }
    return [];
  },

  // DELETAR
  async deletar(tabela, id) {
    _initMV();
    const userId = await _getUserId();
    if (_mvClient && userId) {
      const { error } = await _mvClient.from(tabela).delete().eq('id', id).eq('user_id', userId);
      if (!error) return { ok: true };
    }
    return { ok: true, origem: 'local' };
  },

  // CONTAR
  async contar(tabela, filtros = {}) {
    const lista = await this.buscar(tabela, filtros);
    return lista.length;
  },

  // STATUS
  status() {
    const chaveOk = MV_CONFIG.key.startsWith('eyJ');
    return {
      online:   !!_mvClient,
      supabase: chaveOk,
      pendentes: JSON.parse(localStorage.getItem('mv_pendentes') || '[]'),
      versao:   MV_CONFIG.versao
    };
  }
};

// ── HELPERS LOCALSTORAGE ──────────────────────────────────────
function _localGet(chave) {
  try { return JSON.parse(localStorage.getItem('mv_' + chave) || 'null'); } catch(e) { return null; }
}
function _localSet(chave, dados) {
  try { localStorage.setItem('mv_' + chave, JSON.stringify(dados)); } catch(e) {}
}
function _marcarPendente(tabela) {
  const p = JSON.parse(localStorage.getItem('mv_pendentes') || '[]');
  if (!p.includes(tabela)) { p.push(tabela); localStorage.setItem('mv_pendentes', JSON.stringify(p)); }
}

document.addEventListener('DOMContentLoaded', _initMV);
