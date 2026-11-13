"use client";

import { useState } from "react";
import { ProductImage } from "@/components/ui/ProductImage";
import { useRouter } from "next/navigation";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AIResultado, Proveedor } from "@/types";
import type { AdminProduct } from "@/lib/data/products-repo";
import { ETIQUETA_ESTADO } from "@/lib/catalogo";
import { DEPARTAMENTOS, CATEGORIAS_IA } from "@/lib/taxonomy";
import { updateProductAction } from "@/app/admin/(protected)/productos/actions";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/Input";
import { ImageDropzone } from "@/components/admin/ImageDropzone";
import { AISuggestionPanel } from "@/components/admin/AISuggestionPanel";

const editSchema = z.object({
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
  imagen: z.instanceof(File).optional(),
});

type EditFormInput = z.input<typeof editSchema>;
type EditFormValues = z.output<typeof editSchema>;

export function EditProductForm({
  product,
  categoriaManualInicial,
  proveedores,
}: {
  product: AdminProduct;
  categoriaManualInicial: string | null;
  proveedores: Pick<Proveedor, "id" | "nombre">[];
}) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [resultado, setResultado] = useState<AIResultado | null>(null);
  const [categoriaElegida, setCategoriaElegida] = useState<string | null>(null);
  const [volvioARevision, setVolvioARevision] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EditFormInput, unknown, EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nombre: product.nombre,
      descripcion: product.descripcion ?? "",
      marca: product.marca,
      precio: product.precio,
      stock: product.stock,
      departamento: product.departamento,
      categoriaManual: categoriaManualInicial ?? "",
      proveedorId: product.proveedorId ?? "",
    },
  });

  const departamento = useWatch({ control, name: "departamento" });
  const categoriasDisponibles = departamento ? CATEGORIAS_IA[departamento] : [];

  async function onSubmit(values: EditFormValues) {
    setIsSaving(true);
    setResultado(null);
    setVolvioARevision(false);
    const result = await updateProductAction({ productId: product.id, ...values });
    setIsSaving(false);

    if (!result.success) {
      toast.error(result.error ?? "No se pudo actualizar el producto.");
      return;
    }

    if (result.avisoIA) toast(result.avisoIA);

    if (!values.imagen) {
      toast.success(
        result.pendingReview
          ? "Cambios guardados — el producto vuelve a revisión antes de publicarse."
          : "Producto actualizado",
      );
      router.push(
        result.pendingReview ? "/admin/productos?estado=pendiente_revision" : `/admin/productos?estado=${product.estado}`,
      );
      return;
    }

    // Se reemplazó la foto: se volvió a clasificar — se queda en esta
    // página para mostrar el panel antes de navegar (F4.3/F4.4).
    if (result.resultado) setResultado(result.resultado);
    setCategoriaElegida(values.categoriaManual);
    setVolvioARevision(Boolean(result.pendingReview));
    toast.success(
      result.pendingReview
        ? "Foto actualizada — el producto vuelve a revisión antes de publicarse."
        : "Foto actualizada y producto republicado.",
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-900">
        Editar producto
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Estado: <span className="font-medium text-slate-700">{ETIQUETA_ESTADO[product.estado]}</span>.
        Precio, stock, marca y proveedor se actualizan al instante. Si cambias el
        nombre, la descripción, el departamento o la categoría, el producto
        vuelve a revisión antes de seguir a la venta.
      </p>
      {product.motivoRechazo && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-medium">Fue rechazado: {product.motivoRechazo}</p>
          <p className="mt-0.5">Corrígelo y guarda: se reenvía a revisión.</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" {...register("nombre")} />
          <FieldError message={errors.nombre?.message} />
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <Textarea id="descripcion" {...register("descripcion")} />
          <FieldError message={errors.descripcion?.message} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="precio">Precio</Label>
            <Input
              id="precio"
              type="number"
              step="0.01"
              min="0"
              {...register("precio")}
            />
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
          <Input id="marca" {...register("marca")} />
          <FieldError message={errors.marca?.message} />
        </div>

        <div>
          <Label htmlFor="departamento">Departamento</Label>
          <Select
            id="departamento"
            defaultValue={product.departamento}
            {...register("departamento")}
          >
            {DEPARTAMENTOS.map((departamentoOpcion) => (
              <option key={departamentoOpcion} value={departamentoOpcion}>
                {departamentoOpcion}
              </option>
            ))}
          </Select>
          <FieldError message={errors.departamento?.message} />
        </div>

        <div>
          <Label htmlFor="categoriaManual">
            Categoría (la que tú elijas, no la de la IA)
          </Label>
          <Select
            id="categoriaManual"
            defaultValue={categoriaManualInicial ?? ""}
            {...register("categoriaManual")}
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {categoriasDisponibles.map((categoria) => (
              <option key={categoria} value={categoria}>
                {categoria}
              </option>
            ))}
          </Select>
          <FieldError message={errors.categoriaManual?.message} />
        </div>

        <div>
          <Label htmlFor="proveedorId">Proveedor (opcional)</Label>
          <Select id="proveedorId" defaultValue={product.proveedorId ?? ""} {...register("proveedorId")}>
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

        <div>
          <p className="mb-1.5 block text-sm font-medium text-slate-700">
            Foto del producto
          </p>
          <div className="flex items-start gap-3">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              <ProductImage
                src={product.imagen_url}
                alt={product.nombre}
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>
            <div className="flex-1">
              <Controller
                name="imagen"
                control={control}
                render={({ field }) => (
                  <ImageDropzone onFileSelected={(file) => field.onChange(file ?? undefined)} />
                )}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Deja esto vacío para conservar la foto actual. Si subes una
                nueva, vuelve a dispararse la clasificación por IA y el
                producto puede volver a revisión.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-2 flex gap-3">
          <Button type="submit" variant="dark" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/productos")}
          >
            Cancelar
          </Button>
        </div>
      </form>

      {resultado && categoriaElegida && (
        <div className="mt-6 flex flex-col gap-4">
          <AISuggestionPanel resultado={resultado} categoriaManual={categoriaElegida} />
          <Button
            type="button"
            variant="dark"
            onClick={() => router.push(volvioARevision ? "/admin/productos?estado=pendiente_revision" : "/admin/productos")}
          >
            {volvioARevision ? "Ver productos en revisión" : "Volver a Productos"}
          </Button>
        </div>
      )}
    </div>
  );
}
