"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { validar } from "@/lib/ocr/validador";
import { aParcial, totalesPropuestos } from "@/lib/procesamiento/correccion";
import { esquemaCorreccion } from "@/lib/procesamiento/correccion-esquema";
import { formatoPesos } from "./formato";
import {
  CLASE_BOTON,
  CLASE_BOTON_PRINCIPAL,
  CLASE_CAMPO,
  CLASE_ENLACE,
  Tarjeta,
} from "./ui";

type ItemLeido = { descripcion: string; cantidad: number | null; precioUnitario: number };

type FacturaLeida = {
  archivo: string;
  numero: string | null;
  fecha: string | null;
  proveedor: string | null;
  nitProveedor: string | null;
  dvProveedor: string | null;
  clienteDocumento: string | null;
  clienteDv: string | null;
  clienteNombre: string | null;
  items: ItemLeido[];
  subtotal: number | null;
  iva: number | null;
  impoconsumo: number | null;
  total: number | null;
  estado: "aceptada" | "revision";
  motivos: string[];
  corregidaManualmente: boolean;
};

type FilaItem = { descripcion: string; cantidad: string; precioUnitario: string };

type Campos = {
  numero: string;
  fecha: string;
  proveedor: string;
  nitProveedor: string;
  dvProveedor: string;
  clienteDocumento: string;
  clienteDv: string;
  clienteNombre: string;
  items: FilaItem[];
  subtotal: string;
  iva: string;
  impoconsumo: string;
  total: string;
};

const FILA_VACIA: FilaItem = { descripcion: "", cantidad: "", precioUnitario: "" };
const texto = (valor: string | number | null) => (valor === null ? "" : String(valor));

// «$1.234.567» y «1234567» son lo mismo. Un campo vacío no es cero: es un dato que falta.
function aNumero(valor: string): number {
  const limpio = valor.replace(/[$.,\s]/g, "");
  return limpio === "" ? Number.NaN : Number(limpio);
}

function camposIniciales(f: FacturaLeida): Campos {
  const items =
    f.items.length > 0
      ? f.items.map((i) => ({
          descripcion: i.descripcion,
          cantidad: texto(i.cantidad),
          precioUnitario: texto(i.precioUnitario),
        }))
      : [FILA_VACIA]; // una factura con error del OCR no trae ítems
  return {
    numero: texto(f.numero),
    fecha: texto(f.fecha),
    proveedor: texto(f.proveedor),
    nitProveedor: texto(f.nitProveedor),
    dvProveedor: texto(f.dvProveedor),
    clienteDocumento: texto(f.clienteDocumento),
    clienteDv: texto(f.clienteDv),
    clienteNombre: texto(f.clienteNombre),
    items,
    subtotal: texto(f.subtotal),
    iva: texto(f.iva),
    impoconsumo: texto(f.impoconsumo),
    total: texto(f.total),
  };
}

function Campo({
  etiqueta,
  valor,
  alCambiar,
  ancho = "",
  tipo = "text",
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  ancho?: string;
  tipo?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho}`}>
      {etiqueta}
      <input
        type={tipo}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        className={`w-full ${CLASE_CAMPO}`}
      />
    </label>
  );
}

export function FormularioFactura({ hash }: { hash: string }) {
  const router = useRouter();
  const [factura, setFactura] = useState<FacturaLeida | null>(null);
  const [campos, setCampos] = useState<Campos | null>(null);
  const [noExiste, setNoExiste] = useState(false);
  const [giro, setGiro] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      const respuesta = await fetch(`/api/facturas/${hash}`);
      if (!vigente) return;
      if (!respuesta.ok) {
        setNoExiste(true);
        return;
      }
      const datos = (await respuesta.json()) as FacturaLeida;
      if (!vigente) return;
      setFactura(datos);
      setCampos(camposIniciales(datos));
    }
    void cargar();
    return () => {
      vigente = false;
    };
  }, [hash]);

  if (noExiste) return <p className="text-malo">✕ Esta factura no existe o no es tuya.</p>;
  if (!factura || !campos) return <p className="text-secundario">Cargando…</p>;

  const cambiar = (cambios: Partial<Campos>) => {
    setCampos({ ...campos, ...cambios });
    setConfirmado(false); // otros datos exigen volver a mirar la imagen
  };
  const cambiarItem = (indice: number, cambios: Partial<FilaItem>) =>
    cambiar({ items: campos.items.map((fila, i) => (i === indice ? { ...fila, ...cambios } : fila)) });

  const datos = {
    numero: campos.numero.trim(),
    fecha: campos.fecha,
    proveedor: campos.proveedor,
    nitProveedor: campos.nitProveedor.trim(),
    dvProveedor: campos.dvProveedor.trim(),
    clienteDocumento: campos.clienteDocumento.trim(),
    clienteDv: campos.clienteDv.trim(),
    clienteNombre: campos.clienteNombre,
    items: campos.items.map((fila) => ({
      descripcion: fila.descripcion,
      cantidad: aNumero(fila.cantidad),
      precioUnitario: aNumero(fila.precioUnitario),
    })),
    subtotal: aNumero(campos.subtotal),
    iva: aNumero(campos.iva),
    impoconsumo: campos.impoconsumo.trim() === "" ? null : aNumero(campos.impoconsumo),
    total: aNumero(campos.total),
    confirmarValidaciones: confirmado,
  };

  // Las mismas reglas que aplica el servidor, para avisar mientras se escribe.
  const formato = esquemaCorreccion.safeParse(datos);
  const erroresFormato = formato.success ? [] : [...new Set(formato.error.issues.map((i) => i.message))];
  const motivos = formato.success ? validar(aParcial(formato.data)) : [];
  const puedeGuardar =
    formato.success && (motivos.length === 0 || confirmado) && !guardando;

  function recalcular() {
    const filas = datos.items.map((item) => ({
      cantidad: Number.isFinite(item.cantidad) ? item.cantidad : 0,
      precioUnitario: Number.isFinite(item.precioUnitario) ? item.precioUnitario : 0,
    }));
    const propuesta = totalesPropuestos(filas, campos?.impoconsumo.trim() !== "");
    cambiar({
      subtotal: String(propuesta.subtotal),
      iva: String(propuesta.iva),
      impoconsumo: texto(propuesta.impoconsumo),
      total: String(propuesta.total),
    });
  }

  async function irALaSiguiente() {
    // Pide solo dos: la actual podría seguir en la lista y con eso basta para saltarla.
    const respuesta = await fetch("/api/facturas?cuantas=2");
    const datosLista = respuesta.ok
      ? ((await respuesta.json()) as { facturas: { hash: string }[] })
      : { facturas: [] };
    const siguiente = datosLista.facturas.find((f) => f.hash !== hash);
    router.push(siguiente ? `/revision/${siguiente.hash}` : "/revision");
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const respuesta = await fetch(`/api/facturas/${hash}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(datos),
      });
      if (respuesta.ok) {
        await irALaSiguiente();
        return;
      }
      const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
      setError(cuerpo?.error ?? `No se pudo guardar (error ${respuesta.status}).`);
      setGuardando(false);
    } catch {
      setError("No se pudo guardar: falla de red.");
      setGuardando(false);
    }
  }

  const girar = (grados: number) => setGiro((actual) => (actual + grados + 360) % 360);
  const rutaImagen = `/api/facturas/${hash}/imagen${giro ? `?rotar=${giro}` : ""}`;

  return (
    <div className="grid w-full max-w-7xl gap-4 lg:grid-cols-2">
      <Tarjeta titulo={factura.archivo}>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-label="Girar a la izquierda" onClick={() => girar(-90)} className={CLASE_BOTON}>
            ↺
          </button>
          <button type="button" aria-label="Girar a la derecha" onClick={() => girar(90)} className={CLASE_BOTON}>
            ↻
          </button>
          <button type="button" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className={CLASE_BOTON}>
            −
          </button>
          <button type="button" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className={CLASE_BOTON}>
            +
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-lg border border-borde bg-superficie-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- la imagen sale de una ruta privada con sesión; next/image la pediría sin cookie */}
          <img src={rutaImagen} alt={`Factura ${factura.archivo}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
        </div>
      </Tarjeta>

      <Tarjeta titulo={factura.corregidaManualmente ? "Editar revisión" : "Revisar factura"}>
        {factura.motivos.length > 0 && (
          <div className="rounded-lg bg-aviso-suave p-3 text-sm">
            <p className="font-medium">La máquina la envió a revisión porque:</p>
            <ul className="list-inside list-disc text-secundario">
              {factura.motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Número" valor={campos.numero} alCambiar={(v) => cambiar({ numero: v })} />
          <Campo etiqueta="Fecha de emisión" tipo="date" valor={campos.fecha} alCambiar={(v) => cambiar({ fecha: v })} />
          <Campo etiqueta="Proveedor" ancho="col-span-2" valor={campos.proveedor} alCambiar={(v) => cambiar({ proveedor: v })} />
          <Campo etiqueta="NIT del proveedor" valor={campos.nitProveedor} alCambiar={(v) => cambiar({ nitProveedor: v })} />
          <Campo etiqueta="Dígito de verificación" valor={campos.dvProveedor} alCambiar={(v) => cambiar({ dvProveedor: v })} />
          <Campo etiqueta="Cliente" ancho="col-span-2" valor={campos.clienteNombre} alCambiar={(v) => cambiar({ clienteNombre: v })} />
          <Campo etiqueta="Documento del cliente" valor={campos.clienteDocumento} alCambiar={(v) => cambiar({ clienteDocumento: v })} />
          <Campo etiqueta="Dígito de verificación" valor={campos.clienteDv} alCambiar={(v) => cambiar({ clienteDv: v })} />
        </div>

        <h3 className="font-semibold">Ítems</h3>
        <div className="flex flex-col gap-3">
          {campos.items.map((fila, i) => {
            const cantidad = aNumero(fila.cantidad);
            const precio = aNumero(fila.precioUnitario);
            const subtotal = Number.isFinite(cantidad * precio) ? cantidad * precio : null;
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-lg bg-superficie-2/60 p-3">
                <Campo etiqueta="Descripción" ancho="col-span-2" valor={fila.descripcion} alCambiar={(v) => cambiarItem(i, { descripcion: v })} />
                <Campo etiqueta="Cantidad" valor={fila.cantidad} alCambiar={(v) => cambiarItem(i, { cantidad: v })} />
                <Campo etiqueta="Precio unitario" valor={fila.precioUnitario} alCambiar={(v) => cambiarItem(i, { precioUnitario: v })} />
                <div className="col-span-2 flex items-center justify-between text-sm">
                  <span className="tabular-nums">Subtotal: {formatoPesos(subtotal)}</span>
                  {campos.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => cambiar({ items: campos.items.filter((_, j) => j !== i) })}
                      className={`cursor-pointer ${CLASE_ENLACE}`}
                    >
                      Quitar ítem
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => cambiar({ items: [...campos.items, FILA_VACIA] })}
            className={`self-start ${CLASE_BOTON}`}
          >
            Agregar ítem
          </button>
        </div>

        <h3 className="font-semibold">Totales</h3>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Valor antes de IVA" valor={campos.subtotal} alCambiar={(v) => cambiar({ subtotal: v })} />
          <Campo etiqueta="IVA" valor={campos.iva} alCambiar={(v) => cambiar({ iva: v })} />
          <Campo etiqueta="Impoconsumo (vacío si no trae)" valor={campos.impoconsumo} alCambiar={(v) => cambiar({ impoconsumo: v })} />
          <Campo etiqueta="Total" valor={campos.total} alCambiar={(v) => cambiar({ total: v })} />
        </div>
        <button type="button" onClick={recalcular} className={`self-start ${CLASE_BOTON}`}>
          Recalcular desde los ítems
        </button>

        {erroresFormato.length > 0 && (
          <ul className="list-inside list-disc text-sm text-malo">
            {erroresFormato.map((mensaje) => (
              <li key={mensaje}>{mensaje}</li>
            ))}
          </ul>
        )}

        {motivos.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-malo/40 bg-malo-suave p-3 text-sm">
            <p className="font-medium text-malo">✕ Esto no cuadra:</p>
            <ul className="list-inside list-disc">
              {motivos.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-1"
              />
              Revisé la imagen y estos datos son los de la factura
            </label>
          </div>
        )}

        {error && (
          <p role="alert" className="text-malo">
            ✕ {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className={CLASE_BOTON_PRINCIPAL}
          >
            {guardando ? "Guardando…" : motivos.length > 0 ? "Guardar de todos modos" : "Guardar"}
          </button>
          <Link href="/revision" className={CLASE_ENLACE}>
            Volver a la lista
          </Link>
        </div>
      </Tarjeta>
    </div>
  );
}
