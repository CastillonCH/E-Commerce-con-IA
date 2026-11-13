import { listProveedoresActivos } from "@/lib/data/proveedores-repo";
import { NewProductForm } from "@/components/admin/NewProductForm";

export default async function AdminNewProductPage() {
  const proveedores = await listProveedoresActivos();
  return <NewProductForm proveedores={proveedores} />;
}
