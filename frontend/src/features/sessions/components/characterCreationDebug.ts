export function shouldShowCharacterCreationDebug(params: { isAdmin: boolean; isDevelopment: boolean }): boolean {
  return params.isAdmin && params.isDevelopment;
}
