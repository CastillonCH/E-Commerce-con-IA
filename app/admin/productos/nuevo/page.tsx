"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { DEPARTAMENTOS } from "@/types";
import { createProduct, getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label, Select } from "@/components/ui/Input";
import { ImageDropzone } from "@/components/admin/ImageDropzone";

const productSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  precio: z.coerce.number().positive("El precio debe ser mayor a 0"),
  stock: z.coerce.number().int().nonnegative("El stock no puede ser negativo"),
  marca: z.string().trim().min(2, "La marca es obligatoria"),
  departamento: z.enum(DEPARTAMENTOS, {
    message: "Selecciona un departamento",
  }),
  imagen: z.instanceof(File, { message: "La foto del producto es obligatoria" }),
});

// z.coerce.number() acepta un input distinto (string/unknown) al output ya
// parseado (number); RHF necesita ambos tipos para tipar el formulario y el
// valor final que llega a onSubmit correctamente.
type ProductFormInput = z.input<typeof productSchema>;
type ProductFormValues = z.output<typeof productSchema>;

export default function AdminNewProductPage() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      nombre: "",
      marca: "",
      precio: 0,
      stock: 0,
    },
  });

  async function onSubmit(values: ProductFormValues) {
    setIsAnalyzing(true);
    try {
      const { ai } = await createProduct(values);
      toast.success(
        `Producto guardado exitosamente. La IA lo ha clasificado automáticamente como: ${ai.predicted_category}`
      );
      router.push("/admin/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Nuevo producto</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" {...register("nombre")} placeholder="Audífonos Inalámbricos Pro" />
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
          <Input id="marca" {...register("marca")} placeholder="SoundMax" />
          <FieldError message={errors.marca?.message} />
        </div>

        <div>
          <Label htmlFor="departamento">Departamento</Label>
          <Select id="departamento" defaultValue="" {...register("departamento")}>
            <option value="" disabled>
              Selecciona un departamento
            </option>
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
          <Controller
            name="imagen"
            control={control}
            render={({ field }) => (
              <ImageDropzone
                onFileSelected={(file) => field.onChange(file)}
                error={errors.imagen?.message}
              />
            )}
          />
        </div>

        <Button type="submit" disabled={isAnalyzing} className="mt-2">
          {isAnalyzing ? "Analizando..." : "Guardar producto"}
        </Button>
      </form>

      {isAnalyzing && (
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
