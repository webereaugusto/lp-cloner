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
let useSupabase = process.env.USE_SUPABASE === 'true' || process.env.USE_SUPABASE === '1';
// Validar env do Supabase antes de confirmar uso
const envSupabaseUrl = process.env.SUPABASE_URL;
const envSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
function isValidHttpUrl(url) {
    try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
if (useSupabase && (!envSupabaseUrl || !envSupabaseKey || !isValidHttpUrl(envSupabaseUrl))) {
    console.warn('⚠️  Supabase configurado mas credenciais inválidas. Usando SQLite.');
    useSupabase = false;
}
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
    getUserById,
    getCloneByProjectName,
    updateCloneProjectName
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

// Evitar cache de páginas dinâmicas (útil para refletir alterações imediatamente)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

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

// Função para garantir que o HTML sempre tenha charset UTF-8
function ensureUTF8Charset(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent, { 
            decodeEntities: false,
            withStartIndices: false,
            withEndIndices: false
        });

        // Garantir que existe um <head>
        let head = $('head');
        if (head.length === 0) {
            // Se não existe <head>, criar antes do <body> ou no início do <html>
            const html = $('html');
            if (html.length > 0) {
                html.prepend('<head></head>');
                head = $('head');
            } else {
                // Se nem <html> existe, criar estrutura básica
                $('body').prepend('<head></head>');
                head = $('head');
                if (head.length === 0) {
                    // Último recurso: inserir no início do documento
                    const body = $('body');
                    if (body.length > 0) {
                        body.before('<head></head>');
                        head = $('head');
                    } else {
                        // Documento sem estrutura, adicionar charset no início
                        return '<meta charset="UTF-8">\n' + htmlContent;
                    }
                }
            }
        }

        // Verificar se já existe meta charset
        let metaCharset = head.find('meta[charset]');
        
        if (metaCharset.length === 0) {
            // Não existe, adicionar no início do head
            head.prepend('<meta charset="UTF-8">');
        } else {
            // Existe, verificar se está correto
            metaCharset.each(function() {
                const charset = $(this).attr('charset');
                if (charset && charset.toUpperCase() !== 'UTF-8') {
                    $(this).attr('charset', 'UTF-8');
                }
            });
        }

        return $.html();
    } catch (error) {
        // Se der erro no parsing, tentar adicionar manualmente no início
        console.warn('Erro ao processar HTML para charset:', error.message);
        // Verificar se já tem charset
        if (!/<\s*meta\s+[^>]*charset\s*=\s*["']?UTF-8["']?/i.test(htmlContent)) {
            // Adicionar no início do head se existir, senão no início do documento
            if (/<\s*head[^>]*>/i.test(htmlContent)) {
                return htmlContent.replace(/(<\s*head[^>]*>)/i, '$1\n    <meta charset="UTF-8">');
            } else {
                return '<meta charset="UTF-8">\n' + htmlContent;
            }
        }
        return htmlContent;
    }
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
        // Fazer login automático após registro
        req.session.userId = result.user.id;
        req.session.userEmail = result.user.email;
        
        // Transferir clones pendentes se houver
        if (req.session.pendingClones && req.session.pendingClones.length > 0) {
            const sessionId = req.session.publicSessionId || req.sessionID;
            await transferPendingClones(result.user.id, sessionId);
            req.session.pendingClones = [];
            req.session.publicSessionId = null;
        }
        
        req.session.save();
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
            
            // Transferir clones pendentes se houver
            if (req.session.pendingClones && req.session.pendingClones.length > 0) {
                const sessionId = req.session.publicSessionId || req.sessionID;
                await transferPendingClones(result.user.id, sessionId);
                req.session.pendingClones = [];
                req.session.publicSessionId = null;
            }
            
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

// Health check endpoint para uptime monitors
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
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
            projectName: clone.project_name || null,
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

// Função para criar diretório temporário
function getTempDir() {
    const tempDir = path.join(__dirname, 'html_copies', 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

// Função para transferir clones temporários para o usuário
async function transferPendingClones(userId, sessionId) {
    try {
        const tempDir = getTempDir();
        const tempFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.html') && f.startsWith(`session_${sessionId}_`));
        
        const htmlDir = getUserHtmlDir(userId);
        const transferred = [];

        for (const tempFile of tempFiles) {
            try {
                // Ler arquivo temporário
                const tempPath = path.join(tempDir, tempFile);
                const htmlContent = fs.readFileSync(tempPath, 'utf8');
                
                // Ler metadados
                const metadataPath = path.join(tempDir, tempFile.replace('.html', '.json'));
                let metadata = {};
                if (fs.existsSync(metadataPath)) {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                }

                // Criar novo filename único para o usuário
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const id = uuidv4().substring(0, 8);
                const newFilename = `${timestamp}_${id}.html`;

                // Garantir charset UTF-8 no HTML (pode não ter sido aplicado antes)
                const htmlWithCharset = ensureUTF8Charset(htmlContent);

                // Salvar no diretório do usuário
                const userFilePath = path.join(htmlDir, newFilename);
                fs.writeFileSync(userFilePath, htmlWithCharset);

                // Salvar metadados
                const userMetadataPath = path.join(htmlDir, `${newFilename}.json`);
                fs.writeFileSync(userMetadataPath, JSON.stringify(metadata, null, 2));

                // Salvar no banco (usar tamanho do arquivo corrigido)
                await createClone(userId, newFilename, metadata.originalUrl || '', htmlWithCharset.length, metadata.totalLinks || 0);

                // Deletar arquivos temporários
                fs.unlinkSync(tempPath);
                if (fs.existsSync(metadataPath)) {
                    fs.unlinkSync(metadataPath);
                }

                transferred.push(newFilename);
            } catch (err) {
                console.error(`Erro ao transferir ${tempFile}:`, err);
            }
        }

        return transferred;
    } catch (error) {
        console.error('Erro ao transferir clones pendentes:', error);
        return [];
    }
}

// Rota pública para copiar URL (sem autenticação)
app.post('/copy-public', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL é obrigatória' });
    }

    try {
        // Validar URL
        new URL(url);

        // Gerar sessionId se não existir
        if (!req.session.publicSessionId) {
            req.session.publicSessionId = uuidv4();
        }

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

        // Gerar filename único para arquivo temporário
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const id = uuidv4().substring(0, 8);
        const tempFilename = `session_${req.session.publicSessionId}_${timestamp}_${id}.html`;

        // Garantir charset UTF-8 no HTML
        const htmlWithCharset = ensureUTF8Charset(response.data);

        // Salvar temporariamente
        const tempDir = getTempDir();
        const tempPath = path.join(tempDir, tempFilename);
        fs.writeFileSync(tempPath, htmlWithCharset);

        // Salvar metadados temporários
        const metadataPath = path.join(tempDir, tempFilename.replace('.html', '.json'));
        const metadata = {
            originalUrl: url,
            copiedAt: new Date().toISOString(),
            totalLinks: links.length,
            links: links
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Guardar informação na sessão para transferir depois
        if (!req.session.pendingClones) {
            req.session.pendingClones = [];
        }
        req.session.pendingClones.push({
            tempFilename,
            originalUrl: url,
            totalLinks: links.length
        });

        req.session.save();

        res.json({
            success: true,
            totalLinks: links.length,
            message: 'Clone processado com sucesso! Faça login para acessar.'
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

// Rota para copiar URL (requer autenticação)
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

        // Garantir charset UTF-8 no HTML
        const htmlWithCharset = ensureUTF8Charset(response.data);

        // Salvar HTML
        const htmlDir = getUserHtmlDir(userId);
        const filePath = path.join(htmlDir, filename);
        fs.writeFileSync(filePath, htmlWithCharset);

        // Salvar metadados JSON
        const metadataPath = path.join(htmlDir, `${filename}.json`);
        const metadata = {
            originalUrl: url,
            copiedAt: new Date().toISOString(),
            totalLinks: links.length,
            links: links
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Salvar no banco (usar tamanho do arquivo corrigido)
        await createClone(userId, filename, url, htmlWithCharset.length, links.length);

        res.json({
            success: true,
            filename: filename,
            size: htmlWithCharset.length,
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

            // Garantir charset UTF-8 antes de salvar
            const updatedHtml = ensureUTF8Charset($.html());
            fs.writeFileSync(htmlPath, updatedHtml);
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
    const { friendlyId: customFriendlyId } = req.body || {};

    try {
        const clone = await getCloneByFilename(filename, userId);
        if (!clone) {
            return res.status(404).json({ error: 'Clone não encontrado' });
        }

        // Verificar se já existe publicação
        const existingPublication = await getPublicationByCloneId(clone.id);
        if (existingPublication) {
            return res.status(400).json({ error: 'Clone já está publicado' });
        }

        let friendlyId;
        if (customFriendlyId) {
            // Validar formato
            if (!/^[a-zA-Z0-9-]+$/.test(customFriendlyId)) {
                return res.status(400).json({ error: 'Formato inválido. Use apenas letras, números e hífen' });
            }
            
            // Verificar se está disponível
            const existing = await getPublicationByFriendlyId(customFriendlyId);
            if (existing && existing.user_id !== userId) {
                return res.status(400).json({ error: 'Esta URL já está em uso' });
            }
            
            friendlyId = customFriendlyId;
        } else {
            // Gerar ID aleatório único
            let attempts = 0;
            do {
                friendlyId = uuidv4().substring(0, 8).replace(/-/g, '');
                const existing = await getPublicationByFriendlyId(friendlyId);
                if (!existing) break;
                attempts++;
                if (attempts > 10) {
                    return res.status(500).json({ error: 'Erro ao gerar URL única' });
                }
            } while (true);
        }

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

// Atualizar URL pública de um clone publicado
app.put('/publish/:filename', requireAuth, async (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;
    const { friendlyId } = req.body || {};

    if (!friendlyId) {
        return res.status(400).json({ error: 'friendlyId é obrigatório' });
    }

    try {
        const clone = await getCloneByFilename(filename, userId);
        if (!clone) {
            return res.status(404).json({ error: 'Clone não encontrado' });
        }

        // Validar formato
        if (!/^[a-zA-Z0-9-]+$/.test(friendlyId)) {
            return res.status(400).json({ error: 'Formato inválido. Use apenas letras, números e hífen' });
        }

        // Verificar se está disponível
        const existing = await getPublicationByFriendlyId(friendlyId);
        if (existing) {
            // Se a publicação existe e pertence a outro clone do mesmo usuário, não permitir
            if (existing.user_id === userId && existing.clone_id !== clone.id) {
                return res.status(400).json({ error: 'Esta URL já está em uso por outro clone seu' });
            }
            // Se pertence a outro usuário, não permitir
            if (existing.user_id !== userId) {
                return res.status(400).json({ error: 'Esta URL já está em uso' });
            }
        }

        // Obter publicação existente
        const publication = await getPublicationByCloneId(clone.id);
        if (!publication) {
            return res.status(404).json({ error: 'Clone não está publicado' });
        }

        // Atualizar publicação (precisamos deletar e recriar porque friendly_id é UNIQUE)
        await deletePublicationByClone(clone.id, userId);
        const publicUrl = `/p/${friendlyId}`;
        await createPublication(clone.id, friendlyId, publicUrl);

        res.json({
            success: true,
            publicUrl: publicUrl,
            friendlyId: friendlyId
        });
    } catch (error) {
        console.error('Erro ao atualizar URL:', error);
        res.status(500).json({ error: 'Erro ao atualizar URL' });
    }
});

// Verificar se uma URL pública está disponível
app.get('/check-url/:friendlyId', requireAuth, async (req, res) => {
    try {
        // Decodificar o friendlyId da URL
        let friendlyId = decodeURIComponent(req.params.friendlyId);

        // Validar formato do friendlyId (apenas letras, números e hífen)
        if (!friendlyId || !/^[a-zA-Z0-9-]+$/.test(friendlyId)) {
            return res.json({ available: false, error: 'Formato inválido. Use apenas letras, números e hífen' });
        }

        // Buscar publicação
        let publication;
        try {
            publication = await getPublicationByFriendlyId(friendlyId);
        } catch (dbError) {
            console.error('Erro do banco de dados ao verificar URL:', dbError);
            return res.status(500).json({ available: false, error: 'Erro ao verificar disponibilidade da URL' });
        }
        
        if (publication) {
            // Verificar se a publicação pertence ao usuário atual (para permitir editar a própria URL)
            const userId = req.session.userId;
            if (publication.user_id === userId) {
                return res.json({ available: true, isOwn: true });
            }
            return res.json({ available: false, error: 'Esta URL já está em uso' });
        }

        // URL disponível
        res.json({ available: true, isOwn: false });
    } catch (error) {
        console.error('Erro ao verificar URL:', error);
        console.error('Stack trace:', error.stack);
        // Garantir que sempre retorna JSON válido
        if (!res.headersSent) {
            res.status(500).json({ available: false, error: 'Erro ao verificar URL. Tente novamente.' });
        }
    }
});

// Visualizar publicação pública (não requer auth)
app.get('/p/:id', async (req, res) => {
    const friendlyId = req.params.id;

    try {
        const publication = await getPublicationByFriendlyId(friendlyId);
        if (!publication) {
            console.error(`Publicação não encontrada para friendlyId: ${friendlyId}`);
            return res.status(404).send('Publicação não encontrada');
        }

        // Verificar se temos os dados necessários
        if (!publication.user_id || !publication.filename) {
            console.error('Publicação sem user_id ou filename:', publication);
            return res.status(404).send('Dados da publicação incompletos');
        }

        const htmlDir = getUserHtmlDir(publication.user_id);
        const filePath = path.join(htmlDir, publication.filename);

        console.log(`Tentando acessar arquivo: ${filePath}`);
        console.log(`Arquivo existe? ${fs.existsSync(filePath)}`);
        console.log(`Diretório existe? ${fs.existsSync(htmlDir)}`);

        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            console.error(`Arquivo não encontrado no caminho: ${filePath}`);
            console.error(`Diretório base (__dirname): ${__dirname}`);
            console.error(`Diretório html_copies existe? ${fs.existsSync(path.join(__dirname, 'html_copies'))}`);
            
            if (fs.existsSync(htmlDir)) {
                try {
                    const files = fs.readdirSync(htmlDir);
                    console.error(`Arquivos no diretório ${htmlDir}: ${files.join(', ')}`);
                } catch (err) {
                    console.error(`Erro ao listar arquivos do diretório: ${err.message}`);
                }
            } else {
                console.error(`Diretório ${htmlDir} não existe`);
                // Verificar se o diretório pai existe
                const parentDir = path.dirname(htmlDir);
                console.error(`Diretório pai existe? ${fs.existsSync(parentDir)}`);
                if (fs.existsSync(parentDir)) {
                    try {
                        const parentFiles = fs.readdirSync(parentDir);
                        console.error(`Conteúdo do diretório pai: ${parentFiles.join(', ')}`);
                    } catch (err) {
                        console.error(`Erro ao listar diretório pai: ${err.message}`);
                    }
                }
            }
            
            // No Render, arquivos podem ser perdidos em deploys. Retornar erro mais informativo
            res.status(404).send('Arquivo não encontrado. O arquivo pode ter sido perdido após um deploy. Por favor, recrie o clone.');
        }
    } catch (error) {
        console.error('Erro ao visualizar publicação:', error);
        console.error('Stack trace:', error.stack);
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

// Verificar se um nome de projeto está disponível
app.get('/check-project-name/:projectName', requireAuth, async (req, res) => {
    try {
        // Decodificar o projectName da URL
        let projectName = decodeURIComponent(req.params.projectName);

        // Validar formato do projectName (permitir letras, números, espaços, hífens e underscores)
        if (!projectName || !/^[a-zA-Z0-9\s_-]+$/.test(projectName)) {
            return res.json({ available: false, error: 'Formato inválido. Use apenas letras, números, espaços, hífens e underscores' });
        }

        // Verificar se o nome está vazio após trim
        const trimmedName = projectName.trim();
        if (trimmedName.length === 0) {
            return res.json({ available: false, error: 'O nome do projeto não pode estar vazio' });
        }

        // Buscar clone com esse nome de projeto
        let existingClone;
        try {
            existingClone = await getCloneByProjectName(trimmedName, req.session.userId);
        } catch (dbError) {
            console.error('Erro do banco de dados ao verificar nome do projeto:', dbError);
            // Verificar se é erro de coluna não encontrada
            if (dbError.message && dbError.message.includes('project_name')) {
                return res.status(500).json({ 
                    available: false, 
                    error: 'Coluna project_name não existe no banco. Execute a migração SQL no Supabase.' 
                });
            }
            return res.status(500).json({ 
                available: false, 
                error: dbError.message || 'Erro ao verificar disponibilidade do nome' 
            });
        }
        
        if (existingClone) {
            // Verificar se o clone encontrado é o mesmo que está sendo editado
            const filename = req.query.filename; // Passar filename via query para verificar se é o mesmo clone
            if (filename && existingClone.filename === filename) {
                return res.json({ available: true, isOwn: true });
            }
            return res.json({ available: false, error: 'Este nome de projeto já está em uso' });
        }

        // Nome disponível
        res.json({ available: true, isOwn: false });
    } catch (error) {
        console.error('Erro ao verificar nome do projeto:', error);
        console.error('Stack trace:', error.stack);
        // Garantir que sempre retorna JSON válido
        if (!res.headersSent) {
            res.status(500).json({ available: false, error: 'Erro ao verificar nome do projeto. Tente novamente.' });
        }
    }
});

// Atualizar nome do projeto de um clone
app.put('/clone/:filename/project-name', requireAuth, async (req, res) => {
    const filename = req.params.filename;
    const userId = req.session.userId;
    const { projectName } = req.body || {};

    try {
        // Verificar se o clone existe e pertence ao usuário
        const clone = await getCloneByFilename(filename, userId);
        if (!clone) {
            return res.status(404).json({ error: 'Clone não encontrado' });
        }

        // Se projectName for vazio ou apenas espaços, definir como null
        const trimmedName = projectName ? projectName.trim() : '';

        if (trimmedName.length === 0) {
            // Permitir definir como vazio (null)
            await updateCloneProjectName(filename, userId, null);
            return res.json({
                success: true,
                projectName: null
            });
        }

        // Validar formato
        if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmedName)) {
            return res.status(400).json({ error: 'Formato inválido. Use apenas letras, números, espaços, hífens e underscores' });
        }

        // Verificar se está disponível (exceto se for o próprio clone)
        const existing = await getCloneByProjectName(trimmedName, userId);
        if (existing && existing.filename !== filename) {
            return res.status(400).json({ error: 'Este nome de projeto já está em uso' });
        }

        // Atualizar nome do projeto
        await updateCloneProjectName(filename, userId, trimmedName);

        res.json({
            success: true,
            projectName: trimmedName
        });
    } catch (error) {
        console.error('Erro ao atualizar nome do projeto:', error);
        // Verificar se é erro de nome duplicado
        if (error.message && error.message.includes('já está em uso')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Erro ao atualizar nome do projeto' });
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
