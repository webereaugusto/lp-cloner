-- Migração: Adicionar coluna project_name à tabela clones
-- Execute este script no SQL Editor do Supabase

-- Adicionar coluna project_name (opcional, pode ser NULL)
ALTER TABLE clones 
ADD COLUMN IF NOT EXISTS project_name TEXT;

-- Criar índice único para garantir que cada usuário tenha nomes de projeto únicos
CREATE UNIQUE INDEX IF NOT EXISTS idx_clones_user_project_name 
ON clones(user_id, project_name) 
WHERE project_name IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN clones.project_name IS 'Nome personalizado do projeto/clone definido pelo usuário';

