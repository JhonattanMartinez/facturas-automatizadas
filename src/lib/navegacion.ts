// Al cambiar de sesión se hace una carga completa a propósito, y no una navegación
// de Next: con cacheComponents la pantalla anterior queda montada y oculta, así que
// la contraseña escrita en /login seguiría en memoria después de entrar.
export function cargarPagina(ruta: string): void {
  window.location.assign(ruta);
}
