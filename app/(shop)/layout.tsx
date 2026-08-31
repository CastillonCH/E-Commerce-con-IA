import { Navbar } from "@/components/shop/Navbar";
import { Footer } from "@/components/shop/Footer";
import { AssistantWidget } from "@/components/shop/AssistantWidget";
import { getSession } from "@/lib/auth";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="flex flex-1 flex-col">
      <Navbar session={session} />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
      <AssistantWidget />
    </div>
  );
}
