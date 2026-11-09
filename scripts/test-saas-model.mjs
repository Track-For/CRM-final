import test from 'node:test'
import assert from 'node:assert/strict'
import {slugFromHost,workspaceSlug,schemaForWorkspace} from '../lib/saas/host.ts'
import {setupSchema,workspaceSetupPlan} from '../lib/saas/setup-model.ts'

test('endereço identifica somente um subdomínio do domínio da plataforma',()=>{
 assert.equal(slugFromHost('clinica.example.com:443','example.com'),'clinica')
 assert.equal(slugFromHost('example.com','example.com'),null)
 assert.equal(slugFromHost('www.example.com','example.com'),null)
 for(const host of ['clinica.example.com.evil.org','a.b.example.com','api.example.com','example.net'])assert.throws(()=>slugFromHost(host,'example.com'))
 for(const slug of ['../public','public;drop schema','ab','-empresa','empresa-','admin'])assert.throws(()=>workspaceSlug(slug))
 assert.throws(()=>schemaForWorkspace('public'))
})
const company={name:'Original',pixKey:'preservar',address:{city:'Salvador'},email:'owner@example.invalid'}
const input={name:'Clínica Exemplo',segment:'Saúde',description:'Fisioterapia',brandName:'Minha marca',brandColor:'#224466',logo:'',services:[{id:'service-one',name:'Consulta',description:'Atendimento',basePrice:120,monthlyFee:0}]}
test('configuração usa serviços próprios, preserva dados fiscais e inativa serviços removidos',()=>{
 const original={id:'old',name:'Antigo',projectType:'outros',active:true,basePrice:10}
 const result=workspaceSetupPlan(input,company,[original],'2026-11-09T18:00:00Z')
 assert.equal(result.company.pixKey,'preservar')
 assert.equal(result.company.address.city,'Salvador')
 assert.equal(result.company.businessProfile.brandName,'Minha marca')
 assert.equal(result.catalog[0].name,'Consulta')
 assert.equal(result.catalog[0].includedPages,0)
 assert.equal(result.catalog[1].active,false)
 assert.equal(original.active,true)
})
test('configuração rejeita ausência de serviços, valores inválidos e logo com conteúdo ativo',()=>{
 for(const patch of [{services:[]},{brandColor:'red'},{logo:'data:image/svg+xml;base64,PHN2Zz4='},{services:[{...input.services[0],basePrice:-1}]},{services:[input.services[0],input.services[0]]}])assert.equal(setupSchema.safeParse({...input,...patch}).success,false)
})
