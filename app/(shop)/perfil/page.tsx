/**
 * Placeholder: cuando exista `GET /api/usuarios/me` en el backend, esta
 * página debe volverse un Server Component que lo consuma y muestre los
 * datos reales de `User` (types/index.ts).
 */
export default function ProfilePage() {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-2 px-4 py-24 text-center">
      <p className="text-lg font-medium text-slate-900">Mi Perfil</p>
      <p className="text-sm text-slate-500">
        Pendiente de conectar con la autenticación del backend.
      </p>
    </div>
  );
}
