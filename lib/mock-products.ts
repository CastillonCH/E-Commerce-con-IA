import type { Product } from "@/types";

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "1",
    nombre: "Audífonos Inalámbricos Pro",
    precio: 289.9,
    precioOriginal: 349.9,
    stock: 24,
    marca: "SoundMax",
    departamento: "Electrónica",
    imagen_url:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Audio y audífonos",
    rating: 4.6,
    numResenas: 328,
    envioGratis: true,
    descripcion:
      "Audífonos inalámbricos con cancelación activa de ruido, hasta 30 horas de batería con el estuche de carga y sonido de alta fidelidad ajustado para graves profundos. Ideales para música, llamadas y uso diario en la calle o la oficina.",
  },
  {
    id: "2",
    nombre: "Licuadora de Alta Potencia",
    precio: 179.5,
    stock: 12,
    marca: "HogarPlus",
    departamento: "Hogar",
    imagen_url:
      "https://images.unsplash.com/photo-1570222094114-d054a817e56b?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Electrodomésticos de cocina",
    rating: 4.3,
    numResenas: 94,
    descripcion:
      "Licuadora de 1200W con vaso de vidrio resistente de 1.8L, 3 velocidades más función pulso y cuchillas de acero inoxidable. Pensada para batidos, jugos y preparaciones espesas sin esfuerzo.",
  },
  {
    id: "3",
    nombre: "Chaqueta Impermeable Urbana",
    precio: 249.0,
    precioOriginal: 329.0,
    stock: 8,
    marca: "UrbanWear",
    departamento: "Moda",
    imagen_url:
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Casacas y abrigos",
    rating: 4.8,
    numResenas: 156,
    envioGratis: true,
    esNuevo: true,
    descripcion:
      "Chaqueta impermeable con costuras selladas, forro térmico ligero y capucha ajustable. Diseñada para uso urbano todo el año, resiste lluvia y viento sin perder estilo.",
  },
  {
    id: "4",
    nombre: "Balón de Fútbol Profesional",
    precio: 89.9,
    stock: 40,
    marca: "ProSport",
    departamento: "Deportes",
    imagen_url:
      "https://images.unsplash.com/photo-1614632537197-38a17061c2bd?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Balones",
    rating: 4.5,
    numResenas: 210,
    descripcion:
      "Balón de fútbol de competición, costura termosellada y cámara de látex de alta retención de aire. Aprobado para uso en césped natural y sintético.",
  },
  {
    id: "5",
    nombre: "Set de Brochas de Maquillaje",
    precio: 69.9,
    precioOriginal: 99.9,
    stock: 60,
    marca: "GlowBeauty",
    departamento: "Belleza",
    imagen_url:
      "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Herramientas de belleza",
    rating: 4.7,
    numResenas: 412,
    envioGratis: true,
    descripcion:
      "Set de 12 brochas profesionales con cerdas suaves sintéticas, libres de crueldad animal, y estuche de viaje incluido. Cubre rostro y ojos para un maquillaje de acabado uniforme.",
  },
  {
    id: "6",
    nombre: "Smartwatch Deportivo",
    precio: 549.0,
    stock: 15,
    marca: "SoundMax",
    departamento: "Electrónica",
    imagen_url:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Relojes inteligentes y wearables",
    rating: 4.4,
    numResenas: 87,
    esNuevo: true,
    descripcion:
      "Smartwatch con GPS integrado, monitoreo de ritmo cardíaco 24/7, más de 20 modos deportivos y resistencia al agua 5ATM. Batería de hasta 7 días con notificaciones inteligentes.",
  },
  {
    id: "7",
    nombre: "Cafetera Automática",
    precio: 289.0,
    precioOriginal: 359.0,
    stock: 18,
    marca: "HogarPlus",
    departamento: "Hogar",
    imagen_url:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Electrodomésticos de cocina",
    rating: 4.2,
    numResenas: 63,
    descripcion:
      "Cafetera automática programable con depósito de 1.5L, filtro permanente reutilizable y placa térmica que mantiene la temperatura. Prepara hasta 12 tazas por ciclo.",
  },
  {
    id: "8",
    nombre: "Tenis Running Ligeros",
    precio: 259.9,
    stock: 30,
    marca: "ProSport",
    departamento: "Moda",
    imagen_url:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Zapatillas y calzado",
    rating: 4.6,
    numResenas: 275,
    envioGratis: true,
    descripcion:
      "Zapatillas running con entresuela de espuma ligera y malla transpirable. Diseñadas para amortiguar el impacto en trotes diarios y entrenamientos largos.",
  },
  {
    id: "9",
    nombre: "Perfume Eau de Parfum 100ml",
    precio: 199.9,
    precioOriginal: 259.9,
    stock: 22,
    marca: "GlowBeauty",
    departamento: "Belleza",
    imagen_url:
      "https://images.unsplash.com/photo-1541643600914-78b084683601?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Fragancias",
    rating: 4.9,
    numResenas: 501,
    envioGratis: true,
    descripcion:
      "Eau de parfum de larga duración con notas florales y amaderadas. Frasco de 100ml, ideal para uso diario o en ocasiones especiales.",
  },
  {
    id: "10",
    nombre: "Set de Bloques de Construcción",
    precio: 119.9,
    stock: 45,
    marca: "KidsWorld",
    departamento: "Juguetes",
    imagen_url:
      "https://images.unsplash.com/photo-1587654780291-39c9404d746b?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Bloques de construcción",
    rating: 4.7,
    numResenas: 132,
    esNuevo: true,
    descripcion:
      "Set de 350 piezas de bloques de construcción compatibles con las principales marcas del mercado. Estimula la creatividad y motricidad fina, para niños desde 6 años.",
  },
  {
    id: "11",
    nombre: "Laptop Ultradelgada 14''",
    precio: 2799.0,
    precioOriginal: 3199.0,
    stock: 9,
    marca: "SoundMax",
    departamento: "Electrónica",
    imagen_url:
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Laptops y computadoras",
    rating: 4.5,
    numResenas: 58,
    envioGratis: true,
    descripcion:
      "Laptop ultradelgada de 14'' con procesador de última generación, 16GB de RAM y SSD de 512GB. Pantalla de bordes reducidos y batería de todo el día para trabajo y estudio.",
  },
  {
    id: "12",
    nombre: "Canasta Familiar de Abarrotes",
    precio: 149.9,
    stock: 100,
    marca: "MercaFresh",
    departamento: "Supermercado",
    imagen_url:
      "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop",
    categoria_ia: "Abarrotes y snacks",
    rating: 4.3,
    numResenas: 76,
    envioGratis: true,
    descripcion:
      "Canasta con productos básicos de abarrotes para el hogar: arroz, aceite, azúcar, fideos y más. Pensada para abastecer a una familia durante la semana.",
  },
];
