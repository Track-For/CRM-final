export interface Prospect {
  id: string; nome: string; telefone: string; whatsapp: string; email: string;
  site: string; categoria: string; cidade: string; uf: string; endereco: string;
  nota: string | number; avaliacoes: string | number; maps: string; buscas: string[];
}
export interface ProspectSearch {
  id: string; estado: string; etapa: string; total: number; avisos: string[];
  criado_em: number; parametros: { nichos: string[]; cidade: string; uf: string };
}
