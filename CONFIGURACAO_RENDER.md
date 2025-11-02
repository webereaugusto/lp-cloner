# Checklist de Configuração no Render

## ✅ Configurações Mínimas Necessárias

### Variáveis de Ambiente Obrigatórias

```env
USE_SUPABASE=true
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=eyJhbG... (ou SUPABASE_SERVICE_ROLE_KEY)
NODE_ENV=production
SESSION_SECRET=seu-secret-super-seguro
```

### ⚠️ Important: ANON_KEY vs SERVICE_ROLE_KEY

**Atualmente você configurou:** `SUPABASE_ANON_KEY`

**Recomendação:** Adicione também `SUPABASE_SERVICE_ROLE_KEY` para maior flexibilidade:

#### ANON_KEY (pública)
- ✅ Funciona para operações básicas
- ❌ Limitada por RLS (Row Level Security)
- ❌ Pode dar erros se RLS estiver ativo

#### SERVICE_ROLE_KEY (privada - ⚠️ NÃO compartilhe!)
- ✅ Bypassa RLS completamente
- ✅ Mais poderoso para backend
- ✅ Melhor para produção

### Como Obter SERVICE_ROLE_KEY

1. Vá no **Supabase Dashboard**
2. **Settings** → **API**
3. Copie a **service_role key** (está escondida, precisa clicar para revelar)
4. Adicione no Render como nova variável: `SUPABASE_SERVICE_ROLE_KEY`

### Código Atual

O código já está preparado para usar **ambos**:

```javascript
// database_supabase.js linha 4
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
```

**Ordem de prioridade:**
1. Se `SUPABASE_SERVICE_ROLE_KEY` existe → usa ela
2. Senão, se `SUPABASE_ANON_KEY` existe → usa ela
3. Senão → erro

## 🧪 Testar Deploy

Após adicionar as variáveis:

1. ✅ Render fará deploy automático (você já viu a notificação verde)
2. ✅ Aguarde 2-5 minutos
3. ✅ Acesse: `https://lp-cloner.onrender.com`
4. ✅ Verifique logs no Render Dashboard

### Logs Esperados

No dashboard do Render → **Logs**, você deve ver:

```
🔌 Usando banco de dados: Supabase
✅ Conectado ao Supabase com sucesso
Servidor rodando na porta XXXX
Ambiente: production
```

### Se Der Erro

**Erro:** `relation "users" does not exist`
- ✅ Execute os scripts SQL no Supabase (veja SUPABASE_SETUP.md)

**Erro:** `Invalid API Key`
- ✅ Verifique se copiou a chave correta (sem espaços)

**Erro:** `Supabase não está configurado`
- ✅ Verifique se `USE_SUPABASE=true`

## 📊 Status Atual

Baseado na imagem:
- ✅ `USE_SUPABASE` configurado
- ✅ `SUPABASE_URL` configurado
- ✅ `SUPABASE_ANON_KEY` configurado
- ✅ `SESSION_SECRET` configurado
- ✅ `NODE_ENV` configurado
- ⚠️ Falta: `SUPABASE_SERVICE_ROLE_KEY` (opcional mas recomendado)

## 🎯 Próximos Passos

1. Aguarde deploy finalizar
2. Teste criar uma conta
3. Teste fazer login
4. Teste criar um clone

Se tudo funcionar, está pronto! 🎉

