// ============================================================
//  MEGAVISION ECOSYSTEM — AUTENTICAÇÃO v3.0
//  Correções: verificação no Supabase, expiração de plano,
//  cache seguro, proteção real contra bypass
// ============================================================

const MVAuth = {

  planos: {
    gratuito: {
      nome: 'Gratuito', cor: '#94a3b8', emoji: '🆓',
      ferramentas: ['financial-pro', 'control-vendas', 'assistente-vendas'],
      limites: { financeiro_registros: 20, vendas_registros: 10 }
    },
    basico: {
      nome: 'Básico', cor: '#06b6d4', emoji: '⭐',
      ferramentas: ['financial-pro', 'control-vendas', 'assistente-vendas', 'app-vendas', 'quiz-itaipulandia'],
      limites: { financeiro_registros: 500, vendas_registros: 200 }
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

  // ── SESSÃO ──────────────────────────────────────────────────
  async getSessao() {
    try {
      const { data: { session } } = await _mvClient.auth.getSession();
      return session;
    } catch(e) { return null; }
  },

  // ── USUÁRIO COM PLANO — verifica SEMPRE no Supabase ─────────
  // Nunca confia só no localStorage para dados de plano
  async getUsuario() {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return null;

      const { data, error } = await _mvClient
        .from('mv_usuarios').select('*')
        .eq('user_id', sessao.user.id).single();

      if (error || !data) {
        // Cria perfil automaticamente no primeiro acesso
        const novo = {
          user_id: sessao.user.id,
          email: sessao.user.email,
          nome: sessao.user.email.split('@')[0],
          plano: 'gratuito',
          plano_ativo: true,
          criado_em: new Date().toISOString()
        };
        await _mvClient.from('mv_usuarios').insert([novo]);
        return novo;
      }

      // ── VERIFICA EXPIRAÇÃO DO PLANO ──────────────────────────
      // Se tem data de fim e já passou, rebaixa para gratuito
      if (data.plano !== 'gratuito' && data.plano !== 'admin' && data.plano_fim) {
        const fim = new Date(data.plano_fim);
        if (fim < new Date()) {
          await _mvClient.from('mv_usuarios').update({
            plano: 'gratuito',
            plano_ativo: false,
            plano_expirado_em: new Date().toISOString()
          }).eq('user_id', sessao.user.id);
          data.plano = 'gratuito';
          data.plano_ativo = false;
          console.warn('[MEGAVISION] Plano expirado — revertido para gratuito');
        }
      }

      return data;
    } catch(e) {
      console.warn('[MEGAVISION] Erro ao buscar usuário:', e.message);
      return null;
    }
  },

  // ── PROTEGER PÁGINA ─────────────────────────────────────────
  async proteger(ferramenta_id) {
    this._mostrarLoading();

    // 1. Verifica sessão
    const sessao = await this.getSessao();
    if (!sessao) {
      window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.href)}`;
      return false;
    }

    // 2. Busca usuário e plano SEMPRE no Supabase (não localStorage)
    const usuario = await this.getUsuario();
    if (!usuario) {
      window.location.href = 'auth.html';
      return false;
    }

    // 3. Verifica acesso à ferramenta
    const plano = this.planos[usuario.plano];
    if (!plano) {
      this._mostrarBloqueio(usuario, ferramenta_id, 'plano_invalido');
      return false;
    }

    const temAcesso = plano.ferramentas.includes('*') || plano.ferramentas.includes(ferramenta_id);
    if (!temAcesso) {
      this._mostrarBloqueio(usuario, ferramenta_id);
      return false;
    }

    // 4. Injeta navbar com info do usuário
    this._injetarNavbar(usuario);
    return true;
  },

  // ── VERIFICAR LIMITE DE USO ──────────────────────────────────
  async verificarLimite(tipo_limite) {
    const usuario = await this.getUsuario();
    if (!usuario) return { ok: false, motivo: 'sem_sessao' };
    const plano = this.planos[usuario.plano];
    if (!plano || !plano.limites) return { ok: true }; // sem limite
    const limite = plano.limites[tipo_limite];
    if (!limite) return { ok: true };
    const total = await MVData.contar('financeiro', { tipo: tipo_limite });
    return { ok: total < limite, total, limite, restante: Math.max(limite - total, 0) };
  },

  // ── NAVBAR UNIVERSAL ─────────────────────────────────────────
  _injetarNavbar(usuario) {
    const plano = this.planos[usuario.plano] || this.planos.gratuito;
    const nav = document.querySelector('.mv-nav');
    if (!nav || document.getElementById('mv-user-info')) return;
    const direita = nav.querySelector('.mv-nav-right') || nav.lastElementChild;
    const el = document.createElement('div');
    el.id = 'mv-user-info';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;';
    el.innerHTML = `
      <span style="font-size:12px;color:#94a3b8;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${usuario.nome||usuario.email}</span>
      <span style="background:${plano.cor}22;color:${plano.cor};border:1px solid ${plano.cor}44;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${plano.emoji} ${plano.nome}</span>
      ${usuario.plano==='admin'?`<a href="admin.html" style="color:#f59e0b;font-size:12px;text-decoration:none;padding:4px 10px;border-radius:6px;border:1px solid rgba(245,158,11,.3);">🛡️</a>`:''}
      <a href="planos.html" style="color:#94a3b8;font-size:12px;text-decoration:none;padding:4px 10px;border-radius:6px;border:1px solid #1e1e2e;">Plano</a>
      <button onclick="MVAuth.logout()" style="color:#94a3b8;font-size:12px;background:none;border:1px solid #1e1e2e;border-radius:6px;padding:4px 10px;cursor:pointer;">Sair</button>`;
    if (direita) direita.prepend(el);
  },

  // ── LOADING ──────────────────────────────────────────────────
  _mostrarLoading() {
    const app = document.getElementById('app') || document.getElementById('mainContent');
    if (app) app.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:60vh;flex-direction:column;gap:16px;">
        <div style="font-size:36px;animation:mvspin 1s linear infinite;display:inline-block;">⚡</div>
        <div style="color:#94a3b8;font-size:13px;">Verificando acesso...</div>
      </div>
      <style>@keyframes mvspin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>`;
  },

  // ── BLOQUEIO ─────────────────────────────────────────────────
  _mostrarBloqueio(usuario, ferramenta_id, motivo) {
    const plano = this.planos[usuario.plano] || this.planos.gratuito;
    const expirado = motivo === 'plano_invalido' || !usuario.plano_ativo;
    document.body.innerHTML = `
      <div style="background:#0a0a0f;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;padding:20px;">
        <div style="background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:40px;text-align:center;max-width:420px;">
          <div style="font-size:52px;margin-bottom:14px;">${expirado ? '⏰' : '🔒'}</div>
          <h2 style="font-family:'Syne',sans-serif;color:#e2e8f0;font-size:20px;font-weight:800;margin-bottom:8px;">
            ${expirado ? 'Plano Expirado' : 'Acesso Restrito'}
          </h2>
          <p style="color:#94a3b8;font-size:13px;margin-bottom:6px;">
            ${expirado ? 'Seu plano expirou.' : 'Esta ferramenta não está no seu plano atual.'}
          </p>
          <p style="margin-bottom:20px;">
            <span style="background:${plano.cor}22;color:${plano.cor};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">${plano.emoji} ${plano.nome}</span>
          </p>
          <a href="planos.html" style="display:block;background:#7c3aed;color:#fff;padding:13px;border-radius:10px;font-weight:700;text-decoration:none;margin-bottom:8px;">
            🚀 ${expirado ? 'Renovar Plano' : 'Ver Planos e Fazer Upgrade'}
          </a>
          <a href="index.html" style="display:block;color:#94a3b8;font-size:13px;text-decoration:none;">← Voltar ao início</a>
        </div>
      </div>`;
  },

  // ── LOGOUT ───────────────────────────────────────────────────
  async logout() {
    await _mvClient.auth.signOut();
    // Limpa APENAS dados de sessão, não os dados do usuário
    sessionStorage.clear();
    window.location.href = 'auth.html';
  },

  // ── ATUALIZAR PLANO (Admin) ───────────────────────────────────
  // plano_fim: null = sem expiração, ou '2025-12-31'
  async atualizarPlano(user_id, novo_plano, plano_fim = null) {
    const { error } = await _mvClient.from('mv_usuarios').update({
      plano: novo_plano,
      plano_ativo: true,
      plano_inicio: new Date().toISOString(),
      plano_fim: plano_fim,
      plano_atualizado_em: new Date().toISOString()
    }).eq('user_id', user_id);
    return !error;
  },

  // ── BADGE DO PLANO ────────────────────────────────────────────
  async getBadgePlano() {
    const u = await this.getUsuario();
    if (!u) return '';
    const p = this.planos[u.plano] || this.planos.gratuito;
    return `<span style="background:${p.cor}22;color:${p.cor};border:1px solid ${p.cor}44;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${p.emoji} ${p.nome}</span>`;
  }
};
