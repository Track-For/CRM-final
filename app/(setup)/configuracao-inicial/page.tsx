import { WorkspaceSetup } from "@/components/saas/workspace-setup"
import { loadWorkspaceSetup } from "@/lib/saas/setup-actions"
export default async function SetupPage() { return <WorkspaceSetup initial={await loadWorkspaceSetup()} /> }
