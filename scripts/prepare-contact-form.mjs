import { config } from "dotenv"
import postgres from "postgres"

config({ path: ".env.local", quiet: true })
if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL.")
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  await sql.begin(async tx => {
    await tx`select pg_advisory_xact_lock(718293461)`
    const existing = await tx`select id from crm_records where resource='forms' limit 1`
    if (existing.length) {
      console.log("Já existem formulários nesta base. Nenhum formulário foi criado ou alterado; revise-os em /formularios.")
      return
    }
    const form = {
      id: "form_initial_contact", name: "Contato comercial", slug: "contato", active: true,
      title: "Conte sobre seu projeto", description: "Preencha seus dados para nossa equipe entrar em contato.",
      fields: [
        { id: "contact_name", key: "name", label: "Nome", type: "text", required: true },
        { id: "contact_phone", key: "whatsapp", label: "WhatsApp", type: "tel", required: true },
        { id: "contact_email", key: "email", label: "E-mail", type: "email", required: false },
        { id: "contact_message", key: "message", label: "Como podemos ajudar?", type: "textarea", required: false },
      ],
      submitLabel: "Enviar contato", successTitle: "Recebemos seu contato",
      successMessage: "Nossa equipe entrará em contato pelo número informado.", ctaLabel: "",
      whatsappNumber: "", defaultSource: "site", submissions: 0, createdAt: new Date().toISOString(),
    }
    await tx`insert into crm_records(resource,id,data,created,deleted) values('forms',${form.id},${tx.json(form)},true,false)`
    console.log("Formulário inicial criado em /f/contato. Edite os textos em /formularios; nenhum lead ou mensagem foi enviado.")
  })
} finally { await sql.end() }
