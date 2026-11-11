// Dígito de verificación del NIT (algoritmo de la DIAN). Detecta cerca del 98 %
// de los errores de un dígito, no todos: no es una garantía de que el número sea correcto.
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function digitoVerificacion(numero: string): string {
  const digitos = [...numero].reverse();
  const suma = digitos.reduce(
    (total, digito, i) => total + Number(digito) * PESOS[i],
    0,
  );
  const residuo = suma % 11;
  return String(residuo > 1 ? 11 - residuo : residuo);
}

export function dvValido(
  numero: string | null,
  dv: string | null,
): boolean {
  if (!numero || !dv) return false;
  return digitoVerificacion(numero) === dv;
}
