import type { API_SCOPES } from "./api-contract"

export const API_PERMISSIONS: Record<(typeof API_SCOPES)[number], { label: string; description: string }> = {
  "leads:read": { label: "Consultar leads", description: "Ver os leads, seus contatos, origem, situação e responsável." },
  "leads:write": { label: "Criar e editar leads", description: "Cadastrar leads e atualizar seus campos. Leads já convertidos devem ser editados pelo CRM." },
  "deals:read": { label: "Consultar negócios", description: "Ver negócios, valores, etapas, responsáveis e datas previstas de fechamento." },
  "deals:write": { label: "Criar e editar negócios", description: "Criar negócios em Novo lead e editar título, responsável, fechamento previsto e próxima ação. Não permite alterar etapas, marcar como ganho ou perdido, nem editar valores de negócios existentes." },
  "tasks:read": { label: "Consultar tarefas", description: "Ver tarefas, descrições, prazos, prioridades, situação e responsáveis." },
  "tasks:write": { label: "Criar e editar tarefas avulsas", description: "Criar tarefas e editar título, descrição, prazo, prioridade, responsável e situação. Tarefas vinculadas a projetos devem ser editadas pelo CRM." },
  "clients:read": { label: "Consultar clientes", description: "Ver os cadastros de clientes, incluindo contatos, documentos e endereços." },
  "clients:write": { label: "Criar clientes", description: "Cadastrar novos clientes. Atualmente não permite editar clientes existentes pela API." },
  "projects:read": { label: "Consultar projetos", description: "Ver os projetos, clientes vinculados, situação, valores e datas de início e entrega." },
  "quotes:read": { label: "Consultar orçamentos", description: "Ver os orçamentos, valores totais, situação, validade e vínculos com leads, clientes e negócios." },
  "charges:read": { label: "Consultar cobranças", description: "Ver cobranças, valores, vencimentos, forma de pagamento e pagamentos registrados. Não permite emitir cobranças ou registrar baixas." },
  "subscriptions:read": { label: "Consultar mensalidades", description: "Ver mensalidades, valores, situação, início e data da próxima cobrança." },
  "pipelines:read": { label: "Consultar funis de vendas", description: "Ver os funis, suas etapas e as probabilidades de fechamento configuradas." },
  "reports:read": { label: "Consultar previsão de vendas", description: "Consultar a previsão comercial pela API. Atualmente não libera os relatórios personalizados salvos no CRM." },
}
