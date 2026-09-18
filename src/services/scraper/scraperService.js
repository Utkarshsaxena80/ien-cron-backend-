const { createPage } = require('./browserEngine');
const { extractProductPage } = require('./extractor');
const { validateExtractedData } = require('./validator');
const db = require('../../config/db');
const dotenv = require('dotenv');
dotenv.config();

const TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10);
const MAX_RETRIES = parseInt(process.env.SCRAPER_MAX_RETRIES || '3', 10);

/**
 * Scrapes a single tracked product with timeout protection, bounded retries,
 * data validation, and honest logging to scrape_logs.
 *
 * @param {Object} product Tracked product object ({ id, product_id, product_name, product_url })
 * @returns {Promise<Object>} Scrape result summary
 */
async function scrapeProduct(product) {
  if (!product || (!product.id && !product.product_id)) {
    throw new Error('Invalid product provided to scraper');
  }

  const productId = product.product_id || product.id;
  const dbTrackedId = product.id;
  console.log(`[Scraper] Starting scrape workflow for product: "${product.product_name || productId}" (ID: ${dbTrackedId})`);

  let lastError = null;
  let lastExtracted = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = new Date().toISOString();
    let pageContext = null;
    let attemptStatus = 'RETRY';
    let errorMessage = '';

    console.log(`[Scraper] Product: ${productId} | Attempt ${attempt}/${MAX_RETRIES}`);

    try {
      pageContext = await createPage();
      const { page } = pageContext;

      // Wrap extraction in hard timeout promise
      const extractionPromise = extractProductPage(page, productId, TIMEOUT_MS);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Scraper timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS + 2000)
      );

      const rawResult = await Promise.race([extractionPromise, timeoutPromise]);
      lastExtracted = rawResult;

      // Validate extracted data
      const validation = validateExtractedData(rawResult);

      if (validation.valid) {
        attemptStatus = 'SUCCESS';
        const finishedAt = new Date().toISOString();
        const validData = validation.data;

        // 1. Log SUCCESS attempt
        await db.addScrapeLog({
          tracked_product_id: dbTrackedId,
          attempt_number: attempt,
          status: 'SUCCESS',
          message: `Successfully scraped price: ₹${validData.price}, stock: "${validData.stock}"`,
          started_at: startedAt,
          finished_at: finishedAt,
          extracted_price: validData.price,
          extracted_stock: validData.stock
        });

        // 2. Save ONLY validated data into price_history
        await db.addPriceHistory({
          tracked_product_id: dbTrackedId,
          price: validData.price,
          stock_status: validData.stock,
          scraped_at: finishedAt
        });

        // 3. Update tracked_product image/name if available
        if (validData.imageUrl || validData.name) {
          try {
            const current = await db.getTrackedProductById(dbTrackedId);
            if (current) {
              if (validData.imageUrl && !current.image_url) {
                current.image_url = validData.imageUrl;
              }
              if (validData.name && (!current.product_name || current.product_name === productId)) {
                current.product_name = validData.name;
              }
            }
          } catch (e) {
            // Ignore minor metadata update errors
          }
        }

        console.log(`[Scraper] SUCCESS | Product ${productId} | Attempt ${attempt} | Price: ₹${validData.price} | Stock: ${validData.stock}`);

        return {
          success: true,
          status: 'SUCCESS',
          attempt,
          price: validData.price,
          stock: validData.stock,
          scrapedAt: finishedAt
        };
      } else {
        errorMessage = `Validation failed: ${validation.error}`;
        lastError = new Error(errorMessage);
        console.warn(`[Scraper] RETRY | Product ${productId} | Attempt ${attempt} | ${errorMessage}`);
      }
    } catch (err) {
      errorMessage = err.message || 'Scrape execution error';
      lastError = err;
      console.warn(`[Scraper] RETRY | Product ${productId} | Attempt ${attempt} | Error: ${errorMessage}`);
    } finally {
      // Ensure page and context are ALWAYS closed to prevent memory leaks
      if (pageContext) {
        try {
          await pageContext.page.close();
          await pageContext.context.close();
        } catch (closeErr) {
          console.error('[Scraper] Error closing browser page context:', closeErr.message);
        }
      }
    }

    // Record RETRY log if attempt failed but retries remain
    const finishedAt = new Date().toISOString();
    if (attempt < MAX_RETRIES) {
      await db.addScrapeLog({
        tracked_product_id: dbTrackedId,
        attempt_number: attempt,
        status: 'RETRY',
        message: errorMessage,
        started_at: startedAt,
        finished_at: finishedAt,
        extracted_price: lastExtracted?.price || null,
        extracted_stock: lastExtracted?.stock || null
      });

      // Exponential Backoff delay: 1000ms * 2^(attempt-1) (1s, 2s, 4s...)
      const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
      console.log(`[Scraper] Waiting exponential backoff (${backoffMs}ms) before attempt ${attempt + 1}...`);
      await new Promise(res => setTimeout(res, backoffMs));
    } else {
      // Final attempt failed - record FAILED log
      await db.addScrapeLog({
        tracked_product_id: dbTrackedId,
        attempt_number: attempt,
        status: 'FAILED',
        message: `All ${MAX_RETRIES} attempts failed. Final error: ${errorMessage}`,
        started_at: startedAt,
        finished_at: finishedAt,
        extracted_price: null,
        extracted_stock: null
      });
    }
  }

  console.error(`[Scraper] FAILED | Product ${productId} | All ${MAX_RETRIES} attempts failed. Final error: ${lastError?.message}`);

  return {
    success: false,
    status: 'FAILED',
    attempts: MAX_RETRIES,
    error: lastError?.message || 'Scrape failed after retries'
  };
}

module.exports = {
  scrapeProduct
};
