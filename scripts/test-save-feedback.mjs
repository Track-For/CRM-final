import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { mkdir } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import path from "node:path"
const dir = path.resolve("node_modules/.cache/save-feedback-tests")
await mkdir(dir,{recursive:true})
const outfile = path.join(dir,"feedback.mjs")
const fixtures = {
  "sonner": 'export const toast=Object.assign(()=>"toast",{success:(...args)=>globalThis.__saveFixture.success.push(args),error:(...args)=>globalThis.__saveFixture.errors.push(args)})',
  "@/lib/auth/user-actions": 'export async function getCrmIdentity(){return {current:{id:"actor",role:"admin"},users:[]}}',
  "@/lib/data/records-actions": 'export const saveRecord=(...args)=>globalThis.__saveFixture.save(...args);export const deleteRecord=(...args)=>globalThis.__saveFixture.save(...args);export async function loadRecordOverlay(){throw Error("recovery unavailable in fixture")}',
  "@/lib/google-calendar/actions": 'export async function getGoogleCalendarState(){return null}',
  "@/lib/integrations/actions": 'export async function testWebhookAction(){}',
  "@/lib/whatsapp/actions": 'export async function sendWhatsappText(){}',
}
await build({stdin:{contents:'export {toast} from "./lib/store/save-feedback";export {useCrmStore} from "./lib/store/crm-store";export {useUiStore} from "./lib/store/ui-store";export {flushPendingWrites} from "./lib/data/api"',resolveDir:process.cwd()},outfile,bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent",plugins:[{name:"fixtures",setup(p){p.onResolve({filter:/.*/},a=>a.path in fixtures?{path:a.path,namespace:"fixture"}:undefined);p.onLoad({filter:/.*/,namespace:"fixture"},a=>({contents:fixtures[a.path],loader:"js"}))}}]})
const {toast,useCrmStore:store,useUiStore:ui,flushPendingWrites}=await import(pathToFileURL(outfile).href)
const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
test("sucesso espera o servidor; falhas de criar, editar e excluir revertem o estado",async()=>{
  globalThis.__saveFixture={success:[],errors:[],save:null}
  ui.getState().setRole("admin")
  let release
  __saveFixture.save=()=>new Promise(resolve=>{release=resolve})
  store.getState().add("tasks",{id:"task",title:"Original"})
  toast.success("Criada")
  assert.equal(__saveFixture.success.length,0)
  await tick();release();await flushPendingWrites();await tick()
  assert.equal(__saveFixture.success.length,1)
  __saveFixture.save=async()=>{throw Error("Falha simulada")}
  store.getState().update("tasks","task",{title:"Não salva"})
  toast.success("Atualizada")
  await flushPendingWrites().catch(()=>{});await tick()
  assert.equal(store.getState().tasks.find(t=>t.id==="task").title,"Original")
  assert.equal(__saveFixture.success.length,1)
  assert(__saveFixture.errors.length>0)
  store.getState().add("tasks",{id:"failed",title:"Falha"})
  await flushPendingWrites().catch(()=>{});await tick()
  assert(!store.getState().tasks.some(t=>t.id==="failed"))
  store.getState().remove("tasks","task")
  await flushPendingWrites().catch(()=>{});await tick()
  assert(store.getState().tasks.some(t=>t.id==="task"))
  const previous=store.getState().pricingRules
  store.getState().setSingleton("pricingRules",{...previous,maxInstallments:6})
  await flushPendingWrites().catch(()=>{});await tick()
  assert.deepEqual(store.getState().pricingRules,previous)
  delete globalThis.__saveFixture
})
