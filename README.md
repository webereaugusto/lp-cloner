# LP Cloner

Uma aplicação SaaS moderna para clonar páginas HTML e gerenciar links com interface intuitiva, dashboard completo e sistema de autenticação.

## 🚀 Funcionalidades

- **Landing Page**: Página inicial explicativa com casos de uso
- **Sistema de Autenticação**: Cadastro e login de usuários
- **Clone de Páginas**: Copie qualquer página HTML e salve localmente
- **Extração de Links**: Identifica automaticamente todos os links da página
- **Edição de Links**: Edite URLs dos links encontrados diretamente na interface
- **Sistema de Publicação**: Publique clones com URLs amigáveis
- **Dashboard Moderno**: Interface com menu lateral e estatísticas em tempo real
- **Tema Dark**: Interface com tema escuro moderno
- **Download**: Baixe clones salvos facilmente
- **Multi-usuário**: Cada usuário vê apenas seus próprios clones

## 📋 Requisitos

- Node.js (v14 ou superior)
- npm ou yarn

## 🛠️ Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/lp-cloner.git
cd lp-cloner
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
npm start
```

4. Acesse a aplicação:
```
http://localhost:3000
```

## 📁 Estrutura do Projeto

```
lp-cloner/
├── html_copies/        # Arquivos HTML clonados (não versionado)
├── views/              # Templates EJS
│   ├── index.ejs       # Dashboard principal
│   ├── login.ejs       # Tela de login/registro
│   └── landing.ejs     # Landing page pública
├── auth.js             # Sistema de autenticação
├── database.js         # Gerenciamento do banco SQLite
├── server.js           # Servidor Express
├── package.json        # Dependências
├── render.yaml         # Configuração para Render
├── DEPLOY.md           # Guia completo de deploy
└── README.md          # Este arquivo
```

## 🎯 Uso

1. **Criar um Clone**:
   - Navegue até "Novo Clone"
   - Insira a URL completa da página
   - Clique em "Copiar HTML"

2. **Gerenciar Links**:
   - Abra o card do clone
   - Clique em "Links"
   - Use "Editar Links" para modificar URLs
   - Salve as alterações

3. **Publicar Clone**:
   - Use o switch de Publicado/Rascunho
   - O clone receberá uma URL amigável (ex: `/p/abc12345`)
   - A URL pública fica acessível para qualquer pessoa

## 🛡️ Tecnologias

- **Backend**: Node.js + Express
- **Frontend**: EJS, Bootstrap 5, Font Awesome
- **Banco de Dados**: SQLite (SQLite3)
- **Autenticação**: Express Session, bcrypt
- **Bibliotecas**: Axios (HTTP), Cheerio (HTML parsing), UUID (IDs únicos)

## ☁️ Deploy no Render

A aplicação está pronta para deploy no Render. Veja o arquivo [DEPLOY.md](./DEPLOY.md) para instruções detalhadas.

**Resumo rápido:**
1. Crie uma conta no [Render](https://render.com)
2. Conecte o repositório GitHub
3. Configure as variáveis de ambiente:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (gere um valor seguro)
4. Deploy automático ao fazer push!

⚠️ **Importante**: O Render Free usa sistema de arquivos efêmero. Para produção, considere migrar para PostgreSQL.

## 📝 Licença

Este projeto está sob a licença MIT.

## 👨‍💻 Autor

Seu Nome
