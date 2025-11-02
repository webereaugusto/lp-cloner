require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');

// Escolher banco de dados baseado em variável de ambiente
const useSupabase = process.env.USE_SUPABASE === 'true' || process.env.USE_SUPABASE === '1';
console.log(`🔌 Usando banco de dados: ${useSupabase ? 'Supabase' : 'SQLite'}`);
const db = useSupabase ? require('./database_supabase') : require('./database');

const { 
    initDatabase,
    createClone, 
    getClonesByUserId, 
    getCloneByFilename,
    deleteClone,
    createPublication,
    getPublicationByFriendlyId,
    getPublicationByCloneId,
    deletePublicationByClone,
    getStatsByUserId,
    getUserById
} = db;

const { requireAuth, register, login } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy (necessário para Render)
app.set('trust proxy', 1);

// Configurar sessões
app.use(session({
    store: new SQLiteStore({ 
        db: 'sessions.db',
        dir: './'
    }),
    secret: process.env.SESSION_SECRET || 'lp-cloner-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Render usa HTTPS, mas deixar false por enquanto para debug
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 dias
    }
}));

// Middleware para passar userId para views
app.use((req, res, next) => {
    res.locals.userId = req.session?.userId || null;
    res.locals.userEmail = req.session?.userEmail || null;
    next();
});

// Criar diretório para salvar HTML por usuário
function getUserHtmlDir(userId) {
    const userDir = path.join(__dirname, 'html_copies', `user_${userId}`);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
}

// ========== ROTAS DE AUTENTICAÇÃO ==========

app.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('login');
});

app.post('/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await register(email, password);
    if (result.success) {
        res.json({ success: true, message: 'Conta criada com sucesso' });
    } else {
        res.status(400).json({ error: result.error });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const result = await login(email, password);
        if (result.success) {
            req.session.userId = result.user.id;
            req.session.userEmail = result.user.email;
            
            // Salvar sessão antes de enviar resposta
            req.session.save((err) => {
                if (err) {
                    console.error('Erro ao salvar sessão:', err);
                    return res.status(500).json({ error: 'Erro ao criar sessão' });
                }
                res.json({ success: true });
            });
        } else {
            res.status(401).json({ error: result.error });
        }
    } catch (error) {
        console.error('Erro no endpoint /auth/login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ========== ROTAS PRINCIPAIS ==========

// Landing page (pública)
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.render('landing');
});

// Dashboard (protegida)
app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        const clones = await getClonesByUserId(userId);
        const stats = await getStatsByUserId(userId);

        // Formatando dados para a view
        const fileInfos = clones.map(clone => ({
            name: clone.filename,
            size: clone.file_size || 0,
            created: new Date(clone.created_at),
            url: `/html/${clone.filename}`,
            originalUrl: clone.original_url,
            publishInfo: clone.friendly_id ? {
                publicUrl: clone.public_url,
                friendlyId: clone.friendly_id
            } : null
        })).sort((a, b) => b.created - a.created);

        res.render('index', { 
            files: fileInfos, 
            stats: {
                totalFiles: stats.totalFiles || 0,
                published: stats.published || 0,
                drafts: stats.drafts || 0,
                totalLinks: stats.totalLinks || 0
            }
        });
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.status(500).send('Erro ao carregar dashboard');
    }
});

// Rota para copiar URL
app.post('/copy', requireAuth, async (req, res) => {
    const { url } = req.body;
    const userId = req.session.userId;

    if (!url) {
        return res.status(400).json({ error: 'URL é obrigatória' });
    }

    try {
        // Validar URL
        new URL(url);

        // Fazer requisição
        const response = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'LP-Cloner/1.0' }
        });

        // Extrair links
        const $ = cheerio.load(response.data);
        const links = [];

        $('a[href]').each((index, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim() || '[sem texto]';
            const title = $(element).attr('title') || '';

            let absoluteUrl;
            try {
                absoluteUrl = new URL(href, url).href;
            } catch (e) {
                absoluteUrl = href;
            }

            links.push({
                url: absoluteUrl,
                text: text.substring(0, 100),
                title: title,
                isExternal: !absoluteUrl.startsWith(new URL(url).origin) && absoluteUrl.startsWith('http')
            });
        });

        // Gerar filename único
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const id = uuidv4().substring(0, 8);
        const filename = `${timestamp}_${id}.html`;

        // Salvar HTML
        const htmlDir = getUserHtmlDir(userId);
        const filePath = path.join(htmlDir, filename);
        fs.writeFileSync(filePath, response.data);

        // Salvar metadados JSON
        const metadataPath = path.join(htmlDir, `${filename}.json`);
        const metadata = {
            originalUrl: url,
            copiedAt: new Date().toISOString(),
            totalLinks: links.length,
            links: links
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Salvar no banco
        await createClone(userId, filename, url, response.data.length, links.length);

        res.json({
            success: true,
            filename: filename,
            size: response.data.length,
            totalLinks: links.length,
            links: links.slice(0, 10),
            url: `/html/${filename}`,
            metadataUrl: `/metadata/${filename}`,
            originalUrl: url
        });

    } catch (error) {
        console.error('Erro ao copiar HTML:', error.message);
        let errorMessage = 'Erro ao copiar o HTML';
        if (error.code === 'ENOTFOUND') {
            errorMessage = 'URL não encontrada';
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = 'Conexão recusada';
        } else if (error.response) {
            errorMessage = `Erro HTTP ${error.response.status}`;
        }
        res.status(500).json({ error: errorMessage });
    }
});

// Servir HTML salvos
app.get('/html/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;
    const htmlDir = getUserHtmlDir(userId);
    const filePath = path.join(htmlDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Arquivo não encontrado');
    }
});

// Download
app.get('/download/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;
    const htmlDir = getUserHtmlDir(userId);
    const filePath = path.join(htmlDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Arquivo não encontrado');
    }

    // Sempre baixar como index.html
    res.download(filePath, 'index.html');
});

// Metadados
app.get('/metadata/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;
    const htmlDir = getUserHtmlDir(userId);
    const metadataFilename = filename.toLowerCase().endsWith('.json') ? filename : `${filename}.json`;
    const metadataPath = path.join(htmlDir, metadataFilename);

    if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        res.json(metadata);
    } else {
        res.status(404).json({ error: 'Metadados não encontrados' });
    }
});

// Atualizar links
app.post('/update-links', requireAuth, async (req, res) => {
    const { filename, links } = req.body;
    const userId = req.session.userId;

    if (!filename || !links) {
        return res.status(400).json({ error: 'Filename e links são obrigatórios' });
    }

    // Verificar se clone pertence ao usuário
    const clone = await getCloneByFilename(filename, userId);
    if (!clone) {
        return res.status(404).json({ error: 'Clone não encontrado' });
    }

    try {
        const htmlDir = getUserHtmlDir(userId);
        const metadataPath = path.join(htmlDir, `${filename}.json`);
        
        if (!fs.existsSync(metadataPath)) {
            return res.status(404).json({ error: 'Arquivo de metadados não encontrado' });
        }

        // Atualizar metadados
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        metadata.links = links;
        metadata.totalLinks = links.length;
        metadata.updatedAt = new Date().toISOString();
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Atualizar HTML
        const htmlPath = path.join(htmlDir, filename);
        if (fs.existsSync(htmlPath)) {
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            const $ = cheerio.load(htmlContent);

            $('a[href]').each((index, element) => {
                if (index < links.length) {
                    const newHref = links[index].url;
                    if (typeof newHref === 'string' && newHref.trim().length > 0) {
                        $(element).attr('href', newHref.trim());
                    }
                }
            });

            fs.writeFileSync(htmlPath, $.html());
        }

        res.json({
            success: true,
            totalLinks: links.length,
            message: 'Links atualizados com sucesso'
        });

    } catch (error) {
        console.error('Erro ao atualizar links:', error);
        res.status(500).json({ error: 'Erro ao atualizar links' });
    }
});

// Deletar clone
app.delete('/html/:filename', requireAuth, async (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;

    try {
        const clone = await getCloneByFilename(filename, userId);
        if (!clone) {
            return res.status(404).json({ error: 'Clone não encontrado' });
        }

        // Deletar publicação se existir
        await deletePublicationByClone(clone.id, userId);

        // Deletar arquivos
        const htmlDir = getUserHtmlDir(userId);
        const filePath = path.join(htmlDir, filename);
        const metadataPath = path.join(htmlDir, `${filename}.json`);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }

        // Deletar do banco
        await deleteClone(filename, userId);

        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao deletar:', error);
        res.status(500).json({ error: 'Erro ao deletar clone' });
    }
});

// Publicar clone
app.post('/publish/:filename', requireAuth, async (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;

    try {
        const clone = await getCloneByFilename(filename, userId);
        if (!clone) {
            return res.status(404).json({ error: 'Clone não encontrado' });
        }

        const friendlyId = uuidv4().substring(0, 8).replace(/-/g, '');
        const publicUrl = `/p/${friendlyId}`;

        await createPublication(clone.id, friendlyId, publicUrl);

        res.json({
            success: true,
            publicUrl: publicUrl,
            friendlyId: friendlyId
        });
    } catch (error) {
        console.error('Erro ao publicar:', error);
        res.status(500).json({ error: 'Erro ao publicar clone' });
    }
});

// Visualizar publicação pública (não requer auth)
app.get('/p/:id', async (req, res) => {
    const friendlyId = req.params.id;

    try {
        const publication = await getPublicationByFriendlyId(friendlyId);
        if (!publication) {
            return res.status(404).send('Publicação não encontrada');
        }

        const htmlDir = getUserHtmlDir(publication.user_id);
        const filePath = path.join(htmlDir, publication.filename);

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Arquivo não encontrado');
        }
    } catch (error) {
        console.error('Erro ao visualizar publicação:', error);
        res.status(500).send('Erro ao visualizar publicação');
    }
});

// Despublicar
app.delete('/publish/:filename', requireAuth, async (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;

    try {
        const clone = await getCloneByFilename(filename, userId);
        if (!clone) {
            return res.status(404).json({ error: 'Clone não encontrado' });
        }

        // Obter publicação antes de deletar para retornar URL
        const publication = await getPublicationByCloneId(clone.id);
        const publicUrl = publication ? publication.public_url : null;

        await deletePublicationByClone(clone.id, userId);

        res.json({ 
            success: true, 
            publicUrl: publicUrl 
        });
    } catch (error) {
        console.error('Erro ao despublicar:', error);
        res.status(500).json({ error: 'Erro ao despublicar' });
    }
});

// Inicializar banco de dados e iniciar servidor
initDatabase()
    .then(() => {
        console.log('Banco de dados inicializado');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor rodando na porta ${PORT}`);
            console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
        });
    })
    .catch(err => {
        console.error('Erro ao inicializar banco de dados:', err);
        process.exit(1);
    });
