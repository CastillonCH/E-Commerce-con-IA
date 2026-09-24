"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DEPARTAMENTOS, type Product } from "@/types";
import { updateProduct, getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Select } from "@/components/ui/Input";
import { ImageDropzone } from "@/components/admin/ImageDropzone";

const editSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  precio: z.coerce.number().positive("El precio debe ser mayor a 0"),
  stock: z.coerce.number().int().nonnegative("El stock no puede ser negativo"),
  marca: z.string().trim().min(2, "La marca es obligatoria"),
  departamento: z.enum(DEPARTAMENTOS, { message: "Selecciona un departamento" }),
  imagen: z.instanceof(File).optional(),
});

type EditFormInput = z.input<typeof editSchema>;
type EditFormValues = z.output<typeof editSchema>;

export function EditProductForm({ product }: { product: Product }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EditFormInput, unknown, EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nombre: product.nombre,
      marca: product.marca,
      precio: product.precio,
      stock: product.stock,
      departamento: product.departamento,
    },
  });

  async function onSubmit(values: EditFormValues) {
    setIsSaving(true);
    try {
      await updateProduct(product.id, values);
      toast.success("Producto actualizado");
      router.push("/admin/productos");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Editar producto</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" {...register("nombre")} />
          <FieldError message={errors.nombre?.message} />
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
          <Input id="marca" {...register("marca")} />
          <FieldError message={errors.marca?.message} />
        </div>

        <div>
          <Label htmlFor="departamento">Departamento</Label>
          <Select id="departamento" defaultValue={product.departamento} {...register("departamento")}>
            {DEPARTAMENTOS.map((departamento) => (
              <option key={departamento} value={departamento}>
                {departamento}
              </option>
            ))}
          </Select>
          <FieldError message={errors.departamento?.message} />
        </div>

        <div>
          <Label htmlFor="imagen">Foto del producto</Label>
          <div className="mb-3 flex items-center gap-3">
            <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-slate-100">
              <Image src={product.imagen_url} alt={product.nombre} fill sizes="64px" className="object-cover" />
            </div>
            <p className="text-xs text-slate-500">
              Imagen actual. Sube una nueva solo si quieres reemplazarla.
            </p>
          </div>
          <Controller
            name="imagen"
            control={control}
            render={({ field }) => (
              <ImageDropzone
                onFileSelected={(file) => field.onChange(file ?? undefined)}
                error={errors.imagen?.message}
              />
            )}
          />
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
          <Button type="button" variant="outline" onClick={() => router.push("/admin/productos")}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
