import { z } from "zod"
import { API_RESOURCES, createSchemas, patchSchemas } from "@/lib/integrations/api-contract"

export async function GET() {
  const paths: Record<string, unknown> = {}
  const responses = { "200": { description: "Consulta ou edição concluída" }, "400": { description: "Dados inválidos" }, "401": { description: "Chave inválida" }, "403": { description: "Escopo insuficiente" }, "404": { description: "Registro não encontrado" }, "409": { description: "Conflito de idempotência ou operação protegida" }, "413": { description: "Corpo maior que 20 KB" }, "429": { description: "Limite de chamadas atingido" }, "500": { description: "Falha interna" } }
  const operation = (summary: string, scope: string) => ({ summary, description: `Escopo necessário: ${scope}.`, security: [{ bearerAuth: [] }], responses })
  for (const resource of API_RESOURCES) {
    const get = { ...operation(`Listar ${resource}`, `${resource}:read`), parameters: [
      { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      { name: "offset", in: "query", schema: { type: "integer", minimum: 0, maximum: 1000000, default: 0 } },
      ...["ownerId", "assigneeId", "status", "stage", "pipelineId", "source", "clientId", "leadId", "dealId"].map(name => ({ name, in: "query", schema: { type: "string", maxLength: 120 } })),
    ] }
    const create = createSchemas[resource as keyof typeof createSchemas]
    paths[`/${resource}`] = { get, ...(create ? { post: { ...operation(`Criar ${resource}`, `${resource}:write`), parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", maxLength: 120 }, description: "Reutilize a mesma chave e o mesmo corpo ao repetir uma criação." }], requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(create) } } }, responses: { ...responses, "201": { description: "Criado" } } } } : {}) }
    const patch = patchSchemas[resource as keyof typeof patchSchemas]
    paths[`/${resource}/{id}`] = { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", maxLength: 120 } }], get: operation(`Consultar ${resource} por ID`, `${resource}:read`), ...(patch ? { patch: { ...operation(`Editar ${resource}`, `${resource}:write`), requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(patch) } } } } } : {}) }
  }
  paths["/forecast"] = { get: { ...operation("Consultar previsão comercial em reais", "reports:read"), parameters: [{ name: "month", in: "query", schema: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" } }, ...["ownerId", "pipelineId"].map(name => ({ name, in: "query", schema: { type: "string" } }))] } }
  return Response.json({ openapi: "3.1.0", info: { title: "Nexo CRM API", version: "1.0.0", description: "Valores monetários em BRL. Datas ISO 8601. Autenticação por chave com escopos; limite de 120 chamadas por chave/minuto. Exclusões, transições de venda e operações financeiras são feitas pelo CRM." }, servers: [{ url: "/api/v1" }], components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Chave sk_live_ criada pelo administrador em Integrações → n8n." } } }, paths }, { headers: { "Cache-Control": "no-store" } })
}
