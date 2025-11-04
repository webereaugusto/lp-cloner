-- Migração: Adicionar coluna html_content à tabela clones
-- Execute este script no SQL Editor do Supabase

-- Adicionar coluna html_content (TEXT para armazenar HTML completo)
ALTER TABLE clones 
ADD COLUMN IF NOT EXISTS html_content TEXT;

-- Comentário explicativo
COMMENT ON COLUMN clones.html_content IS 'Conteúdo HTML completo do clone para persistência no Render';

