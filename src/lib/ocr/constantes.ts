// Parámetros del negocio. Las tarifas se verifican con un contador antes de usarlas con datos reales.
export const PORCENTAJE_IVA = 19;
export const PORCENTAJE_IMPOCONSUMO = 4; // se liquida sobre el valor sin IVA
export const TOLERANCIA_IMPUESTO = 1; // pesos de diferencia admitidos por redondeo
export const MINIMO_LETRAS_RAZON_SOCIAL = 6;
// Por encima de esto, que el subtotal sea múltiplo del precio ya no prueba que la cantidad sea esa.
export const CANTIDAD_MAXIMA_REPARABLE = 1000;
export const PRECIO_MINIMO_ITEM = 100; // evita leer direcciones como ítems (Cra 115 $48 $7)
