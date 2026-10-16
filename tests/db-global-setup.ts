import fs from "fs";
import path from "path";
import { Client } from "pg";

// Si no hay DATABASE_URL, las pruebas de integración de lib/data/*.test.ts
// se saltan (describe.skipIf) y `npm test` sigue siendo rápido y sin
// dependencias externas para quien solo quiere correr las pruebas unitarias.
// Si SÍ hay DATABASE_URL, recrea el esquema completo desde cero antes de
// correr la suite, para que cada corrida empiece con los mismos datos
// semilla (el propio script hace DROP SCHEMA ... CASCADE).
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const sql = fs.readFileSync(
    path.join(process.cwd(), "db/novastore_postgresql.sql"),
    "utf-8",
  );

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
