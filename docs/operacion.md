# Operación en Vercel (Fase D)

Corrida final en producción: https://facturas-automatizadas-five.vercel.app, noviembre de 2026.

Diferencia con la guía: las imágenes y los Excel se guardan en **Supabase Storage**, no en Vercel Blob. Vercel sigue ejecutando la aplicación y el OCR.

## Lista de aceptación

| Punto | Resultado |
|---|---|
| Procesar las 1000 facturas en producción | Cumplido: 877 aceptadas, 123 a revisión, 0 errores (suman 1000) |
| Cada lote con su Excel | Cumplido: 10 de 10, y la suma de la columna Total coincide con Firestore |
| Reprocesar la carpeta sin duplicar | Cumplido: 1000 duplicadas, siguen 1000 facturas, los clientes no cambiaron |
| 850 clientes tras la revisión manual | **No cumplido: 841 de 850.** Quedó la revisión a medias |
| Sin errores en los logs de Vercel | Revisado tras la corrida de las 1000: sin errores 504, 413, 500 ni de cuota |
| Rutas protegidas | Cumplido: 18 de 18 responden 401 sin sesión |
| Reglas de Firestore cerradas | Cumplido: 9 de 9 accesos anónimos reciben 403 |
| Sin secretos en Git | Cumplido: ningún valor de `.env` en todo el historial |

## Lo que quedó pendiente

- **Revisión manual:** 20 facturas corregidas a mano y 103 aún en revisión.
- **Clientes:** 22 facturas siguen sin un documento de cliente válido. Once son facturas que se confirmaron con el dígito de verificación equivocado; las demás siguen en revisión, y en su mayoría son imágenes giradas.
- **Excel:** el Excel es una foto del momento en que terminó el lote. Varios lotes tienen correcciones que aún no aparecen: se actualizan con «Regenerar el Excel con las correcciones a mano» en el detalle del lote.

## Mediciones

| Medida | Valor |
|---|---|
| Procesar 1000 facturas, incluida la subida | 32,9 min |
| Reprocesar la misma carpeta | 5,7 min |
| Facturas aceptadas por la máquina | 87,7 % |
| Almacén al terminar (imágenes de ambas corridas y Excel) | 2021 archivos, 217 MB |

«Aceptada» significa que pasó todas las validaciones, no que se haya comparado con una respuesta conocida: no se dispuso del archivo de respuestas correctas.

## Cuota

No se midió el consumo real de Firestore. La estimación de la guía es de unas 5 lecturas y 6 escrituras por factura procesada, es decir, cerca de 5000 lecturas y 6000 escrituras por cada 1000 facturas. Reprocesar evita duplicar datos, pero vuelve a gastar lecturas y escrituras. El consumo real se consulta en las consolas de Firebase, Supabase y Vercel.

## Política de archivos

Las imágenes y los Excel de los lotes no se borran solos. Entre prácticas se limpian con «Borrar todo», en la página de Métricas. Es irreversible y borra los datos de todos los usuarios.

## Acceso de otra persona

No hay página de registro. Para dar acceso: crear la cuenta en Firebase Authentication, añadir su correo a `USUARIOS_PERMITIDOS` en Vercel y hacer Redeploy. Cada usuario solo ve sus propios lotes.
