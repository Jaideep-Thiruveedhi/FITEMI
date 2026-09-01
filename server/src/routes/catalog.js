import express from "express";
import { searchCatalog, getProductById, getCatalogForAgent, merchants } from "../lib/catalog.js";

const router = express.Router();

// GET /api/catalog — list/search
router.get("/", (req, res) => {
  const { q, category, maxPrice, minPrice, limit } = req.query;
  const results = searchCatalog({
    query: q,
    category,
    maxPrice: maxPrice ? parseInt(maxPrice, 10) : null,
    minPrice: minPrice ? parseInt(minPrice, 10) : null,
    limit: limit ? parseInt(limit, 10) : 10,
  });
  res.json({ count: results.length, products: results, merchants });
});

// GET /api/catalog/:id — single product
router.get("/:id", (req, res) => {
  const product = getProductById(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  // Enrich
  const merchant = merchants.find(m => m.id === product.merchantId);
  res.json({ ...product, merchant });
});

// GET /api/catalog/agent/readable — agent-readable catalog
router.get("/agent/readable", (req, res) => {
  res.json({ products: getCatalogForAgent() });
});

export default router;
