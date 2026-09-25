export interface AdminClientRow {
  id: string;
  nombre: string;
  email: string;
  fechaRegistro: string;
  pedidos: number;
  totalGastado: number;
}

export const MOCK_CLIENTS: AdminClientRow[] = [
  {
    id: "c1",
    nombre: "María Fernández",
    email: "maria.fernandez@gmail.com",
    fechaRegistro: "12 mar 2026",
    pedidos: 8,
    totalGastado: 2145.5,
  },
  {
    id: "c2",
    nombre: "Jorge Salazar",
    email: "jorge.salazar@gmail.com",
    fechaRegistro: "03 abr 2026",
    pedidos: 3,
    totalGastado: 589.7,
  },
  {
    id: "c3",
    nombre: "Lucía Torres",
    email: "lucia.torres@hotmail.com",
    fechaRegistro: "21 may 2026",
    pedidos: 12,
    totalGastado: 3820.0,
  },
  {
    id: "c4",
    nombre: "Diego Huamán",
    email: "diego.huaman@gmail.com",
    fechaRegistro: "09 jun 2026",
    pedidos: 1,
    totalGastado: 149.9,
  },
  {
    id: "c5",
    nombre: "Valeria Rojas",
    email: "valeria.rojas@outlook.com",
    fechaRegistro: "30 jun 2026",
    pedidos: 5,
    totalGastado: 1024.3,
  },
  {
    id: "c6",
    nombre: "Renato Vega",
    email: "renato.vega@gmail.com",
    fechaRegistro: "14 jul 2026",
    pedidos: 2,
    totalGastado: 399.8,
  },
];
