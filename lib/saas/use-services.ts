"use client"
import { useCallback } from "react"
import { useCatalog, useCompany } from "@/lib/data"
import { PROJECT_TYPE_LABEL } from "@/lib/constants"
import type { ProjectType } from "@/types"
export function useBusinessServices() {
  const catalog = useCatalog()
  const company = useCompany()
  return { generic: Boolean(company.businessProfile), catalog, options: [{value:'',label:'Serviço a definir'},...catalog.filter(item=>item.active).map(item=>({value:item.id,label:item.name}))] }
}
export function useServiceLabel() {
  const {generic,catalog}=useBusinessServices()
  return useCallback((item: {serviceId?:string;projectType:ProjectType}) => catalog.find(service=>service.id===item.serviceId)?.name || (generic?'Serviço a definir':PROJECT_TYPE_LABEL[item.projectType]), [catalog, generic])
}
