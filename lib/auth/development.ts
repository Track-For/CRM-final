/** Pausa reversível do login, restrita ao servidor de desenvolvimento. */
export const DEVELOPMENT_USER_ID = "crm_local_development"

export function isLoginPaused(): boolean {
  return process.env.NODE_ENV === "development" && process.env.LOCAL_LOGIN_PAUSED === "true"
}
