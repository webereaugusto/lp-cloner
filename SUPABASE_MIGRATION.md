# Guia de Migração para Supabase

## Status Atual

Criamos o arquivo `database_supabase.js` com todas as funções necessárias, mas ainda estamos usando SQLite como padrão. Este guia explica como ativar o Supabase.

## Opção 1: Ativar Supabase Agora (Recomendado)

### Passo 1: Criar Projeto no Supabase

1. Acesse https://supabase.com
2. Crie uma conta ou faça login
3. Clique em "New Project"
4. Configure:
   - **Name**: `lp-cloner`
   - **Database Password**: Anote bem!
   - **Region**: Mais próxima de você
5. Aguarde a criação (2-5 minutos)

### Passo 2: Obter Credenciais

1. No dashboard do Supabase, vá em **Settings** → **API**
2. Copie:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: A chave pública
   - **service_role key**: A chave secreta (⚠️ NÃO compartilhe!)

### Passo 3: Criar Tabelas

Vá em **SQL Editor** e execute:

```sql
-- Tabela de usuários
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de clones
CREATE TABLE clones (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_url TEXT,
    file_size INTEGER,
    total_links INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, filename)
);

-- Tabela de publicações
CREATE TABLE publications (
    id BIGSERIAL PRIMARY KEY,
    clone_id BIGINT NOT NULL REFERENCES clones(id) ON DELETE CASCADE,
    friendly_id TEXT UNIQUE NOT NULL,
    public_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_clones_user_id ON clones(user_id);
CREATE INDEX idx_clones_filename ON clones(filename);
CREATE INDEX idx_publications_friendly_id ON publications(friendly_id);
CREATE INDEX idx_publications_clone_id ON publications(clone_id);

-- Desabilitar RLS (backend faz autenticação)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE clones DISABLE ROW LEVEL SECURITY;
ALTER TABLE publications DISABLE ROW LEVEL SECURITY;
```

### Passo 4: Configurar Variáveis de Ambiente

**Local (.env):**

```env
USE_SUPABASE=true
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
NODE_ENV=development
PORT=3000
SESSION_SECRET=seu-secret-seguro-aqui
```

**Render (Produção):**

1. Vá no Dashboard do Render → Seu Web Service
2. **Environment** → **Add Environment Variable**
3. Adicione:
   - `USE_SUPABASE` = `true`
   - `SUPABASE_URL` = sua URL
   - `SUPABASE_SERVICE_ROLE_KEY` = sua service role key
   - (manter as outras variáveis já existentes)

### Passo 5: Atualizar server.js

Precisamos modificar `server.js` para usar Supabase quando `USE_SUPABASE=true`. Isso será feito automaticamente pela aplicação.

## Opção 2: Manter SQLite (Desenvolvimento Local)

Se quiser continuar usando SQLite localmente:

- Não configure `USE_SUPABASE`
- Ou configure `USE_SUPABASE=false`
- O sistema usará `database.js` (SQLite) automaticamente

## Comparação

| Recurso | SQLite | Supabase |
|---------|--------|----------|
| **Local** | ✅ Simples | ❌ Requer internet |
| **Produção (Render Free)** | ❌ Perde dados | ✅ Persistente |
| **Backup** | ❌ Manual | ✅ Automático |
| **Escalabilidade** | ❌ Limitada | ✅ Ilimitada |
| **Custo** | ✅ Gratuito | ✅ Até 500MB grátis |

## Migração de Dados (Opcional)

Se você já tem dados no SQLite:

```bash
# Instalar sqlite3 CLI se não tiver
npm install -g sqlite3

# Exportar dados
sqlite3 database.db ".dump" > dump.sql

# Adaptar para formato INSERT do PostgreSQL
# (precisa ajustar manualmente ou criar script)
```

## Próximos Passos

Depois de configurar o Supabase:

1. ✅ Tabelas criadas
2. ✅ Variáveis configuradas
3. ✅ Sistema detectará e usará Supabase
4. ✅ Testar em desenvolvimento
5. ✅ Deploy em produção

## Troubleshooting

**Erro "relation does not exist"**
- Verifique se executou todos os scripts SQL
- Confirme que as tabelas existem no **Table Editor**

**Erro "Invalid API Key"**
- Use `SUPABASE_SERVICE_ROLE_KEY` no backend
- Verifique se copiou a chave correta

**Erro de conexão**
- Verifique se `SUPABASE_URL` está correto
- Verifique conexão com internet

