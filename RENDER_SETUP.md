# ✅ Checklist de Deploy no Render

## Arquivos Preparados ✅

- ✅ `render.yaml` - Configuração do Render (opcional, pode configurar manualmente)
- ✅ `DEPLOY.md` - Guia completo passo a passo
- ✅ `server.js` - Atualizado para produção (bind em 0.0.0.0, inicialização do DB)
- ✅ `package.json` - Dependências configuradas
- ✅ `.gitignore` - Arquivos sensíveis ignorados

## 📋 Passos para Deploy

### 1. No Render Dashboard

1. Acesse: https://dashboard.render.com
2. Faça login ou crie uma conta
3. Clique em **"New +"** → **"Web Service"**

### 2. Conectar Repositório

1. Conecte sua conta GitHub (se ainda não conectou)
2. Selecione o repositório: `webereaugusto/lp-cloner`
3. Clique em **"Connect"**

### 3. Configurar Serviço

Preencha os campos:

- **Name**: `lp-cloner` (ou qualquer nome)
- **Region**: Escolha mais próxima (ex: `Oregon`, `Frankfurt`, `Singapore`)
- **Branch**: `master`
- **Root Directory**: *(deixe vazio)*
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: 
  - `Free` (para testes - limite de 750h/mês)
  - `Starter` ($7/mês - melhor para produção)

### 4. Variáveis de Ambiente ⚠️ IMPORTANTE

No painel do Render, vá em **Environment** e adicione:

| Chave | Valor | Onde obter |
|------|-------|------------|
| `NODE_ENV` | `production` | Fixo |
| `SESSION_SECRET` | *(string aleatória segura)* | Gere aqui: https://www.random.org/strings/ (mínimo 32 caracteres) |

**⚠️ IMPORTANTE**: Sem `SESSION_SECRET`, o sistema não funcionará corretamente!

**Gerar SESSION_SECRET seguro:**
- Opção 1: https://www.random.org/strings/ → Escolha 32 caracteres alfanuméricos
- Opção 2: Use PowerShell: `[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`
- Opção 3: Use online: https://generate-secret.vercel.app/32

### 5. Deploy

1. Clique em **"Create Web Service"**
2. Aguarde o build (pode levar 2-5 minutos)
3. O Render fornecerá uma URL: `https://lp-cloner-XXXX.onrender.com`

### 6. Testar

1. Acesse a URL fornecida
2. Você deve ver a **Landing Page**
3. Clique em "Entrar" ou "Criar Conta"
4. Teste o cadastro de um novo usuário
5. Teste criar um clone

## ⚠️ Limitações do Render Free

1. **Sistema de Arquivos Efêmero**:
   - SQLite e arquivos HTML podem ser perdidos em reinicializações
   - Para produção real, considere PostgreSQL

2. **Cold Start**:
   - Primeira requisição após inatividade pode demorar ~30 segundos
   - Serviços Free "dormem" após 15 minutos de inatividade

3. **Limite de Horas**:
   - 750 horas/mês (suficiente para testes)

## 🔄 Atualizações Futuras

Após o primeiro deploy, todas as atualizações serão automáticas ao fazer `git push` para o GitHub (se Auto-Deploy estiver ativado).

## 📊 Monitoramento

- **Logs**: Dashboard → Service → Logs
- **Métricas**: Dashboard → Service → Metrics
- **Health Check**: Render verifica `/` automaticamente

## 🆘 Problemas Comuns

### Erro 503 no primeiro acesso
- Normal! Render está "acordando" o serviço
- Aguarde 30-60 segundos e tente novamente

### Erro de autenticação/sessão
- Verifique se `SESSION_SECRET` está configurado
- Verifique se `NODE_ENV=production` está configurado

### Banco de dados vazio após reiniciar
- Normal no plano Free (sistema efêmero)
- Para produção, migre para PostgreSQL

### Build falha
- Verifique os logs em: Dashboard → Service → Logs
- Certifique-se de que `package.json` está correto
- Verifique se todas as dependências estão listadas

## ✨ Próximos Passos (Opcional)

1. **Migrar para PostgreSQL** (para persistência real)
2. **Configurar domínio personalizado**
3. **Habilitar HTTPS** (já vem habilitado no Render)
4. **Configurar CI/CD** (já funciona com Auto-Deploy)

---

**Pronto!** Sua aplicação está preparada para deploy no Render! 🚀

