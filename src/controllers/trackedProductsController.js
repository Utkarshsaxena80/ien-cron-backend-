const db = require('../config/db');
const { scrapeProduct } = require('../services/scraper/scraperService');

/**
 * Phase 4 — Product Tracking Controller
 */

async function getTrackedProducts(req, res) {
  try {
    const products = await db.getTrackedProducts(false); // get all tracked products

    // Enrich products with latest price history & scrape log status
    const enriched = await Promise.all(
      products.map(async (prod) => {
        const latestHistory = await db.getLatestPriceHistory(prod.id);
        const logs = await db.getScrapeLogs(prod.id, 1);
        const latestLog = logs[0] || null;

        // Price drop calculation (Bonus 3)
        const historyList = await db.getPriceHistory(prod.id, 5);
        let priceDrop = null;
        if (historyList.length >= 2) {
          const currentPrice = historyList[historyList.length - 1].price;
          const prevPrice = historyList[historyList.length - 2].price;
          if (currentPrice < prevPrice) {
            priceDrop = {
              amount: prevPrice - currentPrice,
              percentage: (((prevPrice - currentPrice) / prevPrice) * 100).toFixed(1)
            };
          }
        }

        return {
          ...prod,
          current_price: latestHistory ? latestHistory.price : null,
          current_stock: latestHistory ? latestHistory.stock_status : null,
          last_scraped_at: latestHistory ? latestHistory.scraped_at : (latestLog ? latestLog.finished_at : null),
          latest_status: latestLog ? latestLog.status : 'PENDING',
          price_drop: priceDrop
        };
      })
    );

    return res.json({ products: enriched });
  } catch (err) {
    console.error('[TrackedProductsController] Get list error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve tracked products', details: err.message });
  }
}

async function createTrackedProduct(req, res) {
  const { product_id, product_name, product_url, image_url } = req.body;

  if (!product_id || !product_name || !product_url) {
    return res.status(400).json({ error: 'Missing required fields: product_id, product_name, product_url' });
  }

  try {
    // 1. Create or re-activate in DB
    const tracked = await db.createTrackedProduct({
      product_id: String(product_id),
      product_name,
      product_url,
      image_url: image_url || null
    });

    // 2. Trigger async initial scrape in background so user doesn't wait indefinitely, or execute instant scrape
    scrapeProduct(tracked).catch(err => {
      console.error(`[TrackedProductsController] Initial background scrape failed for ${product_id}:`, err.message);
    });

    return res.status(201).json({
      message: 'Product added to price tracker successfully. Initial scrape initiated.',
      product: tracked
    });
  } catch (err) {
    console.error('[TrackedProductsController] Create error:', err.message);
    return res.status(500).json({ error: 'Failed to track product', details: err.message });
  }
}

async function deleteTrackedProduct(req, res) {
  const { id } = req.params;

  try {
    await db.deleteTrackedProduct(id);
    return res.json({ message: 'Product untracked successfully', id });
  } catch (err) {
    console.error('[TrackedProductsController] Delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete tracked product', details: err.message });
  }
}

async function getProductHistory(req, res) {
  const { id } = req.params;
  const limit = parseInt(req.query.limit || '100', 10);

  try {
    const history = await db.getPriceHistory(id, limit);
    return res.json({ tracked_product_id: id, count: history.length, history });
  } catch (err) {
    console.error('[TrackedProductsController] History error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve price history', details: err.message });
  }
}

async function getProductLogs(req, res) {
  const { id } = req.params;
  const limit = parseInt(req.query.limit || '50', 10);

  try {
    const logs = await db.getScrapeLogs(id === 'all' ? null : id, limit);
    return res.json({ tracked_product_id: id, count: logs.length, logs });
  } catch (err) {
    console.error('[TrackedProductsController] Logs error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve scrape logs', details: err.message });
  }
}

module.exports = {
  getTrackedProducts,
  createTrackedProduct,
  deleteTrackedProduct,
  getProductHistory,
  getProductLogs
};
