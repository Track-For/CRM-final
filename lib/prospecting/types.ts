export interface Prospect {
  origem?: "receita_federal"; cnpj?: string; cnae?: string; razao_social?: string; competencia?: string;
  id: string; nome: string; telefone: string; whatsapp: string; email: string;
  site: string; categoria: string; cidade: string; uf: string; endereco: string;
  nota: string | number; avaliacoes: string | number; maps: string; buscas: string[];
}
export interface ReceitaStatus {
  loaded: boolean; total: number; uf?: string; city?: string; regions?: Record<string, string[]>; month?: string; partial?: boolean; missingNames?: number; importedAt?: string;
}
export interface ReceitaResults { items: Prospect[]; total: number; page: number; pageSize: number }
export interface ProspectSearch {
  id: string; estado: string; etapa: string; total: number; avisos: string[];
  criado_em: number; parametros: { nichos: string[]; cidade: string; uf: string };
}

export interface ProspectStage { id: string; nome: string; cor?: string }
export interface ProspectHistory { t: number; tipo: string; txt: string; status?: string }
export interface ProspectDetail extends Prospect {
  nao_contatar?: boolean;
  instagram?: string; facebook?: string; linkedin?: string; bairro?: string; cep?: string;
  tel_tipo?: string; status?: string; nicho?: string; obs?: string; retorno?: number | null;
  criado_em?: number; atualizado_em?: number; ultimo_contato?: number | null;
  historico?: ProspectHistory[];
}
