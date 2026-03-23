// ============================================================
//  MEGAVISION ECOSYSTEM — AUTENTICAÇÃO v2.0
// ============================================================

const MVAuth = {

  planos: {
    gratuito: {
      nome: 'Gratuito', cor: '#94a3b8', emoji: '🆓',
      ferramentas: ['financial-pro', 'control-vendas', 'assistente-vendas'],
      limites: { financeiro_transacoes: 20, vendas_registros: 10 }
    },
    basico: {
      nome: 'Básico', cor: '#06b6d4', emoji: '⭐',
      ferramentas: ['financial-pro', 'control-vendas', 'assistente-vendas', 'app-vendas', 'quiz-itaipulandia'],
      limites: { financeiro_transacoes: 500, vendas_registros: 200 }
    },
    premium: {
      nome: 'Premium', cor: '#7c3aed', emoji: '💎',
      ferramentas: ['financial-pro', 'control-vendas', 'assistente-vendas', 'app-vendas', 'quiz-itaipulandia', 'leadership-academy', 'vendas-passaporte'],
      limites: null
    },
    admin: {
      nome: 'Admin', cor: '#f59e0b', emoji: '🛡️',
      ferramentas: ['*'],
      limites: null
    }
  },

  // ── SESSÃO ──────────────────────────────────────────────
  async getSessao() {
    try {
      const { data: { session } } = await _mvClient.auth.getSession();
      return session;
    } catch(e) { return null; }
  },

  // ── USUÁRIO COM PLANO ───────────────────────────────────
  async getUsuario() {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return null;
      const { data, error } = await _mvClient.from('mv_usuarios').select('*').eq('user_id', sessao.user.id).single();
      if (error || !data) {
        const novo = { user_id: sessao.user.id, email: sessao.user.email, nome: sessao.user.email.split('@')[0], plano: 'gratuito', plano_ativo: true, criado_em: new Date().toISOString() };
        await _mvClient.from('mv_usuarios').insert([novo]);
        return novo;
      }
      return data;
    } catch(e) { return null; }
  },

  // ── PROTEGER PÁGINA ─────────────────────────────────────
  // Use no início de cada ferramenta: await MVAuth.proteger('financial-pro')
  async proteger(ferramenta_id) {
    // Mostra loading enquanto verifica
    this._mostrarLoading();

    const sessao = await this.getSessao();
    if (!sessao) {
      window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
      return false;
    }

    const usuario = await this.getUsuario();
    if (!usuario) {
      window.location.href = 'auth.html';
      return false;
    }

    const plano = this.planos[usuario.plano];
    const temAcesso = plano && (plano.ferramentas.includes('*') || plano.ferramentas.includes(ferramenta_id));

    if (!temAcesso) {
      this._mostrarBloqueio(usuario, ferramenta_id);
      return false;
    }

    // Injeta navbar com info do usuário em todas as páginas
    this._injetarNavbar(usuario);
    return true;
  },

  // ── NAVBAR UNIVERSAL ────────────────────────────────────
  _injetarNavbar(usuario) {
    const plano = this.planos[usuario.plano] || this.planos.gratuito;
    // Procura nav existente e adiciona info do usuário
    const nav = document.querySelector('.mv-nav');
    if (nav) {
      const direita = nav.querySelector('.mv-nav-right') || nav.lastElementChild;
      const userInfo = document.createElement('div');
      userInfo.id = 'mv-user-info';
      userInfo.style.cssText = 'display:flex;align-items:center;gap:8px;';
      userInfo.innerHTML = `
        <span style="font-size:11px;color:#94a3b8;">${usuario.nome||usuario.email}</span>
        <span style="background:${plano.cor}22;color:${plano.cor};border:1px solid ${plano.cor}44;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${plano.emoji} ${plano.nome}</span>
        <button onclick="MVAuth.logout()" style="color:#94a3b8;font-size:12px;background:none;border:1px solid #1e1e2e;border-radius:6px;padding:4px 10px;cursor:pointer;">Sair</button>`;
      if (direita) direita.prepend(userInfo);
    }
  },

  // ── LOADING ─────────────────────────────────────────────
  _mostrarLoading() {
    const app = document.getElementById('app') || document.getElementById('mainContent');
    if (app) app.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;">
        <div style="text-align:center;">
          <div style="font-size:40px;margin-bottom:16px;animation:spin 1s linear infinite;display:inline-block;">⚡</div>
          <div style="color:#94a3b8;font-size:14px;">Verificando acesso...</div>
        </div>
      </div>
      <style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>`;
  },

  // ── TELA BLOQUEIO ───────────────────────────────────────
  _mostrarBloqueio(usuario, ferramenta_id) {
    const plano = this.planos[usuario.plano] || this.planos.gratuito;
    document.body.innerHTML = `
      <div style="background:#0a0a0f;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;padding:20px;">
        <div style="background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:40px;text-align:center;max-width:420px;">
          <div style="font-size:52px;margin-bottom:14px;">🔒</div>
          <h2 style="font-family:'Syne',sans-serif;color:#e2e8f0;font-size:20px;font-weight:800;margin-bottom:8px;">Acesso Restrito</h2>
          <p style="color:#94a3b8;font-size:13px;margin-bottom:8px;">Seu plano atual: <span style="background:${plano.cor}22;color:${plano.cor};padding:2px 8px;border-radius:20px;font-weight:700;">${plano.emoji} ${plano.nome}</span></p>
          <p style="color:#94a3b8;font-size:13px;margin-bottom:24px;line-height:1.6;">Esta ferramenta não está disponível no seu plano.<br>Faça upgrade para desbloquear.</p>
          <a href="planos.html" style="display:block;background:#7c3aed;color:#fff;padding:13px 24px;border-radius:10px;font-weight:700;text-decoration:none;margin-bottom:10px;">🚀 Ver Planos e Fazer Upgrade</a>
          <a href="index.html" style="display:block;color:#94a3b8;font-size:13px;text-decoration:none;">← Voltar ao início</a>
        </div>
      </div>`;
  },

  // ── LOGOUT ──────────────────────────────────────────────
  async logout() {
    await _mvClient.auth.signOut();
    window.location.href = 'auth.html';
  },

  // ── ATUALIZAR PLANO (Admin) ─────────────────────────────
  async atualizarPlano(user_id, novo_plano) {
    const { error } = await _mvClient.from('mv_usuarios').update({ plano: novo_plano, plano_ativo: true, plano_atualizado_em: new Date().toISOString() }).eq('user_id', user_id);
    return !error;
  },

  // ── BADGE DO PLANO ──────────────────────────────────────
  async getBadgePlano() {
    const u = await this.getUsuario(); if (!u) return '';
    const p = this.planos[u.plano] || this.planos.gratuito;
    return `<span style="background:${p.cor}22;color:${p.cor};border:1px solid ${p.cor}44;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${p.emoji} ${p.nome}</span>`;
  }
};
