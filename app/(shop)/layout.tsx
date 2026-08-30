import { Navbar } from "@/components/shop/Navbar";
import { Footer } from "@/components/shop/Footer";
import { AssistantWidget } from "@/components/shop/AssistantWidget";
import { getSessionRole } from "@/lib/auth";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = await getSessionRole();

  return (
    <div className="flex flex-1 flex-col">
      <Navbar role={role} />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
      <AssistantWidget />
    </div>
  );
}
