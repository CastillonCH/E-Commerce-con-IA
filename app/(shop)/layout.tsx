import { Navbar } from "@/components/shop/Navbar";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
