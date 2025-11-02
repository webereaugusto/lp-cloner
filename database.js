const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Inicializar banco de dados
function initDatabase() {
    return new Promise((resolve, reject) => {
        // Tabela de usuários
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) return reject(err);
            
            // Tabela de clones
            db.run(`
                CREATE TABLE IF NOT EXISTS clones (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    filename TEXT NOT NULL,
                    original_url TEXT,
                    file_size INTEGER,
                    total_links INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    UNIQUE(user_id, filename)
                )
            `, (err) => {
                if (err) return reject(err);
                
                // Tabela de publicações
                db.run(`
                    CREATE TABLE IF NOT EXISTS publications (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        clone_id INTEGER NOT NULL,
                        friendly_id TEXT UNIQUE NOT NULL,
                        public_url TEXT NOT NULL,
                        published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (clone_id) REFERENCES clones(id) ON DELETE CASCADE
                    )
                `, (err) => {
                    if (err) return reject(err);
                    
                    // Índices para performance
                    db.run(`CREATE INDEX IF NOT EXISTS idx_clones_user ON clones(user_id)`, () => {
                        db.run(`CREATE INDEX IF NOT EXISTS idx_publications_clone ON publications(clone_id)`, () => {
                            resolve();
                        });
                    });
                });
            });
        });
    });
}

// Funções de usuário
function createUser(email, hashedPassword) {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], function(err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, email });
        });
    });
}

function getUserByEmail(email) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function getUserById(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id, email, created_at FROM users WHERE id = ?', [id], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

// Funções de clones
function createClone(userId, filename, originalUrl, fileSize, totalLinks) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO clones (user_id, filename, original_url, file_size, total_links) VALUES (?, ?, ?, ?, ?)',
            [userId, filename, originalUrl, fileSize, totalLinks],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, filename, originalUrl });
            }
        );
    });
}

function getClonesByUserId(userId) {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT c.*, 
                    (SELECT p.friendly_id FROM publications p WHERE p.clone_id = c.id LIMIT 1) as friendly_id,
                    (SELECT p.public_url FROM publications p WHERE p.clone_id = c.id LIMIT 1) as public_url
             FROM clones c 
             WHERE c.user_id = ? 
             ORDER BY c.created_at DESC`,
            [userId],
            (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            }
        );
    });
}

function getCloneById(cloneId, userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM clones WHERE id = ? AND user_id = ?',
            [cloneId, userId],
            (err, row) => {
                if (err) return reject(err);
                resolve(row);
            }
        );
    });
}

function getCloneByFilename(filename, userId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM clones WHERE filename = ? AND user_id = ?',
            [filename, userId],
            (err, row) => {
                if (err) return reject(err);
                resolve(row);
            }
        );
    });
}

function deleteClone(filename, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM clones WHERE filename = ? AND user_id = ?',
            [filename, userId],
            function(err) {
                if (err) return reject(err);
                resolve({ deleted: this.changes > 0 });
            }
        );
    });
}

// Funções de publicações
function createPublication(cloneId, friendlyId, publicUrl) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO publications (clone_id, friendly_id, public_url) VALUES (?, ?, ?)',
            [cloneId, friendlyId, publicUrl],
            function(err) {
                if (err) return reject(err);
                resolve({ id: this.lastID, friendlyId, publicUrl });
            }
        );
    });
}

function getPublicationByFriendlyId(friendlyId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT p.*, c.filename, c.user_id 
             FROM publications p 
             JOIN clones c ON p.clone_id = c.id 
             WHERE p.friendly_id = ?`,
            [friendlyId],
            (err, row) => {
                if (err) return reject(err);
                resolve(row);
            }
        );
    });
}

function getPublicationByCloneId(cloneId) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM publications WHERE clone_id = ? LIMIT 1',
            [cloneId],
            (err, row) => {
                if (err) return reject(err);
                resolve(row);
            }
        );
    });
}

function deletePublicationByClone(cloneId, userId) {
    return new Promise((resolve, reject) => {
        db.run(
            `DELETE FROM publications 
             WHERE clone_id = ? 
             AND clone_id IN (SELECT id FROM clones WHERE user_id = ?)`,
            [cloneId, userId],
            function(err) {
                if (err) return reject(err);
                resolve({ deleted: this.changes > 0 });
            }
        );
    });
}

function getStatsByUserId(userId) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 
                COUNT(*) as totalFiles,
                COUNT(DISTINCT CASE WHEN p.id IS NOT NULL THEN c.id END) as published,
                COUNT(DISTINCT CASE WHEN p.id IS NULL THEN c.id END) as drafts,
                SUM(c.total_links) as totalLinks
             FROM clones c
             LEFT JOIN publications p ON c.id = p.clone_id
             WHERE c.user_id = ?`,
            [userId],
            (err, row) => {
                if (err) return reject(err);
                resolve(row || { totalFiles: 0, published: 0, drafts: 0, totalLinks: 0 });
            }
        );
    });
}

// Inicializar ao carregar
initDatabase().catch(console.error);

module.exports = {
    db,
    initDatabase,
    createUser,
    getUserByEmail,
    getUserById,
    createClone,
    getClonesByUserId,
    getCloneById,
    getCloneByFilename,
    deleteClone,
    createPublication,
    getPublicationByFriendlyId,
    getPublicationByCloneId,
    deletePublicationByClone,
    getStatsByUserId
};

