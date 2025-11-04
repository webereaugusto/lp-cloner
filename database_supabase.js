const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Helper para validar URL http/https
function isValidHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Não lançar erro aqui, apenas avisar. O dotenv já foi carregado em server.js
if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  SUPABASE_URL ou SUPABASE_KEY não configuradas');
}

const supabase = (supabaseUrl && supabaseKey && isValidHttpUrl(supabaseUrl))
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Função de inicialização (não precisa criar tabelas, mas pode validar conexão)
async function initDatabase() {
    if (!supabase) {
        throw new Error('Supabase não está configurado. Verifique SUPABASE_URL e SUPABASE_KEY.');
    }
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('count', { count: 'exact', head: true });
        
        if (error) {
            console.error('Erro ao conectar com Supabase:', error.message);
            throw error;
        }
        
        console.log('✅ Conectado ao Supabase com sucesso');
        return Promise.resolve();
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
        throw error;
    }
}

// ========== FUNÇÕES DE USUÁRIO ==========

async function createUser(email, hashedPassword) {
    try {
        const { data, error } = await supabase
            .from('users')
            .insert([
                { email, password: hashedPassword }
            ])
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { id: data.id, email: data.email };
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        throw error;
    }
}

async function getUserByEmail(email) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Usuário não encontrado
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Erro ao buscar usuário por email:', error);
        throw error;
    }
}

async function getUserById(id) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Erro ao buscar usuário por ID:', error);
        throw error;
    }
}

// ========== FUNÇÕES DE CLONES ==========

async function createClone(userId, filename, originalUrl, fileSize, totalLinks, projectName = null) {
    try {
        const { data, error } = await supabase
            .from('clones')
            .insert([
                { 
                    user_id: userId, 
                    filename, 
                    original_url: originalUrl, 
                    file_size: fileSize, 
                    total_links: totalLinks,
                    project_name: projectName
                }
            ])
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { id: data.id, filename, originalUrl };
    } catch (error) {
        console.error('Erro ao criar clone:', error);
        throw error;
    }
}

async function getClonesByUserId(userId) {
    try {
        const { data, error } = await supabase
            .from('clones')
            .select(`
                *,
                publications (
                    friendly_id,
                    public_url
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Formatar dados para manter compatibilidade com o código existente
        return data.map(clone => ({
            ...clone,
            friendly_id: clone.publications && clone.publications.length > 0 ? clone.publications[0].friendly_id : null,
            public_url: clone.publications && clone.publications.length > 0 ? clone.publications[0].public_url : null
        }));
    } catch (error) {
        console.error('Erro ao buscar clones:', error);
        throw error;
    }
}

async function getCloneById(cloneId, userId) {
    try {
        const { data, error } = await supabase
            .from('clones')
            .select('*')
            .eq('id', cloneId)
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Erro ao buscar clone por ID:', error);
        throw error;
    }
}

async function getCloneByFilename(filename, userId) {
    try {
        const { data, error } = await supabase
            .from('clones')
            .select('*')
            .eq('filename', filename)
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Erro ao buscar clone por filename:', error);
        throw error;
    }
}

// Verificar se um nome de projeto está disponível para o usuário
async function getCloneByProjectName(projectName, userId) {
    try {
        // Verificar se projectName é válido (não null, não vazio)
        if (!projectName || projectName.trim().length === 0) {
            return null;
        }

        const { data, error } = await supabase
            .from('clones')
            .select('*')
            .eq('project_name', projectName.trim())
            .eq('user_id', userId)
            .maybeSingle(); // Use maybeSingle() ao invés de single() para não lançar erro quando não encontrar

        if (error) {
            // Se for erro de coluna não encontrada, pode ser que a migração não foi executada
            if (error.code === 'PGRST204' || (error.message && error.message.includes('project_name'))) {
                console.error('Coluna project_name não encontrada. Execute a migração SQL no Supabase.');
                throw new Error('Coluna project_name não existe no banco de dados. Execute a migração SQL.');
            }
            // Erro PGRST116 significa "não encontrado", o que é OK
            if (error.code === 'PGRST116') {
                return null; // Não encontrado, nome disponível
            }
            throw error;
        }

        return data || null;
    } catch (error) {
        console.error('Erro ao buscar clone por project_name:', error);
        throw error;
    }
}

// Atualizar nome do projeto de um clone
async function updateCloneProjectName(filename, userId, projectName) {
    try {
        // Se projectName estiver vazio, definir como null
        const projectNameValue = projectName && projectName.trim().length > 0 ? projectName.trim() : null;

        const { data, error } = await supabase
            .from('clones')
            .update({ project_name: projectNameValue })
            .eq('filename', filename)
            .eq('user_id', userId)
            .select();

        if (error) {
            // Se for erro de UNIQUE constraint, retornar erro específico
            if (error.code === '23505' || (error.message && error.message.includes('unique'))) {
                throw new Error('Este nome de projeto já está em uso');
            }
            throw error;
        }

        return { updated: data && data.length > 0 };
    } catch (error) {
        console.error('Erro ao atualizar nome do projeto:', error);
        throw error;
    }
}

async function deleteClone(filename, userId) {
    try {
        const { data, error } = await supabase
            .from('clones')
            .delete()
            .eq('filename', filename)
            .eq('user_id', userId)
            .select();

        if (error) {
            throw error;
        }

        return { deleted: data && data.length > 0 };
    } catch (error) {
        console.error('Erro ao deletar clone:', error);
        throw error;
    }
}

// ========== FUNÇÕES DE PUBLICAÇÕES ==========

async function createPublication(cloneId, friendlyId, publicUrl) {
    try {
        const { data, error } = await supabase
            .from('publications')
            .insert([
                { clone_id: cloneId, friendly_id: friendlyId, public_url: publicUrl }
            ])
            .select()
            .single();

        if (error) {
            throw error;
        }

        return { id: data.id, friendlyId, publicUrl };
    } catch (error) {
        console.error('Erro ao criar publicação:', error);
        throw error;
    }
}

async function getPublicationByFriendlyId(friendlyId) {
    try {
        if (!supabase) {
            throw new Error('Supabase não está configurado');
        }

        // Primeiro, buscar a publicação
        const { data: publicationData, error: publicationError } = await supabase
            .from('publications')
            .select('*')
            .eq('friendly_id', friendlyId)
            .single();

        if (publicationError) {
            if (publicationError.code === 'PGRST116') {
                return null; // Não encontrado
            }
            throw publicationError;
        }

        if (!publicationData) {
            return null;
        }

        // Buscar o clone relacionado para obter o user_id
        const { data: cloneData, error: cloneError } = await supabase
            .from('clones')
            .select('filename, user_id')
            .eq('id', publicationData.clone_id)
            .single();

        if (cloneError) {
            // Se não encontrar o clone, ainda retornar a publicação sem user_id
            console.warn('Clone não encontrado para publicação:', publicationData.id);
            return {
                ...publicationData,
                user_id: null,
                filename: null
            };
        }

        // Formatar para manter compatibilidade
        const result = {
            ...publicationData,
            filename: cloneData ? cloneData.filename : null,
            user_id: cloneData ? cloneData.user_id : null
        };
        
        console.log(`getPublicationByFriendlyId(${friendlyId}) retornou:`, {
            friendly_id: result.friendly_id,
            clone_id: result.clone_id,
            filename: result.filename,
            user_id: result.user_id
        });
        
        return result;
    } catch (error) {
        console.error('Erro ao buscar publicação por friendly_id:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

async function getPublicationByCloneId(cloneId) {
    try {
        const { data, error } = await supabase
            .from('publications')
            .select('*')
            .eq('clone_id', cloneId)
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Erro ao buscar publicação por clone_id:', error);
        throw error;
    }
}

async function deletePublicationByClone(cloneId, userId) {
    try {
        // Primeiro verificar se o clone pertence ao usuário
        const clone = await getCloneById(cloneId, userId);
        if (!clone) {
            return { deleted: false };
        }

        // Deletar publicação
        const { data, error } = await supabase
            .from('publications')
            .delete()
            .eq('clone_id', cloneId)
            .select();

        if (error) {
            throw error;
        }

        return { deleted: data && data.length > 0 };
    } catch (error) {
        console.error('Erro ao deletar publicação:', error);
        throw error;
    }
}

// ========== FUNÇÕES DE ESTATÍSTICAS ==========

async function getStatsByUserId(userId) {
    try {
        // Buscar clones com suas publicações
        const { data, error } = await supabase
            .from('clones')
            .select(`
                id,
                total_links,
                publications!left (id)
            `)
            .eq('user_id', userId);

        if (error) {
            throw error;
        }

        // Calcular estatísticas
        let totalFiles = 0;
        let published = 0;
        let drafts = 0;
        let totalLinks = 0;

        if (data && data.length > 0) {
            totalFiles = data.length;
            totalLinks = data.reduce((sum, clone) => sum + (clone.total_links || 0), 0);
            
            data.forEach(clone => {
                if (clone.publications && clone.publications.length > 0) {
                    published++;
                } else {
                    drafts++;
                }
            });
        }

        return { totalFiles, published, drafts, totalLinks };
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        throw error;
    }
}

module.exports = {
    supabase,
    initDatabase,
    createUser,
    getUserByEmail,
    getUserById,
    createClone,
    getClonesByUserId,
    getCloneById,
    getCloneByFilename,
    getCloneByProjectName,
    updateCloneProjectName,
    deleteClone,
    createPublication,
    getPublicationByFriendlyId,
    getPublicationByCloneId,
    deletePublicationByClone,
    getStatsByUserId
};

