# LP Cloner

Uma aplicação moderna para clonar páginas HTML e gerenciar links com interface intuitiva e dashboard completo.

## 🚀 Funcionalidades

- **Clone de Páginas**: Copie qualquer página HTML e salve localmente
- **Extração de Links**: Identifica automaticamente todos os links da página
- **Edição de Links**: Edite URLs dos links encontrados diretamente na interface
- **Sistema de Publicação**: Publique clones com URLs amigáveis
- **Dashboard Moderno**: Interface com menu lateral e estatísticas em tempo real
- **Tema Dark/Light**: Alternância entre temas claro e escuro
- **Download**: Baixe clones salvos facilmente

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
│   └── index.ejs       # Interface principal
├── server.js           # Servidor Express
├── package.json        # Dependências
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
- **Bibliotecas**: Axios (HTTP), Cheerio (HTML parsing), UUID (IDs únicos)

## 📝 Licença

Este projeto está sob a licença MIT.

## 👨‍💻 Autor

Seu Nome
