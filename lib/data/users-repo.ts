import "server-only";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/types";

export interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  fechaRegistro: string;
}

// "NovaStore2026!" — solo para desarrollo, nunca usar este hash en producción.
const DEMO_PASSWORD_HASH =
  "$2b$10$v8PnupzVov1yACqp9VARYu9bqJzOLLE9rAxuWZu3KY0ZvZeeri0du";

// El `nombre` de cada vendedor es exactamente su marca (coincide con
// `Product.marca` en lib/data/products-repo.ts): es como se restringe el
// catálogo que ve cada vendedor en /admin/productos (ver listByMarca).
const SEED_STAFF: Omit<UserRecord, "passwordHash">[] = [
  {
    id: "u-admin-1",
    nombre: "Admin NovaStore",
    email: "admin@novastore.pe",
    role: "ADMIN",
    fechaRegistro: "2026-01-01",
  },
  {
    id: "u-admin-2",
    nombre: "Catálogo NovaStore",
    email: "catalogo@novastore.pe",
    role: "ADMIN",
    fechaRegistro: "2026-01-01",
  },
  {
    id: "u-seller-1",
    nombre: "SoundMax",
    email: "contacto@soundmax.pe",
    role: "SELLER",
    fechaRegistro: "2026-01-15",
  },
  {
    id: "u-seller-2",
    nombre: "HogarPlus",
    email: "ventas@hogarplus.pe",
    role: "SELLER",
    fechaRegistro: "2026-01-20",
  },
  {
    id: "u-seller-3",
    nombre: "UrbanWear",
    email: "hola@urbanwear.pe",
    role: "SELLER",
    fechaRegistro: "2026-02-02",
  },
  {
    id: "u-seller-4",
    nombre: "ProSport",
    email: "hola@prosport.pe",
    role: "SELLER",
    fechaRegistro: "2026-02-10",
  },
  {
    id: "u-seller-5",
    nombre: "GlowBeauty",
    email: "contacto@glowbeauty.pe",
    role: "SELLER",
    fechaRegistro: "2026-02-18",
  },
  {
    id: "u-seller-6",
    nombre: "KidsWorld",
    email: "ventas@kidsworld.pe",
    role: "SELLER",
    fechaRegistro: "2026-03-01",
  },
  {
    id: "u-seller-7",
    nombre: "MercaFresh",
    email: "pedidos@mercafresh.pe",
    role: "SELLER",
    fechaRegistro: "2026-03-05",
  },
];

const SEED_CLIENTS: Omit<UserRecord, "passwordHash">[] = [
  {
    id: "c1",
    nombre: "María Fernández",
    email: "maria.fernandez@gmail.com",
    role: "CLIENT",
    fechaRegistro: "2026-04-01",
  },
  {
    id: "c2",
    nombre: "Jorge Salazar",
    email: "jorge.salazar@gmail.com",
    role: "CLIENT",
    fechaRegistro: "2026-04-10",
  },
  {
    id: "c3",
    nombre: "Lucía Torres",
    email: "lucia.torres@hotmail.com",
    role: "CLIENT",
    fechaRegistro: "2026-05-02",
  },
  {
    id: "c4",
    nombre: "Diego Huamán",
    email: "diego.huaman@gmail.com",
    role: "CLIENT",
    fechaRegistro: "2026-05-20",
  },
  {
    id: "c5",
    nombre: "Valeria Rojas",
    email: "valeria.rojas@outlook.com",
    role: "CLIENT",
    fechaRegistro: "2026-06-11",
  },
  {
    id: "c6",
    nombre: "Renato Vega",
    email: "renato.vega@gmail.com",
    role: "CLIENT",
    fechaRegistro: "2026-07-14",
  },
];

// Estado en memoria: se reinicia con cada reinicio del servidor, igual que
// el resto de repositorios "mock" (ver lib/data/*). El registro público
// (createClient) agrega aquí; nunca crea cuentas ADMIN/SELLER.
const users: UserRecord[] = [...SEED_STAFF, ...SEED_CLIENTS].map((user) => ({
  ...user,
  passwordHash: DEMO_PASSWORD_HASH,
}));

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const normalized = email.trim().toLowerCase();
  return users.find((user) => user.email.toLowerCase() === normalized) ?? null;
}

export async function verifyPassword(
  user: UserRecord,
  password: string,
): Promise<boolean> {
  if (!user.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export async function createClient(input: {
  name: string;
  email: string;
  password: string;
}): Promise<UserRecord> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new Error("Ya existe una cuenta con ese correo");
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user: UserRecord = {
    id: `c-${Date.now()}`,
    nombre: input.name,
    email: input.email,
    role: "CLIENT",
    passwordHash,
    fechaRegistro: new Date().toISOString().slice(0, 10),
  };
  users.push(user);
  return user;
}

export async function upsertGoogleUser(input: {
  sub: string;
  email: string;
  name: string;
}): Promise<UserRecord> {
  const existing = await findUserByEmail(input.email);
  if (existing) return existing;
  const user: UserRecord = {
    id: `g-${input.sub}`,
    nombre: input.name,
    email: input.email,
    role: "CLIENT",
    passwordHash: "",
    fechaRegistro: new Date().toISOString().slice(0, 10),
  };
  users.push(user);
  return user;
}

export async function promoteToSeller(input: {
  email: string;
  nombre: string;
}): Promise<UserRecord> {
  const index = users.findIndex(
    (u) => u.email.toLowerCase() === input.email.toLowerCase(),
  );
  if (index !== -1) {
    users[index] = { ...users[index], role: "SELLER" };
    return users[index];
  }

  const user: UserRecord = {
    id: `u-seller-${Date.now()}`,
    nombre: input.nombre,
    email: input.email,
    role: "SELLER",
    passwordHash: DEMO_PASSWORD_HASH,
    fechaRegistro: new Date().toISOString().slice(0, 10),
  };
  users.push(user);
  return user;
}

export async function listClients(): Promise<UserRecord[]> {
  return users.filter((u) => u.role === "CLIENT");
}

export async function listSellers(): Promise<UserRecord[]> {
  return users.filter((u) => u.role === "SELLER");
}
