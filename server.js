const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Criar diretório para salvar HTML se não existir
const htmlDir = path.join(__dirname, 'html_copies');
if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir);
}

// Arquivo para mapear publicações
const publicationsFile = path.join(__dirname, 'publications.json');
let publications = {};

// Carregar publicações existentes
if (fs.existsSync(publicationsFile)) {
    try {
        publications = JSON.parse(fs.readFileSync(publicationsFile, 'utf8'));
    } catch (e) {
        publications = {};
    }
}

// Função para salvar publicações
function savePublications() {
    fs.writeFileSync(publicationsFile, JSON.stringify(publications, null, 2));
}

// Rota principal - formulário
app.get('/', (req, res) => {
    // Listar arquivos salvos
    fs.readdir(htmlDir, (err, files) => {
        if (err) {
            files = [];
        }

        // Considerar apenas arquivos .html (esconder .json da lista)
        const htmlFiles = files.filter(f => f.toLowerCase().endsWith('.html'));

        // Obter informações dos arquivos
        const fileInfos = htmlFiles.map(file => {
            const filePath = path.join(htmlDir, file);
            const stats = fs.statSync(filePath);
            // Tentar ler URL original do JSON de metadados correspondente
            const metaPath = path.join(htmlDir, `${file}.json`);
            let originalUrl = null;
            try {
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    originalUrl = meta.originalUrl || null;
                }
            } catch (_) {
                originalUrl = null;
            }

            // Verificar se há publicação para este arquivo
            const existingPub = Object.entries(publications).find(
                ([id, pub]) => pub.filename === file
            );

            let publishInfo = null;
            if (existingPub) {
                publishInfo = {
                    publicUrl: `/p/${existingPub[0]}`,
                    friendlyId: existingPub[0]
                };
            }

            return {
                name: file,
                size: stats.size,
                created: stats.birthtime,
                url: `/html/${file}`,
                originalUrl,
                publishInfo
            };
        }).sort((a, b) => b.created - a.created); // Ordenar por data decrescente

        // Calcular estatísticas
        let totalLinks = 0;
        fileInfos.forEach(file => {
            const metaPath = path.join(htmlDir, `${file.name}.json`);
            try {
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    totalLinks += meta.totalLinks || 0;
                }
            } catch (_) {}
        });

        const stats = {
            totalFiles: fileInfos.length,
            published: fileInfos.filter(f => f.publishInfo).length,
            drafts: fileInfos.filter(f => !f.publishInfo).length,
            totalLinks: totalLinks
        };

        res.render('index', { files: fileInfos, stats });
    });
});

// Rota para processar a modificação dos links
app.post('/modify-links', async (req, res) => {
    const { filename, linkChanges } = req.body;

    if (!filename || !linkChanges) {
        return res.status(400).json({ error: 'Nome do arquivo e mudanças são obrigatórios' });
    }

    try {
        // Ler arquivo HTML original
        const htmlPath = path.join(htmlDir, filename);
        if (!fs.existsSync(htmlPath)) {
            return res.status(404).json({ error: 'Arquivo HTML não encontrado' });
        }

        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Aplicar mudanças aos links
        let modifiedCount = 0;
        Object.entries(linkChanges).forEach(([oldUrl, newUrl]) => {
            if (oldUrl !== newUrl) {
                // Escapar caracteres especiais para regex
                const escapedOldUrl = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`href=["']${escapedOldUrl}["']`, 'g');
                const matches = htmlContent.match(regex);

                if (matches) {
                    modifiedCount += matches.length;
                    htmlContent = htmlContent.replace(regex, `href="${newUrl}"`);
                }
            }
        });

        // Gerar novo nome de arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const id = uuidv4().substring(0, 8);
        const baseName = filename.replace('.html', '');
        const modifiedFilename = `${baseName}_modified_${timestamp}_${id}.html`;

        // Salvar HTML modificado
        const modifiedPath = path.join(htmlDir, modifiedFilename);
        fs.writeFileSync(modifiedPath, htmlContent);

        // Salvar metadados da modificação
        const metadataPath = path.join(htmlDir, `${modifiedFilename}.json`);
        const metadata = {
            originalFile: filename,
            modifiedAt: new Date().toISOString(),
            totalChanges: modifiedCount,
            linkChanges: linkChanges
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({
            success: true,
            filename: modifiedFilename,
            modifiedCount: modifiedCount,
            url: `/html/${modifiedFilename}`,
            metadataUrl: `/metadata/${modifiedFilename}`
        });

    } catch (error) {
        console.error('Erro ao modificar links:', error);
        res.status(500).json({ error: 'Erro ao modificar links' });
    }
});

// Rota para processar a URL e salvar HTML
app.post('/copy', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL é obrigatória' });
    }

    try {
        // Validar URL básica
        new URL(url);

        // Fazer requisição para a URL
        const response = await axios.get(url, {
            timeout: 10000, // 10 segundos timeout
            headers: {
                'User-Agent': 'HTML-Copier/1.0'
            }
        });

        // Analisar HTML e extrair links
        const $ = cheerio.load(response.data);
        const links = [];

        $('a[href]').each((index, element) => {
            const href = $(element).attr('href');
            const text = $(element).text().trim() || '[sem texto]';
            const title = $(element).attr('title') || '';

            // Resolver URLs relativas para absolutas
            let absoluteUrl;
            try {
                absoluteUrl = new URL(href, url).href;
            } catch (e) {
                absoluteUrl = href; // Manter como está se não conseguir resolver
            }

            links.push({
                url: absoluteUrl,
                text: text.substring(0, 100), // Limitar tamanho do texto
                title: title,
                isExternal: !absoluteUrl.startsWith(url.origin) && absoluteUrl.startsWith('http')
            });
        });

        // Gerar nome único para o arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const id = uuidv4().substring(0, 8);
        const filename = `${timestamp}_${id}.html`;

        // Salvar conteúdo HTML
        const filePath = path.join(htmlDir, filename);
        fs.writeFileSync(filePath, response.data);

        // Salvar metadados dos links em um arquivo JSON separado
        const metadataPath = path.join(htmlDir, `${filename}.json`);
        const metadata = {
            originalUrl: url,
            copiedAt: new Date().toISOString(),
            totalLinks: links.length,
            links: links
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        res.json({
            success: true,
            filename: filename,
            size: response.data.length,
            totalLinks: links.length,
            links: links.slice(0, 10), // Retornar apenas os primeiros 10 links na resposta
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

// Rota para servir arquivos HTML salvos
app.get('/html/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(htmlDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Arquivo não encontrado');
    }
});

// Rota para download do arquivo HTML
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(htmlDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Arquivo não encontrado');
    }

    // Força download com nome do arquivo original
    res.download(filePath, filename);
});

// Rota para servir metadados dos links
app.get('/metadata/:filename', (req, res) => {
    let filename = req.params.filename;
    // Normalizar: aceitar com ou sem .json
    const metadataFilename = filename.toLowerCase().endsWith('.json') ? filename : `${filename}.json`;
    const metadataPath = path.join(htmlDir, metadataFilename);

    if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        res.json(metadata);
    } else {
        res.status(404).json({ error: 'Metadados não encontrados' });
    }
});

// Rota para atualizar links
app.post('/update-links', (req, res) => {
    const { filename, links } = req.body;

    if (!filename || !links) {
        return res.status(400).json({ error: 'Filename e links são obrigatórios' });
    }

    const metadataFilename = filename.toLowerCase().endsWith('.json') ? filename : `${filename}.json`;
    const metadataPath = path.join(htmlDir, metadataFilename);

    if (!fs.existsSync(metadataPath)) {
        return res.status(404).json({ error: 'Arquivo de metadados não encontrado' });
    }

    try {
        // Ler metadados existentes
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

        // Atualizar links
        metadata.links = links;
        metadata.totalLinks = links.length;
        metadata.updatedAt = new Date().toISOString();

        // Salvar metadados atualizados
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        // Atualizar o arquivo HTML salvo, substituindo os hrefs na mesma ordem encontrada
        const htmlPath = path.join(htmlDir, filename);
        if (fs.existsSync(htmlPath)) {
            try {
                const htmlContent = fs.readFileSync(htmlPath, 'utf8');
                const $ = cheerio.load(htmlContent);

                // Atualizar os hrefs dos anchors na ordem em que aparecem
                $('a[href]').each((index, element) => {
                    if (index < links.length) {
                        const newHref = links[index].url;
                        if (typeof newHref === 'string' && newHref.trim().length > 0) {
                            $(element).attr('href', newHref.trim());
                        }
                    }
                });

                const updatedHtml = $.html();
                fs.writeFileSync(htmlPath, updatedHtml);
            } catch (e) {
                console.error('Falha ao atualizar HTML com novos links:', e);
            }
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

// Rota para deletar arquivo
app.delete('/html/:filename', (req, res) => {
    const filename = req.params.filename;
    const isJson = filename.toLowerCase().endsWith('.json');
    const baseHtmlName = isJson ? filename.slice(0, -5) : filename; // remove .json
    const filePath = path.join(htmlDir, baseHtmlName);
    const metadataPath = path.join(htmlDir, `${baseHtmlName}.json`);

    try {
        // Deletar arquivo HTML
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Deletar arquivo de metadados se existir
        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao deletar arquivos:', error);
        res.status(500).json({ error: 'Erro ao deletar arquivos' });
    }
});

// Rota para publicar arquivo HTML
app.post('/publish/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(htmlDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    try {
        // Gerar ID amigável (8 caracteres alfanuméricos)
        const friendlyId = uuidv4().substring(0, 8).replace(/-/g, '');

        // Salvar mapeamento
        publications[friendlyId] = {
            filename: filename,
            publishedAt: new Date().toISOString(),
            originalUrl: null
        };

        // Tentar obter URL original do metadata
        const metadataPath = path.join(htmlDir, `${filename}.json`);
        if (fs.existsSync(metadataPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                publications[friendlyId].originalUrl = metadata.originalUrl;
            } catch (e) {
                // Ignorar se não conseguir ler metadata
            }
        }

        savePublications();

        res.json({
            success: true,
            publicUrl: `/p/${friendlyId}`,
            friendlyId: friendlyId
        });

    } catch (error) {
        console.error('Erro ao publicar:', error);
        res.status(500).json({ error: 'Erro ao publicar arquivo' });
    }
});

// Rota para visualizar publicação
app.get('/p/:id', (req, res) => {
    const id = req.params.id;

    if (!publications[id]) {
        return res.status(404).send('Publicação não encontrada');
    }

    const filename = publications[id].filename;
    const filePath = path.join(htmlDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Arquivo não encontrado');
    }
});

// Rota para obter informações de publicação
app.get('/publish-info/:filename', (req, res) => {
    const filename = req.params.filename;
    
    // Procurar publicação existente para este arquivo
    const existingPub = Object.entries(publications).find(
        ([id, pub]) => pub.filename === filename
    );

    if (existingPub) {
        res.json({
            published: true,
            publicUrl: `/p/${existingPub[0]}`,
            friendlyId: existingPub[0]
        });
    } else {
        res.json({ published: false });
    }
});

// Rota para DESPUBLICAR por filename
app.delete('/publish/:filename', (req, res) => {
    const filename = req.params.filename;

    // Encontrar todas as publicações que apontam para este arquivo
    const idsToDelete = Object.entries(publications)
        .filter(([id, pub]) => pub.filename === filename)
        .map(([id]) => id);

    if (idsToDelete.length === 0) {
        return res.status(404).json({ error: 'Publicação não encontrada para este arquivo' });
    }

    // Guardar a URL antes de deletar
    const firstId = idsToDelete[0];
    const publicUrl = `/p/${firstId}`;

    idsToDelete.forEach((id) => {
        delete publications[id];
    });
    savePublications();

    res.json({ success: true, removed: idsToDelete.length, publicUrl: publicUrl });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
