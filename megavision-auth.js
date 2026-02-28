// ============================================================
//  MEGAVISION ECOSYSTEM — MÓDULO DE AUTENTICAÇÃO E PLANOS
//  Arquivo: megavision-auth.js  |  Versão 1.0
//
//  📌 COMO USAR EM QUALQUER PÁGINA:
//  1. Adicione no <head> DEPOIS do megavision-data.js:
//     <script src="megavision-auth.js"></script>
//  2. Chame MVAuth.proteger() no início de cada ferramenta
// ============================================================

const MVAuth = {

  // ── PLANOS E PERMISSÕES ─────────────────────────────────
  // Defina aqui quais ferramentas cada plano acessa
  planos: {
    gratuito: {
      nome: 'Gratuito',
      cor: '#94a3b8',
      ferramentas: ['financial-pro', 'control-vendas', 'assistente-vendas'],
      limites: {
        financeiro_transacoes: 20,   // máx 20 transações
        vendas_registros: 10,        // máx 10 registros
        assistente_consultas: 5      // máx 5 consultas/dia
      }
    },
    basico: {
      nome: 'Básico',
      cor: '#06b6d4',
      ferramentas: [
        'financial-pro', 'control-vendas', 'assistente-vendas',
        'app-vendas', 'quiz-itaipulandia'
      ],
      limites: {
        financeiro_transacoes: 500,
        vendas_registros: 200,
        assistente_consultas: 50
      }
    },
    premium: {
      nome: 'Premium',
      cor: '#7c3aed',
      ferramentas: [
        'financial-pro', 'control-vendas', 'assistente-vendas',
        'app-vendas', 'quiz-itaipulandia',
        'leadership-academy', 'vendas-passaporte'
      ],
      limites: null // sem limites
    },
    admin: {
      nome: 'Admin',
      cor: '#f59e0b',
      ferramentas: ['*'], // todas
      limites: null
    }
  },

  // ── OBTER SESSÃO ATUAL ──────────────────────────────────
  async getSessao() {
    try {
      const { data: { session } } = await _mvClient.auth.getSession();
      return session;
    } catch (e) { return null; }
  },

  // ── OBTER USUÁRIO COM PLANO ─────────────────────────────
  async getUsuario() {
    try {
      const sessao = await this.getSessao();
      if (!sessao) return null;

      const { data, error } = await _mvClient
        .from('mv_usuarios')
        .select('*')
        .eq('user_id', sessao.user.id)
        .single();

      if (error || !data) {
        // Cria perfil se não existir
        await _mvClient.from('mv_usuarios').insert([{
          user_id: sessao.user.id,
          email: sessao.user.email,
          nome: sessao.user.email.split('@')[0],
          plano: 'gratuito',
          plano_ativo: true,
          criado_em: new Date().toISOString()
        }]);
        return { user_id: sessao.user.id, email: sessao.user.email, plano: 'gratuito', plano_ativo: true };
      }
      return data;
    } catch (e) { return null; }
  },

  // ── VERIFICAR ACESSO A FERRAMENTA ───────────────────────
  async temAcesso(ferramenta_id) {
    const usuario = await this.getUsuario();
    if (!usuario) return false;

    const plano = this.planos[usuario.plano];
    if (!plano) return false;

    if (plano.ferramentas.includes('*')) return true;
    return plano.ferramentas.includes(ferramenta_id);
  },

  // ── PROTEGER PÁGINA ────────────────────────────────────
  // Chame no início de cada ferramenta:
  // await MVAuth.proteger('financial-pro')
  async proteger(ferramenta_id) {
    const sessao = await this.getSessao();

    // Não logado → redireciona para login
    if (!sessao) {
      window.location.href = `auth.html?redirect=${encodeURIComponent(window.location.pathname)}`;
      return false;
    }

    const acesso = await this.temAcesso(ferramenta_id);
    if (!acesso) {
      this.mostrarBloqueio(ferramenta_id);
      return false;
    }

    return true;
  },

  // ── TELA DE BLOQUEIO ────────────────────────────────────
  mostrarBloqueio(ferramenta_id) {
    document.body.innerHTML = `
      <div style="background:#0a0a0f;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'DM Sans',sans-serif;">
        <div style="background:#111118;border:1px solid #1e1e2e;border-radius:16px;padding:48px;text-align:center;max-width:420px;">
          <div style="font-size:56px;margin-bottom:16px;">🔒</div>
          <h2 style="font-family:'Syne',sans-serif;color:#e2e8f0;font-size:22px;font-weight:800;margin-bottom:10px;">Acesso Restrito</h2>
          <p style="color:#94a3b8;font-size:14px;margin-bottom:28px;line-height:1.6;">
            Esta ferramenta não está disponível no seu plano atual.<br>
            Faça upgrade para desbloquear.
          </p>
          <a href="planos.html" style="display:block;background:#7c3aed;color:#fff;padding:14px 24px;border-radius:10px;font-weight:700;text-decoration:none;margin-bottom:12px;">
            🚀 Ver Planos e Fazer Upgrade
          </a>
          <a href="index.html" style="display:block;color:#94a3b8;font-size:13px;text-decoration:none;margin-top:8px;">
            ← Voltar ao início
          </a>
        </div>
      </div>`;
  },

  // ── LOGIN ───────────────────────────────────────────────
  async login(email, senha) {
    const { data, error } = await _mvClient.auth.signInWithPassword({ email, password: senha });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, usuario: data.user };
  },

  // ── CADASTRO ────────────────────────────────────────────
  async cadastrar(nome, email, senha) {
    const { data, error } = await _mvClient.auth.signUp({ email, password: senha });
    if (error) return { ok: false, erro: error.message };

    // Cria perfil
    await _mvClient.from('mv_usuarios').insert([{
      user_id: data.user.id,
      email,
      nome,
      plano: 'gratuito',
      plano_ativo: true,
      criado_em: new Date().toISOString()
    }]);

    return { ok: true, usuario: data.user };
  },

  // ── LOGOUT ──────────────────────────────────────────────
  async logout() {
    await _mvClient.auth.signOut();
    window.location.href = 'auth.html';
  },

  // ── ATUALIZAR PLANO (Admin) ─────────────────────────────
  async atualizarPlano(user_id, novo_plano) {
    const { error } = await _mvClient
      .from('mv_usuarios')
      .update({ plano: novo_plano, plano_ativo: true, plano_atualizado_em: new Date().toISOString() })
      .eq('user_id', user_id);
    return !error;
  },

  // ── VERIFICAR LIMITE ────────────────────────────────────
  async verificarLimite(ferramenta, tipo_limite) {
    const usuario = await this.getUsuario();
    if (!usuario) return { ok: false };

    const plano = this.planos[usuario.plano];
    if (!plano || !plano.limites) return { ok: true }; // sem limite

    const limite = plano.limites[tipo_limite];
    if (!limite) return { ok: true };

    const total = await MVData.contar(ferramenta);
    return {
      ok: total < limite,
      total,
      limite,
      restante: limite - total
    };
  },

  // ── BADGE DO PLANO ──────────────────────────────────────
  async getBadgePlano() {
    const usuario = await this.getUsuario();
    if (!usuario) return '';
    const plano = this.planos[usuario.plano];
    return `<span style="background:${plano.cor}22;color:${plano.cor};border:1px solid ${plano.cor}44;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${plano.nome}</span>`;
  }
};
