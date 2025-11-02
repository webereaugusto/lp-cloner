require('dotenv').config();
const bcrypt = require('bcrypt');

// Escolher banco de dados baseado em variável de ambiente
const useSupabase = process.env.USE_SUPABASE === 'true' || process.env.USE_SUPABASE === '1';
const { createUser, getUserByEmail } = useSupabase ? require('./database_supabase') : require('./database');

// Middleware para verificar autenticação
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// Middleware opcional (não redireciona, apenas verifica)
function optionalAuth(req, res, next) {
    // Se não autenticado, req.user será null
    next();
}

// Registrar novo usuário
async function register(email, password) {
    try {
        // Verificar se usuário já existe
        const existingUser = await getUserByEmail(email);
        if (existingUser) {
            return { success: false, error: 'Email já cadastrado' };
        }

        // Hash da senha
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Criar usuário
        const user = await createUser(email, hashedPassword);
        return { success: true, user };
    } catch (error) {
        console.error('Erro ao registrar:', error);
        return { success: false, error: 'Erro ao criar conta' };
    }
}

// Login
async function login(email, password) {
    try {
        const user = await getUserByEmail(email);
        if (!user) {
            return { success: false, error: 'Email ou senha incorretos' };
        }

        // Verificar senha
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return { success: false, error: 'Email ou senha incorretos' };
        }

        return { success: true, user: { id: user.id, email: user.email } };
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        return { success: false, error: 'Erro ao fazer login' };
    }
}

module.exports = {
    requireAuth,
    optionalAuth,
    register,
    login
};

