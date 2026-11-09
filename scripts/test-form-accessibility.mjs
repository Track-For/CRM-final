import test from "node:test"
import assert from "node:assert/strict"
import {build} from "esbuild"
import {mkdir} from "node:fs/promises"
import {pathToFileURL} from "node:url"
import path from "node:path"
const dir=path.resolve("node_modules/.cache/form-accessibility-tests")
await mkdir(dir,{recursive:true})
const outfile=path.join(dir,"render.mjs")
await build({stdin:{contents:`import {createElement as h} from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {Controller,useForm} from 'react-hook-form';import {FormField} from './components/shared/form-field';import {Input} from './components/ui/input';import {MaskedInput} from './components/shared/money-input';import {OptionSelect} from './components/shared/option-select';
function Form(){const {control}=useForm({defaultValues:{phone:''}});return h('form',null,h(FormField,{label:'Nome',required:true,hint:'Como prefere ser chamado'},h(Input,{name:'name'})),h(FormField,{label:'WhatsApp',required:true,error:'Informe um telefone válido'},h(Controller,{control,name:'phone',render:({field})=>h(MaskedInput,{mask:v=>v,value:field.value,onChange:field.onChange})})),h(FormField,{label:'Origem'},h(OptionSelect,{value:'whatsapp',onChange:()=>{},options:[{value:'whatsapp',label:'WhatsApp'}]})))}export const markup=()=>renderToStaticMarkup(h(Form));`,resolveDir:process.cwd()},outfile,bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent",jsx:"automatic"})
const {markup}=await import(pathToFileURL(outfile).href)
test("rótulos, obrigatoriedade, dicas e erros alcançam os controles reais, inclusive máscaras em Controller",()=>{
 const html=markup()
 const labels=[...html.matchAll(/<label[^>]*id="([^"]+)"[^>]*for="([^"]+)"[^>]*>(.*?)<\/label>/g)]
 assert.equal(labels.length,3)
 for(const [,labelId,id] of labels){assert.ok(html.includes(`id="${id}"`));assert.ok(html.includes(`aria-labelledby="${labelId}"`))}
 const inputs=[...html.matchAll(/<input[^>]*>/g)].map(match=>match[0])
 assert.equal(inputs.length,2)
 assert.ok(inputs.every(input=>input.includes('aria-required="true"')))
 const invalid=inputs.find(input=>input.includes('aria-invalid="true"'))
 assert.ok(invalid,'o campo mascarado recebe o erro do formulário')
 const description=invalid.match(/aria-describedby="([^"]+)"/)[1]
 assert.ok(html.includes(`id="${description}" role="alert"`))
 assert.ok(html.includes('role="combobox"'))
})
