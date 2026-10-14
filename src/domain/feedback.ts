/** Explain common persistence failures without discarding the user's draft. */
export function saveErrorMessage(error: unknown, fallback = 'No se pudo guardar. Tus cambios siguen en el formulario.'): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : '';
  if (code.includes('permission-denied') || /Missing or insufficient permissions/i.test(message)) {
    return 'No tienes permiso para guardar este cambio. Tus valores siguen en el formulario; revisa el acceso antes de volver a intentarlo.';
  }
  if (/unavailable|network|deadline-exceeded/.test(code)) {
    return 'No se pudo conectar para guardar. Tus valores siguen en el formulario; comprueba la conexión y vuelve a intentarlo.';
  }
  return message || fallback;
}
