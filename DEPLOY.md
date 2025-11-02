# Deploy no Render

## Pré-requisitos

1. Conta no Render (https://render.com)
2. Repositório Git conectado (GitHub já está configurado)

## Passos para Deploy

### 1. Criar Novo Web Service no Render

1. Acesse o [Dashboard do Render](https://dashboard.render.com)
2. Clique em **"New +"** → **"Web Service"**
3. Conecte seu repositório GitHub: `webereaugusto/lp-cloner`
4. Selecione a branch `master` (ou `main`)

### 2. Configurações do Serviço

Configure os seguintes campos:

- **Name**: `lp-cloner` (ou o nome que preferir)
- **Region**: Escolha a região mais próxima dos seus usuários
- **Branch**: `master`
- **Root Directory**: (deixe vazio ou `/` se todo o código estiver na raiz)
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: `Starter` (ou Free para testes - limitado)

### 3. Variáveis de Ambiente

Adicione as seguintes variáveis de ambiente no painel do Render:

| Chave | Valor | Descrição |
|------|-------|-----------|
| `NODE_ENV` | `production` | Define ambiente como produção |
| `SESSION_SECRET` | *(gere uma string aleatória)* | Secret para sessões (use gerador de senha seguro) |
| `PORT` | *(deixar vazio - Render define automaticamente)* | Porta do servidor |

**Como gerar SESSION_SECRET seguro:**
- Use um gerador de senha (mínimo 32 caracteres)
- Ou use: `openssl rand -base64 32` no terminal
- Ou gere online: https://www.random.org/strings/

### 4. Configurações Adicionais (Opcional)

- **Health Check Path**: `/` (para monitoramento)
- **Auto-Deploy**: Ativado (deploy automático ao fazer push)

### 5. Observações Importantes

#### SQLite no Render
⚠️ **ATENÇÃO**: O Render usa sistema de arquivos efêmero. Arquivos SQLite podem ser perdidos em reinicializações.

**Opções:**
1. **Para MVP/Testes**: Funciona bem, mas dados podem ser perdidos em deploys
2. **Para Produção**: Considere migrar para PostgreSQL (gratuito no Render)

#### Arquivos de Usuário
Os arquivos HTML salvos ficam em `html_copies/user_{id}/`. No Render, esses arquivos são efêmeros também.

**Solução para produção:**
- Migrar para storage externo (AWS S3, Cloudinary, etc)
- Ou usar PostgreSQL para armazenar HTML como texto

### 6. Após o Deploy

1. O Render fornecerá uma URL: `https://lp-cloner.onrender.com` (ou similar)
2. Acesse a URL para testar
3. A primeira requisição pode demorar ~30s (Render "acorda" serviços inativos no plano Free)

### 7. Troubleshooting

**Erro de build:**
- Verifique se todas as dependências estão em `package.json`
- Verifique logs em: Dashboard → Service → Logs

**Erro de conexão:**
- Verifique se `SESSION_SECRET` está configurado
- Verifique se `NODE_ENV=production` está configurado
- Verifique os logs do serviço

**Banco de dados não funciona:**
- No Render Free/Starter, o sistema de arquivos é efêmero
- Considere migrar para PostgreSQL para produção

### 8. Migração para PostgreSQL (Futuro)

Se precisar de persistência real, o Render oferece PostgreSQL gratuito:

1. Crie um **PostgreSQL** service no Render
2. Conecte usando a connection string fornecida
3. Ajuste `database.js` para usar `pg` ao invés de `sqlite3`

## Checklist Final

- [ ] Repositório conectado no Render
- [ ] Build Command: `npm install`
- [ ] Start Command: `npm start`
- [ ] Variável `NODE_ENV=production` configurada
- [ ] Variável `SESSION_SECRET` configurada (com valor seguro)
- [ ] Auto-deploy ativado (opcional)
- [ ] Serviço deployado com sucesso
- [ ] URL de produção funcionando

## Próximos Passos

1. Testar o deploy
2. Verificar funcionamento da landing page
3. Testar cadastro/login
4. Testar criação de clones
5. Considerar migração para PostgreSQL se necessário

