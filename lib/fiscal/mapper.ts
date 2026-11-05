// Somente servidor: converte entre as linhas do banco e o formato da API Brasil NFe.
import type { FiscalSettings, InvoiceRow } from "@/lib/db/schema";
import type {
  BrasilNfeCancelResponse,
  BrasilNfeEmitBody,
  BrasilNfeLoteResponse,
  BrasilNfeNota,
} from "./brasilnfe";

export type InvoicePatch = Partial<Omit<InvoiceRow, "id" | "createdAt" | "createdBy">>;

const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const emptyToUndefined = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t ? t : undefined;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const toNumber = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Data de hoje (yyyy-MM-dd) no fuso de Brasília. */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Monta o corpo de `EnviarNotaFiscalServico` para uma única nota. */
export function buildEmitBody(
  invoice: InvoiceRow,
  settings: FiscalSettings,
  lote: number,
): BrasilNfeEmitBody {
  const t = invoice.tomador;
  const amount = round2(toNumber(invoice.amount));
  const r = invoice.retentions ?? {};
  const ir = toNumber(r.ir);
  const aliquotaIr = amount > 0 && ir > 0 ? round2((ir / amount) * 100) : 0;
  const environment = invoice.environment ?? settings.environment;

  return {
    TipoAmbiente: environment === "producao" ? 1 : 2,
    Lote: lote,
    nFSInfo: [
      {
        SerieRps: invoice.rpsSeries ?? settings.rpsSeries ?? "A",
        NumeroRps: invoice.rpsNumber ?? 0,
        IdentificadorInterno: invoice.id,
        EnviarEmail: Boolean(settings.sendEmailToClient) && Boolean(emptyToUndefined(t.email)),
        DataCompetencia: invoice.competenceDate,
        DataEmissao: todayInBrazil(),
        Tomador: {
          CpfCnpj: onlyDigits(t.document),
          NmTomador: t.name.trim(),
          Im: emptyToUndefined(onlyDigits(t.municipalRegistration)),
          Endereco: {
            Cep: onlyDigits(t.address.cep),
            Logradouro: t.address.street.trim(),
            Complemento: emptyToUndefined(t.address.complement),
            Numero: emptyToUndefined(t.address.number) ?? "S/N",
            Bairro: t.address.district.trim(),
            CodMunicipio: onlyDigits(t.address.ibgeCode),
            Municipio: t.address.city.trim(),
            Uf: t.address.uf.trim().toUpperCase(),
            CodPais: 1058,
            Pais: "Brasil",
          },
          Contato: {
            Telefone: emptyToUndefined(onlyDigits(t.phone)),
            Email: emptyToUndefined(t.email),
          },
        },
        Servico: {
          Descricao: invoice.serviceDescription.trim(),
          ItemListaServico: onlyDigits(invoice.serviceItem),
          CodTributacaoMunicipio: emptyToUndefined(invoice.municipalTaxCode),
          CodNBS: emptyToUndefined(onlyDigits(invoice.nbs)),
          CodigoCnae: emptyToUndefined(onlyDigits(invoice.cnae)),
          IssRetido: invoice.issRetained,
          ExigibilidadeISS: 1,
          CodMunicipioIncidencia: settings.municipalityCode,
          CodMunicipioPrestacao: settings.municipalityCode,
          Valores: {
            ValorServico: amount,
            ValorInss: round2(toNumber(r.inss)),
            Aliquota: round2(toNumber(invoice.issRate)),
            DescontoCondicionado: 0,
            DescontoIncondicionado: 0,
            OutrasRetencoes: 0,
            ValorDeducoes: 0,
            AliquotaIr: aliquotaIr,
          },
          ConfiguracaoImposto: {
            IncidePis: toNumber(r.pis) > 0,
            IncideCofins: toNumber(r.cofins) > 0,
            IncideCsll: toNumber(r.csll) > 0,
            IncideIr: ir > 0,
          },
        },
      },
    ],
  };
}

/** Escolhe a nota da resposta que corresponde à fatura. */
function findNota(resp: BrasilNfeLoteResponse, invoice: InvoiceRow): BrasilNfeNota | undefined {
  const notas = resp.Notas ?? [];
  return (
    notas.find((n) => n.IdentificadorInterno && n.IdentificadorInterno === invoice.id) ??
    notas.find(
      (n) =>
        invoice.rpsNumber != null &&
        n.NumeroRPS != null &&
        Number(n.NumeroRPS) === invoice.rpsNumber,
    ) ??
    (notas.length === 1 ? notas[0] : undefined)
  );
}

/** Aceita ISO, "yyyy-MM-dd HH:mm:ss" e "dd/MM/yyyy[ HH:mm:ss]". */
export function parseApiDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const s = v.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (br) {
    const [, d, m, y, hh = "12", mm = "00", ss = "00"] = br;
    const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}-03:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // Sem fuso explícito, assume horário de Brasília.
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const iso = s.replace(" ", "T");
  const date = new Date(hasZone || !iso.includes("T") ? iso : `${iso}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const nonEmpty = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Converte a resposta de EnviarNotaFiscalServico/BuscarNotaFiscalServico em um patch
 * para a linha da nota. Não altera `invoice`.
 */
export function applyLoteResponse(resp: BrasilNfeLoteResponse, invoice: InvoiceRow): InvoicePatch {
  const patch: InvoicePatch = { updatedAt: new Date() };

  if (resp.Lote != null) patch.lote = Number(resp.Lote);
  if (nonEmpty(resp.CodLote)) patch.codLote = nonEmpty(resp.CodLote);
  if (nonEmpty(resp.Protocolo)) patch.protocolo = nonEmpty(resp.Protocolo);
  const avisos = (resp.Avisos ?? []).filter((a) => typeof a === "string" && a.trim());
  if (avisos.length) patch.warnings = avisos;

  const nota = findNota(resp, invoice);
  const numero = nota?.NumeroNFSe != null ? String(nota.NumeroNFSe).trim() : "";
  const notaErro = nonEmpty(nota?.Erro);
  const loteErro = nonEmpty(resp.Error);

  if (nota && numero && numero !== "0") {
    patch.number = numero;
    patch.verificationCode = nonEmpty(nota.CodVerificacao) ?? invoice.verificationCode;
    patch.accessKey = nonEmpty(nota.Chave) ?? invoice.accessKey;
    patch.pdfBase64 = nonEmpty(nota.Base64Doc) ?? nonEmpty(nota.Base64File) ?? invoice.pdfBase64;
    patch.xmlBase64 = nonEmpty(nota.Base64Xml) ?? invoice.xmlBase64;
    if (nota.Valores) patch.values = nota.Valores;
    patch.issuedAt = parseApiDate(nota.DtEmissao) ?? invoice.issuedAt ?? new Date();
    patch.errorMessage = null;
    if (nota.Cancelada) {
      patch.status = "cancelada";
      patch.canceledAt = invoice.canceledAt ?? new Date();
    } else {
      // Enquanto o cancelamento não for confirmado, a nota segue "cancelando".
      patch.status = invoice.status === "cancelando" ? "cancelando" : "emitida";
    }
    return patch;
  }

  const statusLote = resp.StatusLote != null ? Number(resp.StatusLote) : null;

  if (statusLote === 3 || statusLote === 4 || notaErro) {
    patch.status = "rejeitada";
    patch.errorMessage =
      notaErro ??
      loteErro ??
      (statusLote === 4
        ? "Erro ao analisar o lote no Brasil NFe."
        : "Erro ao processar o lote no Brasil NFe.");
    return patch;
  }

  if (statusLote === 2 || statusLote === 1) {
    // 1 sem número da NFS-e: a prefeitura ainda não devolveu a nota; continua consultando.
    patch.status = "processando";
    patch.errorMessage = null;
    return patch;
  }

  if (loteErro) {
    patch.status = "rejeitada";
    patch.errorMessage = loteErro;
    return patch;
  }

  patch.status = "processando";
  return patch;
}

/**
 * Extra (fora do contrato): converte a resposta de CancelarNotaFiscal em patch.
 * Status 1 → 'cancelada'; 2 → 'cancelando'; 3/erro → mantém 'emitida' com errorMessage.
 */
export function applyCancelResponse(
  resp: BrasilNfeCancelResponse,
  invoice: InvoiceRow,
): InvoicePatch {
  const patch: InvoicePatch = { updatedAt: new Date() };
  const avisos = (resp.Avisos ?? []).filter((a) => typeof a === "string" && a.trim());
  if (avisos.length) patch.warnings = avisos;
  const status = resp.Status != null ? Number(resp.Status) : null;
  const erro = nonEmpty(resp.Error) ?? nonEmpty(resp.DsMotivo);

  if (status === 1) {
    patch.status = "cancelada";
    patch.canceledAt = new Date();
    patch.errorMessage = null;
    // Base64Xml/Base64File do cancelamento são o evento, não a nota: não sobrescreve.
  } else if (status === 2) {
    patch.status = "cancelando";
    patch.errorMessage = null;
  } else {
    patch.status = invoice.status === "cancelando" ? "cancelando" : "emitida";
    patch.errorMessage = erro ?? "O Brasil NFe não confirmou o cancelamento.";
  }
  return patch;
}
