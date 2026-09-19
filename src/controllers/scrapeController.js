const db = require('../config/db');
const { scrapeProduct } = require('../services/scraper/scraperService');
const dotenv = require('dotenv');
dotenv.config();

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Phase 7 & 8 — Scrape Batch Controller
 * Endpoint called by cron-job.org or manual dashboard button
 */
async function runBatchScrape(req, res) {
  if (CRON_SECRET && CRON_SECRET !== 'dev-cron-secret-12345') {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const querySecret = req.query.secret;

    if (token !== CRON_SECRET && querySecret !== CRON_SECRET) {
      console.warn('[ScrapeController] Unauthorized batch scrape request blocked');
      return res.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET token' });
    }
  }

  res.status(202).json({
    message: 'Batch scrape started',
    timestamp: new Date().toISOString()
  });

  runBatchScrapeJob().catch(err => {
    console.error('[ScrapeController] Background batch scrape failed:', err.message);
  });
}

async function runBatchScrapeJob() {
  try {
    // 1. Fetch active tracked products
    const activeProducts = await db.getTrackedProducts(true);

    if (!activeProducts || activeProducts.length === 0) {
      console.log('[ScrapeController] No active products found to scrape.');
      return {
        total: 0,
        successful: 0,
        failed: 0,
        retried: 0,
        message: 'No active products found to scrape.'
      };
    }

    console.log(`[ScrapeController] Starting batch scrape for ${activeProducts.length} active products...`);

    const results = [];
    let successfulCount = 0;
    let failedCount = 0;
    let retriedCount = 0;

    // 2. Process products sequentially to isolate failures and maintain stability
    for (const product of activeProducts) {
      try {
        const scrapeRes = await scrapeProduct(product);

        if (scrapeRes.attempt && scrapeRes.attempt > 1) {
          retriedCount += (scrapeRes.attempt - 1);
        }

        if (scrapeRes.success) {
          successfulCount++;
          results.push({
            id: product.id,
            product_id: product.product_id,
            name: product.product_name,
            status: 'SUCCESS',
            price: scrapeRes.price,
            stock: scrapeRes.stock,
            attempts: scrapeRes.attempt
          });
        } else {
          failedCount++;
          results.push({
            id: product.id,
            product_id: product.product_id,
            name: product.product_name,
            status: 'FAILED',
            error: scrapeRes.error,
            attempts: scrapeRes.attempts
          });
        }
      } catch (productError) {
        // Multi-product resilience: continue scraping remaining products even if one throws an uncaught error
        failedCount++;
        console.error(`[ScrapeController] Unhandled error scraping product ${product.product_id}:`, productError.message);
        results.push({
          id: product.id,
          product_id: product.product_id,
          name: product.product_name,
          status: 'FAILED',
          error: productError.message
        });
      }
    }

    console.log(`[ScrapeController] Batch scrape complete. Total: ${activeProducts.length} | Success: ${successfulCount} | Failed: ${failedCount}`);

    return {
      total: activeProducts.length,
      successful: successfulCount,
      failed: failedCount,
      retried: retriedCount,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[ScrapeController] Batch scrape error:', err.message);
    throw err;
  }
}

module.exports = {
  runBatchScrape
};
