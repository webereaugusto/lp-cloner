# Configuração do Supabase

## 1. Criar Projeto no Supabase

1. Acesse https://supabase.com
2. Faça login ou crie uma conta
3. Clique em "New Project"
4. Preencha:
   - **Project Name**: `lp-cloner`
   - **Database Password**: (anote bem essa senha!)
   - **Region**: Escolha a mais próxima
5. Aguarde a criação do projeto (2-5 minutos)

## 2. Obter Credenciais

No dashboard do Supabase:

1. Vá em **Settings** → **API**
2. Copie as seguintes informações:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbG...` (chave longa)

## 3. Criar Tabelas

Vá em **SQL Editor** e execute o seguinte script:

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

-- Índices para melhor performance
CREATE INDEX idx_clones_user_id ON clones(user_id);
CREATE INDEX idx_clones_filename ON clones(filename);
CREATE INDEX idx_publications_friendly_id ON publications(friendly_id);
CREATE INDEX idx_publications_clone_id ON publications(clone_id);
```

## 4. Configurar Variáveis de Ambiente

### Desenvolvimento Local

Crie um arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon-aqui
NODE_ENV=development
PORT=3000
SESSION_SECRET=seu-secret-super-seguro-aqui
```

⚠️ **NUNCA** commite o arquivo `.env` no Git!

### Render (Produção)

No painel do Render:

1. Vá em seu Web Service
2. **Environment** → **Add Environment Variable**
3. Adicione:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `NODE_ENV` = `production`
   - `SESSION_SECRET`

## 5. Row Level Security (RLS)

Por padrão, o Supabase bloqueia todas as operações. Configure RLS:

```sql
-- Habilitar RLS nas tabelas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clones ENABLE ROW LEVEL SECURITY;
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários (usamos service_role no backend, então não precisamos de políticas)
-- O backend faz a autenticação via express-session
```

**NOTA**: Como estamos usando autenticação via Express Session no backend, vamos usar a `service_role` key (não a `anon` key) para contornar o RLS. Isso é seguro porque o backend valida a sessão antes de fazer qualquer operação.

### Obter Service Role Key

1. **Settings** → **API**
2. Copie a **service_role key** (⚠️ NÃO compartilhe esta chave!)
3. Adicione no `.env`:
   ```
   SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
   ```

## 6. Desabilitar RLS (Alternativa Mais Simples)

Se preferir uma abordagem mais simples, você pode desabilitar RLS:

```sql
-- Desabilitar RLS (backend faz toda a autenticação)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE clones DISABLE ROW LEVEL SECURITY;
ALTER TABLE publications DISABLE ROW LEVEL SECURITY;
```

## 7. Testar Conexão

Execute o servidor:

```bash
npm start
```

Verifique os logs - deve aparecer "Banco de dados inicializado" sem erros.

## Migração de Dados SQLite → Supabase

Se você já tem dados no SQLite:

1. Exportar dados do SQLite
2. Executar scripts SQL no Supabase
3. Ou criar scripts de migração (podemos fazer isso se necessário)

## Troubleshooting

### Erro "relation does not exist"
- Verifique se as tabelas foram criadas corretamente
- Vá em Table Editor e confirme que as tabelas existem

### Erro "Invalid API Key"
- Verifique se copiou a chave correta
- Verifique se está usando `service_role` no backend (não `anon`)

### Erro de conexão
- Verifique se o URL está correto
- Verifique se o projeto está ativo no Supabase

## Próximos Passos

Após configurar o Supabase, vamos:
1. Criar novo arquivo `database_supabase.js`
2. Atualizar `server.js` para usar Supabase
3. Remover dependências SQLite
4. Testar todas as funcionalidades

