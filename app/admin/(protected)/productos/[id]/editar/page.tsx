import { notFound } from "next/navigation";
import { getAdminProductById, getCategoriaManualNombre } from "@/lib/data/products-repo";
import { listProveedoresActivos } from "@/lib/data/proveedores-repo";
import { EditProductForm } from "@/components/admin/EditProductForm";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;
  const [product, categoriaManual, proveedores] = await Promise.all([
    getAdminProductById(id),
    getCategoriaManualNombre(id),
    listProveedoresActivos(),
  ]);

  // Cualquier estado se puede editar, salvo archivado (primero se restaura).
  if (!product || product.estado === "archivado") {
    notFound();
  }

  // Si su proveedor ya está desactivado, igual tiene que aparecer en la lista.
  const opciones =
    product.proveedorId && product.proveedor && !proveedores.some((p) => p.id === product.proveedorId)
      ? [...proveedores, { id: product.proveedorId, nombre: `${product.proveedor} (inactivo)` }]
      : proveedores;

  return (
    <EditProductForm product={product} categoriaManualInicial={categoriaManual} proveedores={opciones} />
  );
}
