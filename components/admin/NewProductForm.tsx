"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Sparkles } from "lucide-react";
import { DEPARTAMENTOS, CATEGORIAS_IA, type Departamento } from "@/lib/taxonomy";
import {
  createProductAction,
  sugerirCategoriaAction,
  type SugerirResult,
  type SugerenciaCategoria,
} from "@/app/admin/(protected)/productos/actions";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/Input";
import { ImageDropzone } from "@/components/admin/ImageDropzone";
import { AISuggestionPanel } from "@/components/admin/AISuggestionPanel";
import type { AIResultado, Proveedor } from "@/types";
import { cn } from "@/lib/utils";

type ProveedorOpcion = Pick<Proveedor, "id" | "nombre">;
export type ModoCatalogo = "asistido" | "experimento";

const productSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  descripcion: z
    .string()
    .trim()
    .min(20, "Escribe al menos 20 caracteres")
    .max(2000, "Máximo 2000 caracteres"),
  precio: z.coerce.number().positive("El precio debe ser mayor a 0"),
  stock: z.coerce.number().int().nonnegative("El stock no puede ser negativo"),
  marca: z.string().trim().min(2, "La marca es obligatoria"),
  departamento: z.enum(DEPARTAMENTOS, {
    message: "Selecciona un departamento",
  }),
  categoriaManual: z.string().min(1, "Selecciona una categoría"),
  proveedorId: z.string(),
  imagen: z.instanceof(File, {
    message: "La foto del producto es obligatoria",
  }),
});

type ProductFormInput = z.input<typeof productSchema>;
type ProductFormValues = z.output<typeof productSchema>;

// Espera a que deje de escribir antes de consultar a la IA.
const ESPERA_SUGERENCIA_MS = 900;

function marcaDeTiempoActual(): number {
  return Date.now();
}

interface Guardado {
  resultado: AIResultado | null;
  categoriaElegida: string;
  destino: { href: string; label: string };
}

interface Props {
  proveedores: ProveedorOpcion[];
  modo: ModoCatalogo;
  // Números propios de quien carga (los arma la página en el servidor).
  resumen?: ReactNode;
}

/** Cada "Cargar otro producto" monta un formulario nuevo: limpio y con el cronómetro en cero. */
export function NewProductForm(props: Props) {
  const [intento, setIntento] = useState(0);
  return <FormularioCarga key={intento} {...props} onCargarOtro={() => setIntento((n) => n + 1)} />;
}

function FormularioCarga({ proveedores, modo, resumen, onCargarOtro }: Props & { onCargarOtro: () => void }) {
  const router = useRouter();
  const asistido = modo === "asistido";
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<Guardado | null>(null);

  // Sugerencia de la IA antes de guardar (solo en modo asistido).
  const [consultando, setConsultando] = useState(false);
  const [sugerencia, setSugerencia] = useState<SugerirResult | null>(null);
  const consultaId = useRef(0);
  // Si la persona eligió departamento/categoría por su cuenta, una
  // sugerencia que llega después no le pisa la elección.
  const eligioAMano = useRef(false);

  // Tiempo de carga: desde la primera interacción hasta guardar.
  const [inicio, setInicio] = useState<number | null>(null);
  const marcarInicio = () => setInicio((actual) => actual ?? marcaDeTiempoActual());

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      marca: "",
      precio: 0,
      stock: 0,
      categoriaManual: "",
      proveedorId: "",
    },
  });

  const [nombre, descripcion, imagen, departamento, categoria] = useWatch({
    control,
    name: ["nombre", "descripcion", "imagen", "departamento", "categoriaManual"],
  });
  const categoriasDisponibles = departamento ? CATEGORIAS_IA[departamento as Departamento] : [];

  function aplicar(opcion: SugerenciaCategoria) {
    setValue("departamento", opcion.departamento, { shouldValidate: true });
    setValue("categoriaManual", opcion.categoria, { shouldValidate: true });
  }

  const listoParaSugerir =
    asistido && imagen instanceof File && (nombre ?? "").trim().length >= 2 && (descripcion ?? "").trim().length >= 20;

  useEffect(() => {
    if (!listoParaSugerir) return;
    const id = ++consultaId.current;
    const timer = setTimeout(async () => {
      setConsultando(true);
      const resultado = await sugerirCategoriaAction({ nombre, descripcion, imagen });
      if (id !== consultaId.current) return; // llegó una consulta más nueva
      setConsultando(false);
      setSugerencia(resultado);
      if (resultado.disponible && resultado.sugerencia && !eligioAMano.current) {
        aplicar(resultado.sugerencia);
      }
    }, ESPERA_SUGERENCIA_MS);
    return () => clearTimeout(timer);
    // aplicar/setValue son estables; solo se vuelve a consultar si cambian los datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listoParaSugerir, nombre, descripcion, imagen]);

  async function onSubmit(values: ProductFormValues) {
    setGuardando(true);
    const tiempoCargaSeg = inicio ? (marcaDeTiempoActual() - inicio) / 1000 : undefined;
    const result = await createProductAction({
      ...values,
      tiempoCargaSeg,
      sugerenciaMostrada: Boolean(sugerencia?.disponible),
    });
    setGuardando(false);

    if (!result.success) {
      toast.error(result.error ?? "No se pudo guardar el producto.");
      return;
    }

    if (result.avisoIA) toast(result.avisoIA);
    if (result.pendingReview) {
      toast.success("Producto guardado — queda en revisión antes de publicarse.");
    } else {
      toast.success(
        `Producto guardado y publicado${result.resultado ? ` como "${result.resultado.categoria}"` : ""}.`,
      );
    }
    setGuardado({
      resultado: result.resultado ?? null,
      categoriaElegida: values.categoriaManual,
      destino: result.pendingReview
        ? { href: "/admin/productos?estado=pendiente_revision", label: "Ver productos en revisión" }
        : { href: "/admin/productos", label: "Ir a Productos" },
    });
  }

  if (guardado) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Nuevo producto</h1>
        <div className="flex flex-col gap-4">
          {guardado.resultado && (
            <AISuggestionPanel resultado={guardado.resultado} categoriaManual={guardado.categoriaElegida} />
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="dark" onClick={onCargarOtro}>
              <Plus className="h-4 w-4" />
              Cargar otro producto
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(guardado.destino.href)}>
              {guardado.destino.label}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sugerida = sugerencia?.disponible ? sugerencia.sugerencia : undefined;
  const coincideConIA = sugerida ? sugerida.categoria === categoria : false;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Nuevo producto</h1>
        <span
          data-testid="modo-carga"
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            asistido ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800",
          )}
        >
          {asistido ? "Con IA" : "Sin IA (medición)"}
        </span>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        {asistido
          ? "Sube la foto y escribe el nombre y la descripción: la IA propone el departamento y la categoría, y tú solo confirmas o corriges."
          : "Carga sin IA: elige el departamento y la categoría por tu cuenta, sin sugerencia (así se mide la carga manual). Un administrador eligió este modo para tu cuenta."}
      </p>
      {resumen}

      <form
        onSubmit={handleSubmit(onSubmit)}
        onChangeCapture={marcarInicio}
        onInputCapture={marcarInicio}
        className="flex flex-col gap-5"
      >
        <div>
          <Label htmlFor="imagen">Foto del producto</Label>
          <Controller
            name="imagen"
            control={control}
            render={({ field }) => (
              <ImageDropzone
                onFileSelected={(file) => {
                  marcarInicio();
                  field.onChange(file ?? undefined);
                }}
                error={errors.imagen?.message}
              />
            )}
          />
        </div>

        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" {...register("nombre")} placeholder="Audífonos Inalámbricos Pro" />
          <FieldError message={errors.nombre?.message} />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea
            id="descripcion"
            {...register("descripcion")}
            placeholder="Describe el producto: material, características, qué lo hace distinto..."
          />
          <FieldError message={errors.descripcion?.message} />
        </div>

        {asistido && (
          <SugerenciaIA
            listo={listoParaSugerir}
            consultando={consultando}
            sugerencia={sugerencia}
            categoriaActual={categoria}
            onElegir={(opcion) => {
              eligioAMano.current = true;
              aplicar(opcion);
            }}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="departamento">Departamento</Label>
            <Controller
              name="departamento"
              control={control}
              render={({ field }) => (
                <Select
                  id="departamento"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  onChange={(event) => {
                    eligioAMano.current = true;
                    field.onChange(event.target.value);
                    setValue("categoriaManual", "");
                  }}
                >
                  <option value="" disabled>
                    Selecciona un departamento
                  </option>
                  {DEPARTAMENTOS.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </Select>
              )}
            />
            <FieldError message={errors.departamento?.message} />
          </div>

          <div>
            <Label htmlFor="categoriaManual">
              {asistido ? "Categoría" : "Categoría (la que tú elijas, no la de la IA)"}
            </Label>
            <Controller
              name="categoriaManual"
              control={control}
              render={({ field }) => (
                <Select
                  id="categoriaManual"
                  name={field.name}
                  ref={field.ref}
                  onBlur={field.onBlur}
                  value={field.value ?? ""}
                  disabled={!departamento}
                  onChange={(event) => {
                    eligioAMano.current = true;
                    field.onChange(event.target.value);
                  }}
                >
                  <option value="" disabled>
                    {departamento ? "Selecciona una categoría" : "Elige primero un departamento"}
                  </option>
                  {categoriasDisponibles.map((opcion) => (
                    <option key={opcion} value={opcion}>
                      {opcion}
                    </option>
                  ))}
                </Select>
              )}
            />
            <FieldError message={errors.categoriaManual?.message} />
            {sugerida && categoria && (
              <p className={cn("mt-1 text-xs", coincideConIA ? "text-emerald-700" : "text-amber-700")}>
                {coincideConIA
                  ? "Es la que propuso la IA."
                  : "La cambiaste: un administrador confirmará la categoría antes de publicar."}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="precio">Precio</Label>
            <Input id="precio" type="number" step="0.01" min="0" {...register("precio")} />
            <FieldError message={errors.precio?.message} />
          </div>
          <div>
            <Label htmlFor="stock">Stock</Label>
            <Input id="stock" type="number" min="0" {...register("stock")} />
            <FieldError message={errors.stock?.message} />
          </div>
        </div>

        <div>
          <Label htmlFor="marca">Marca</Label>
          <Input id="marca" {...register("marca")} placeholder="SoundMax" />
          <FieldError message={errors.marca?.message} />
        </div>

        <div>
          <Label htmlFor="proveedorId">Proveedor (opcional)</Label>
          <Select id="proveedorId" {...register("proveedorId")}>
            <option value="">Sin proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            A quién le compra NovaStore este producto. No cambia si se vende.
          </p>
        </div>

        <Button type="submit" variant="dark" disabled={guardando} className="mt-2">
          {guardando ? "Analizando..." : "Guardar producto"}
        </Button>
      </form>

      {guardando && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white/90 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-slate-900" />
          <p className="text-sm font-medium text-slate-700">
            Analizando imagen con Inteligencia Artificial...
          </p>
        </div>
      )}
    </div>
  );
}

function SugerenciaIA({
  listo,
  consultando,
  sugerencia,
  categoriaActual,
  onElegir,
}: {
  listo: boolean;
  consultando: boolean;
  sugerencia: SugerirResult | null;
  categoriaActual: string | undefined;
  onElegir: (opcion: SugerenciaCategoria) => void;
}) {
  let contenido: ReactNode;
  if (consultando) {
    contenido = (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        La IA está analizando la foto y el texto…
      </p>
    );
  } else if (!sugerencia) {
    contenido = (
      <p className="text-sm text-slate-500">
        {listo
          ? "Preparando la sugerencia…"
          : "Cuando subas la foto y escribas el nombre y la descripción (20 caracteres o más), la IA propondrá el departamento y la categoría."}
      </p>
    );
  } else if (!sugerencia.disponible || !sugerencia.sugerencia) {
    contenido = (
      <p className="text-sm text-slate-600">
        {sugerencia.aviso ?? "La IA no está disponible: elige el departamento y la categoría a mano."}
      </p>
    );
  } else {
    const principal = sugerencia.sugerencia;
    const enUso = principal.categoria === categoriaActual;
    contenido = (
      <div className="flex flex-col gap-3">
        {sugerencia.modo === "demo" && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Modo demo: sugerencia por palabras clave, no del modelo entrenado.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-slate-900">
            <span className="font-semibold">{principal.categoria}</span>
            <span className="text-slate-500"> · {principal.departamento}</span>{" "}
            <span className="text-slate-500">({Math.round((sugerencia.confianza ?? principal.prob) * 100)}% de confianza)</span>
          </p>
          {!enUso && (
            <button
              type="button"
              onClick={() => onElegir(principal)}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
            >
              Usar sugerencia
            </button>
          )}
        </div>
        {(sugerencia.alternativas?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Otras opciones:</span>
            {sugerencia.alternativas!.map((alternativa) => (
              <button
                key={alternativa.categoria}
                type="button"
                onClick={() => onElegir(alternativa)}
                aria-pressed={alternativa.categoria === categoriaActual}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  alternativa.categoria === categoriaActual
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 text-slate-700 hover:border-slate-900",
                )}
              >
                {alternativa.categoria} · {Math.round(alternativa.prob * 100)}%
              </button>
            ))}
          </div>
        )}
        {(sugerencia.duplicados?.length ?? 0) > 0 && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-semibold">Este producto parece que ya existe en el catálogo</p>
            <p className="mt-0.5 text-xs">Revísalo antes de guardar para no crear una ficha repetida.</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {sugerencia.duplicados!.map((duplicado) => (
                <li key={duplicado.id} className="flex items-center gap-2 text-xs">
                  {duplicado.imagen && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={duplicado.imagen} alt="" className="h-8 w-8 rounded object-cover" />
                  )}
                  <span className="flex-1 font-medium">{duplicado.nombre}</span>
                  <span>{Math.round(duplicado.similitud * 100)}% parecido</span>
                  <Link
                    href={`/admin/productos/${duplicado.id}/editar`}
                    target="_blank"
                    className="font-semibold underline"
                  >
                    Ver ficha
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      aria-live="polite"
      aria-label="Sugerencia de la IA"
      className="rounded-xl border border-blue-100 bg-blue-50 p-4"
    >
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
        <Sparkles className="h-3.5 w-3.5" />
        Sugerencia de la IA
      </p>
      {contenido}
    </section>
  );
}
