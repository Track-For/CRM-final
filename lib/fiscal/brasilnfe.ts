// Somente servidor: cliente HTTP da API Brasil NFe (NFS-e).
// O token nunca é logado nem incluído em mensagens de erro.

export const BRASIL_NFE_BASE_URL = "https://api.brasilnfe.com.br/services/fiscal";
const TIMEOUT_MS = 30_000;

/** 1 = produção, 2 = homologação. */
export type TipoAmbiente = 1 | 2;

export type BrasilNfeEndereco = {
  Cep: string;
  Logradouro: string;
  Complemento?: string;
  Numero: string;
  Bairro: string;
  CodMunicipio: string;
  Municipio: string;
  Uf: string;
  CodPais: number;
  Pais: string;
};

export type BrasilNfeTomador = {
  CpfCnpj: string;
  NmTomador: string;
  Im?: string;
  Endereco: BrasilNfeEndereco;
  Contato: { Telefone?: string; Email?: string };
};

export type BrasilNfeServico = {
  Descricao: string;
  InformacoesComplementares?: string;
  ItemListaServico: string;
  CodTributacaoMunicipio?: string;
  CodNBS?: string;
  CodigoCnae?: string;
  IssRetido: boolean;
  ExigibilidadeISS: number;
  CodMunicipioIncidencia: string;
  CodMunicipioPrestacao: string;
  Valores: {
    ValorServico: number;
    ValorInss: number;
    Aliquota: number;
    DescontoCondicionado: number;
    DescontoIncondicionado: number;
    OutrasRetencoes: number;
    ValorDeducoes: number;
    AliquotaIr: number;
  };
  ConfiguracaoImposto: {
    IncidePis: boolean;
    IncideCofins: boolean;
    IncideCsll: boolean;
    IncideIr: boolean;
  };
};

export type BrasilNfeNfsInfo = {
  SerieRps: string;
  NumeroRps: number;
  IdentificadorInterno: string;
  EnviarEmail: boolean;
  DataCompetencia: string;
  DataEmissao: string;
  Tomador: BrasilNfeTomador;
  Servico: BrasilNfeServico;
};

export type BrasilNfeEmitBody = {
  TipoAmbiente: TipoAmbiente;
  Lote: number;
  nFSInfo: BrasilNfeNfsInfo[];
};

export type BrasilNfeValores = {
  BaseCalculo?: number;
  ValorLiquido?: number;
  ValorISS?: number;
  ValorISSRetido?: number;
  ValorPIS?: number;
  ValorCOFINS?: number;
  ValorCSLL?: number;
  ValorIR?: number;
  ValorInss?: number;
  Aliquota?: number;
};

export type BrasilNfeNota = {
  Cancelada?: boolean | null;
  NumeroRPS?: number | string | null;
  NumeroNFSe?: string | number | null;
  Chave?: string | null;
  CodVerificacao?: string | null;
  IdentificadorInterno?: string | null;
  Status?: number | string | null;
  Erro?: string | null;
  Base64Xml?: string | null;
  /** PDF da nota. */
  Base64Doc?: string | null;
  /** Nome usado na FAQ para o PDF. */
  Base64File?: string | null;
  DtEmissao?: string | null;
  Valores?: BrasilNfeValores | null;
};

/** StatusLote: 1 processado, 2 aguardando, 3 erro ao processar, 4 erro ao analisar. */
export type BrasilNfeLoteResponse = {
  Lote?: number | null;
  CodLote?: string | null;
  Protocolo?: string | null;
  StatusLote?: number | null;
  Error?: string | null;
  Avisos?: string[] | null;
  Notas?: BrasilNfeNota[] | null;
};

export type BrasilNfeBuscarBody = { codLote: string; Rps: number[] };

export type BrasilNfeCancelBody = {
  TipoAmbiente: TipoAmbiente;
  TipoDocumento: 1;
  NumeroNFSe: string;
  /** 1 erro na emissão, 2 serviço não prestado, 3 duplicidade, 9 outros. */
  CodCancelamentoNFSe: 1 | 2 | 3 | 9;
  Justificativa: string;
};

/** Status: 1 processado, 2 aguardando, 3 erro. */
export type BrasilNfeCancelResponse = {
  Status?: number | null;
  DsMotivo?: string | null;
  NuProtocolo?: string | null;
  Error?: string | null;
  Avisos?: string[] | null;
  Base64Xml?: string | null;
  Base64File?: string | null;
};

/** Erro com mensagem amigável em pt-BR, segura para mostrar ao usuário. */
export class BrasilNfeError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "BrasilNfeError";
    this.status = status;
  }
}

function httpMessage(status: number, detail: string | null): string {
  let base: string;
  if (status === 401 || status === 403) {
    base = "Token do Brasil NFe inválido ou sem permissão.";
  } else if (status === 404) {
    base = "Serviço do Brasil NFe não encontrado.";
  } else if (status === 429) {
    base = "Muitas requisições ao Brasil NFe. Tente novamente em instantes.";
  } else if (status >= 500) {
    base = "O Brasil NFe está indisponível no momento. Tente novamente mais tarde.";
  } else {
    base = `O Brasil NFe recusou a requisição (HTTP ${status}).`;
  }
  return detail ? `${base} ${detail}` : base;
}

function extractDetail(text: string): string | null {
  if (!text) return null;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const msg = json.Error ?? json.Message ?? json.message ?? json.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 500);
  } catch {
    // corpo não-JSON
  }
  return null;
}

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  if (!token) throw new BrasilNfeError("Token do Brasil NFe não configurado.");

  let res: Response;
  try {
    res = await fetch(`${BRASIL_NFE_BASE_URL}/${path}`, {
      method: "POST",
      headers: {
        Token: token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new BrasilNfeError("O Brasil NFe não respondeu em 30 segundos. Tente novamente.");
    }
    throw new BrasilNfeError(
      "Não foi possível conectar ao Brasil NFe. Verifique a conexão e tente novamente.",
    );
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new BrasilNfeError(httpMessage(res.status, extractDetail(text)), res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new BrasilNfeError("Resposta inválida do Brasil NFe.", res.status);
  }
}

export function emitirNfse(
  token: string,
  body: BrasilNfeEmitBody,
): Promise<BrasilNfeLoteResponse> {
  return post<BrasilNfeLoteResponse>("EnviarNotaFiscalServico", token, body);
}

export function buscarLote(
  token: string,
  body: BrasilNfeBuscarBody,
): Promise<BrasilNfeLoteResponse> {
  return post<BrasilNfeLoteResponse>("BuscarNotaFiscalServico", token, body);
}

export function cancelarNfse(
  token: string,
  body: BrasilNfeCancelBody,
): Promise<BrasilNfeCancelResponse> {
  return post<BrasilNfeCancelResponse>("CancelarNotaFiscal", token, body);
}
