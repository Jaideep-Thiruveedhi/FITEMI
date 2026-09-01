// Synthetic merchant catalog — small, polished demo catalog
export const merchants = [
  { id: "m1", name: "TechHaven", tagline: "Your campus tech partner", rating: 4.8, sales: 1240, theme: "navy" },
  { id: "m2", name: "Gadget Grove", tagline: "Curated for creators", rating: 4.6, sales: 890, theme: "peach" },
  { id: "m3", name: "FutureWorks", tagline: "Build tomorrow today", rating: 4.9, sales: 2100, theme: "lilac" },
];

export const products = [
  {
    id: "p1",
    merchantId: "m1",
    name: "MacBook Air M3",
    category: "laptop",
    price: 89900,
    originalPrice: 99900,
    description: "M3 chip, 8GB RAM, 256GB SSD — perfect for students and creators. Lightweight, 15hr battery.",
    image: "💻",
    availability: "In stock • Ships in 24h",
    badge: "Most loved",
    supportedTenors: [6, 12, 18, 24],
    color: "#FFF0E6",
  },
  {
    id: "p2",
    merchantId: "m1",
    name: "ThinkPad X1 Carbon",
    category: "laptop",
    price: 65000,
    originalPrice: 72000,
    description: "Business-grade durability, 14\" display, 16GB RAM. Trusted by 10k+ professionals.",
    image: "🖥️",
    availability: "In stock • Ships in 24h",
    badge: "AI Pick",
    supportedTenors: [6, 12, 18, 24],
    color: "#F0F4FF",
  },
  {
    id: "p3",
    merchantId: "m2",
    name: "iPhone 15",
    category: "phone",
    price: 59900,
    originalPrice: 65900,
    description: "A16 Bionic, 128GB, Super Retina XDR. Capture life in stunning detail.",
    image: "📱",
    availability: "In stock • Ships in 48h",
    badge: "Trending",
    supportedTenors: [3, 6, 12, 18],
    color: "#FFF5F0",
  },
  {
    id: "p4",
    merchantId: "m2",
    name: "Galaxy S24 Ultra",
    category: "phone",
    price: 54900,
    originalPrice: 59900,
    description: "200MP camera, S Pen, 12GB RAM. For those who want it all.",
    image: "📲",
    availability: "Low stock • 5 left",
    badge: null,
    supportedTenors: [3, 6, 12, 18],
    color: "#F5F0FF",
  },
  {
    id: "p5",
    merchantId: "m3",
    name: "iPad Pro 12.9\"",
    category: "tablet",
    price: 79900,
    originalPrice: 84900,
    description: "M2 chip, Liquid Retina XDR, Apple Pencil support. Your creative canvas.",
    image: "📟",
    availability: "In stock",
    badge: "Creator's choice",
    supportedTenors: [6, 12, 18],
    color: "#FFF8E6",
  },
  {
    id: "p6",
    merchantId: "m3",
    name: "Sony WH-1000XM5",
    category: "audio",
    price: 24900,
    originalPrice: 29900,
    description: "Industry-leading noise cancellation, 30hr battery, crystal-clear calls.",
    image: "🎧",
    availability: "In stock",
    badge: null,
    supportedTenors: [3, 6, 9, 12],
    color: "#E6F7FF",
  },
  {
    id: "p7",
    merchantId: "m1",
    name: "Dell Inspiron 14",
    category: "laptop",
    price: 42000,
    originalPrice: 48000,
    description: "Intel i5, 8GB RAM, 512GB SSD — reliable everyday performance.",
    image: "💻",
    availability: "In stock",
    badge: "Budget smart",
    supportedTenors: [6, 12, 18, 24],
    color: "#F0FFF4",
  },
  {
    id: "p8",
    merchantId: "m2",
    name: "Pixel 8 Pro",
    category: "phone",
    price: 48900,
    originalPrice: 53900,
    description: "Google Tensor G3, Best Take, Magic Eraser. AI at your fingertips.",
    image: "📱",
    availability: "In stock",
    badge: null,
    supportedTenors: [3, 6, 12],
    color: "#FFF0F5",
  },
];

export function getMerchantById(id) {
  return merchants.find(m => m.id === id);
}

export function getProductById(id) {
  return products.find(p => p.id === id);
}

export function searchCatalog({ query, category, maxPrice, minPrice, limit = 10 }) {
  let results = [...products];
  
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      getMerchantById(p.merchantId).name.toLowerCase().includes(q)
    );
  }
  
  if (category) {
    results = results.filter(p => p.category === category);
  }
  
  if (maxPrice != null) {
    results = results.filter(p => p.price <= maxPrice);
  }
  
  if (minPrice != null) {
    results = results.filter(p => p.price >= minPrice);
  }
  
  // Enrich with merchant
  results = results.map(p => ({
    ...p,
    merchant: getMerchantById(p.merchantId)
  }));
  
  return results.slice(0, limit);
}

// Agent-readable catalog concept — structured for AI
export function getCatalogForAgent() {
  return products.map(p => ({
    productId: p.id,
    merchantId: p.merchantId,
    merchant: getMerchantById(p.merchantId).name,
    name: p.name,
    category: p.category,
    price: p.price,
    availability: p.availability,
    supportedTenors: p.supportedTenors,
  }));
}
