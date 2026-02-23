// ============================================================
//  MEGAVISION ECOSYSTEM — MÓDULO CENTRAL DE DADOS
//  Arquivo: megavision-data.js  |  Versão 1.0
//
//  📌 COMO USAR EM QUALQUER PÁGINA:
//  1. Adicione no <head>:
//     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//     <script src="megavision-data.js"></script>
//  2. Use as funções MVData.salvar(), MVData.buscar(), etc.
// ============================================================

// ── CONFIGURAÇÃO — troque pelos seus dados do Supabase ───────
// Acesse: https://app.supabase.com → Seu Projeto → Settings → API
const MV_CONFIG = {
  url: 'https://eguvqvcvutrkwyyxfyye.supabase.co',   // ← troque aqui
  key: 'sb_publishable_TR0VygZfARzGUHiMgctDSQ_GQXelDk4',                 // ← troque aqui
  versao: '1.0',
  ecosistema: 'MEGAVISION'
};

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
let _mvClient = null;

function _initMV() {
  if (_mvClient) return _mvClient;
  if (typeof window !== 'undefined' && window.supabase) {
    _mvClient = window.supabase.createClient(MV_CONFIG.url, MV_CONFIG.key);
    console.log('%c[MEGAVISION] Supabase conectado ✅', 'color:#6366f1;font-weight:bold');
  } else {
    console.warn('[MEGAVISION] SDK não encontrado — modo offline (localStorage)');
  }
  return _mvClient;
}

// ── API PÚBLICA: MVData ───────────────────────────────────────
const MVData = {

  /**
   * SALVAR registro
   * @example await MVData.salvar('vendas', { produto: 'X', valor: 100 })
   */
  async salvar(tabela, dados) {
    _initMV();
    const registro = {
      ...dados,
      ferramenta: dados.ferramenta || tabela,
      criado_em:  dados.criado_em  || new Date().toISOString(),
      ecosistema: MV_CONFIG.ecosistema
    };

    if (_mvClient) {
      const { data, error } = await _mvClient.from(tabela).insert([registro]).select();
      if (!error) return { ok: true, data: data?.[0], origem: 'supabase' };
      console.warn('[MEGAVISION] Erro Supabase, salvando local:', error.message);
    }

    // fallback offline
    const lista = _localGet(tabela);
    registro.id = registro.id || `local_${Date.now()}`;
    lista.push(registro);
    _localSet(tabela, lista);
    _marcarPendente(tabela);
    return { ok: true, data: registro, origem: 'local' };
  },

  /**
   * BUSCAR registros
   * @example await MVData.buscar('vendas')
   * @example await MVData.buscar('vendas', { status: 'aberto' })
   */
  async buscar(tabela, filtros = {}) {
    _initMV();
    if (_mvClient) {
      let q = _mvClient.from(tabela).select('*');
      Object.entries(filtros).forEach(([col, val]) => { q = q.eq(col, val); });
      const { data, error } = await q.order('criado_em', { ascending: false });
      if (!error) return data || [];
      console.warn('[MEGAVISION] Erro Supabase, buscando local:', error.message);
    }
    let lista = _localGet(tabela);
    if (Object.keys(filtros).length) {
      lista = lista.filter(i => Object.entries(filtros).every(([k, v]) => i[k] == v));
    }
    return [...lista].reverse();
  },

  /**
   * ATUALIZAR registro por id
   * @example await MVData.atualizar('vendas', 'abc123', { valor: 200 })
   */
  async atualizar(tabela, id, dados) {
    _initMV();
    if (_mvClient) {
      const { data, error } = await _mvClient.from(tabela).update(dados).eq('id', id).select();
      if (!error) return { ok: true, data: data?.[0] };
      console.warn('[MEGAVISION] Erro ao atualizar:', error.message);
    }
    const lista = _localGet(tabela);
    const i = lista.findIndex(r => r.id == id);
    if (i !== -1) lista[i] = { ...lista[i], ...dados };
    _localSet(tabela, lista);
    return { ok: true, origem: 'local' };
  },

  /**
   * DELETAR registro por id
   * @example await MVData.deletar('vendas', 'abc123')
   */
  async deletar(tabela, id) {
    _initMV();
    if (_mvClient) {
      const { error } = await _mvClient.from(tabela).delete().eq('id', id);
      if (!error) return { ok: true };
    }
    _localSet(tabela, _localGet(tabela).filter(r => r.id != id));
    return { ok: true, origem: 'local' };
  },

  /**
   * CONTAR registros
   * @example const total = await MVData.contar('vendas')
   */
  async contar(tabela, filtros = {}) {
    const lista = await this.buscar(tabela, filtros);
    return lista.length;
  },

  /**
   * SOMAR campo numérico
   * @example const total = await MVData.somar('vendas', 'valor')
   */
  async somar(tabela, campo, filtros = {}) {
    const lista = await this.buscar(tabela, filtros);
    return lista.reduce((acc, r) => acc + (parseFloat(r[campo]) || 0), 0);
  },

  /**
   * SINCRONIZAR dados locais → Supabase
   * @example await MVData.sincronizar('vendas')
   */
  async sincronizar(tabela) {
    _initMV();
    if (!_mvClient) return { ok: false, msg: 'Supabase não conectado' };
    const pendentes = _localGet(tabela);
    if (!pendentes.length) return { ok: true, sincronizados: 0 };

    const { error } = await _mvClient.from(tabela).upsert(pendentes);
    if (!error) {
      _localSet(tabela, []);
      _removerPendente(tabela);
      console.log(`[MEGAVISION] ${pendentes.length} registros sincronizados ✅`);
      return { ok: true, sincronizados: pendentes.length };
    }
    return { ok: false, error };
  },

  /**
   * STATUS da conexão
   * @example MVData.status() → { online: true, pendentes: ['vendas'] }
   */
  status() {
    return {
      online:    !!_mvClient,
      supabase:  MV_CONFIG.url !== 'https://SEU_PROJETO.supabase.co',
      pendentes: JSON.parse(localStorage.getItem('mv_pendentes') || '[]'),
      versao:    MV_CONFIG.versao
    };
  }
};

// ── HELPERS INTERNOS ──────────────────────────────────────────
function _localGet(tabela) {
  return JSON.parse(localStorage.getItem('mv_' + tabela) || '[]');
}
function _localSet(tabela, dados) {
  localStorage.setItem('mv_' + tabela, JSON.stringify(dados));
}
function _marcarPendente(tabela) {
  const p = JSON.parse(localStorage.getItem('mv_pendentes') || '[]');
  if (!p.includes(tabela)) { p.push(tabela); localStorage.setItem('mv_pendentes', JSON.stringify(p)); }
}
function _removerPendente(tabela) {
  const p = JSON.parse(localStorage.getItem('mv_pendentes') || '[]');
  localStorage.setItem('mv_pendentes', JSON.stringify(p.filter(t => t !== tabela)));
}

// Auto-init ao carregar
document.addEventListener('DOMContentLoaded', _initMV);
