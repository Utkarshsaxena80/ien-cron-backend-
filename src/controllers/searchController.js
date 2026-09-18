const dotenv = require('dotenv');
dotenv.config();

const STOREFRONT_BASE_URL = process.env.STOREFRONT_BASE_URL || 'https://demo.inelabteamdev.com';

/**
 * Phase 3 — Product Search Controller
 * Searches products against live INE storefront catalog `/api/catalog`
 * Implements multi-token fuzzy matching so query terms like "larkspur speaker three"
 * find relevant items even if one word varies.
 */
async function searchProducts(req, res) {
  const queryRaw = (req.query.q || req.query.query || '').trim();
  const query = queryRaw.toLowerCase();

  try {
    // Fetch product catalog pages (page 1 & 2) to cover entire catalog
    const fetchPage = async (page) => {
      const url = `${STOREFRONT_BASE_URL.replace(/\/$/, '')}/api/catalog?page=${page}&pageSize=100`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) return [];
      const data = await response.json();
      return data.items || data.products || [];
    };

    const [page1, page2] = await Promise.all([fetchPage(1), fetchPage(2)]);
    const itemsMap = new Map();
    [...page1, ...page2].forEach(item => {
      if (item && (item.id || item.slug)) {
        itemsMap.set(String(item.id || item.slug), item);
      }
    });

    const allItems = Array.from(itemsMap.values());

    let results = allItems;

    if (query.length > 0) {
      // 1. Strict substring match
      const strictMatches = allItems.filter(item => {
        const text = `${item.name} ${item.category} ${item.brand} ${item.sku}`.toLowerCase();
        return text.includes(query);
      });

      if (strictMatches.length > 0) {
        results = strictMatches;
      } else {
        // 2. Multi-token match (match items containing any token, ranked by highest token overlap)
        const tokens = query.split(/\s+/).filter(t => t.length > 1);

        const scored = allItems.map(item => {
          const text = `${item.name} ${item.category} ${item.brand} ${item.sku}`.toLowerCase();
          let score = 0;
          tokens.forEach(token => {
            if (text.includes(token)) score += 1;
          });
          return { item, score };
        }).filter(entry => entry.score > 0);

        scored.sort((a, b) => b.score - a.score);
        results = scored.map(entry => entry.item);
      }
    }

    // Format search results
    const formatted = results.map(item => ({
      product_id: String(item.id || item.slug),
      product_name: item.name,
      brand: item.brand,
      category: item.category,
      sku: item.sku,
      product_url: `${STOREFRONT_BASE_URL.replace(/\/$/, '')}/product/${item.id || item.slug}`,
      image_url: item.image || item.imageUrl || null,
      description: item.description || ''
    }));

    return res.json({
      query: queryRaw,
      count: formatted.length,
      products: formatted
    });
  } catch (err) {
    console.error('[SearchController] Search error:', err.message);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
}

module.exports = {
  searchProducts
};
