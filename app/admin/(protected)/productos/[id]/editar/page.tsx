import { notFound } from "next/navigation";
import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { EditProductForm } from "@/components/admin/EditProductForm";

interface EditProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params;
  const product = MOCK_PRODUCTS.find((p) => p.id === id);

  if (!product) {
    notFound();
  }

  return <EditProductForm product={product} />;
}
