import { notFound } from "next/navigation";
import { getCategoriaVendedorNombre, getProductById } from "@/lib/data/products-repo";
import { EditProductForm } from "@/components/admin/EditProductForm";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({
  params,
}: EditProductPageProps) {
  const { id } = await params;
  const [product, categoriaVendedor] = await Promise.all([
    getProductById(id),
    getCategoriaVendedorNombre(id),
  ]);

  if (!product) {
    notFound();
  }

  return <EditProductForm product={product} categoriaVendedorInicial={categoriaVendedor} />;
}
