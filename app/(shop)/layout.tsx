import { Navbar } from "@/components/shop/Navbar";
import { Footer } from "@/components/shop/Footer";
import { AssistantWidget } from "@/components/shop/AssistantWidget";
import { getSession } from "@/lib/auth";
import { getMenuResumen } from "@/lib/data/products-repo";
import { ShopSessionProvider } from "@/components/shop/ShopSessionProvider";

export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, menu] = await Promise.all([getSession(), getMenuResumen()]);

  return (
    <ShopSessionProvider session={session}>
      <div className="flex flex-1 flex-col">
        <Navbar session={session} menu={menu} />
        <main id="main-content" className="flex flex-1 flex-col">
          {children}
        </main>
        <Footer />
        <AssistantWidget />
      </div>
    </ShopSessionProvider>
  );
}
