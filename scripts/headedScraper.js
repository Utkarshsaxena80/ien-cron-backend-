/**
 * Phase 6 — Playwright Headed Scraper Script
 * Allows running the scraper with a visible browser UI for testing and demonstration.
 * Usage: npm run scrape:headed [productId]
 */

process.env.HEADLESS = 'false'; // Force visible browser mode

const { scrapeProduct } = require('../src/services/scraper/scraperService');
const { closeBrowser } = require('../src/services/scraper/browserEngine');

async function runHeadedDemo() {
  const targetId = process.argv[2] || '729'; // Default product ID or slug
  console.log(`=======================================================`);
  console.log(`  PLAYWRIGHT HEADED MODE DEMONSTRATION`);
  console.log(`  Target Product ID: ${targetId}`);
  console.log(`  Browser: VISIBLE (HEADLESS=false)`);
  console.log(`=======================================================`);

  const mockProduct = {
    id: 'headed-demo-uuid',
    product_id: targetId,
    product_name: `Headed Mode Demo Product (${targetId})`,
    product_url: `https://demo.inelabteamdev.com/product/${targetId}`
  };

  try {
    const result = await scrapeProduct(mockProduct);
    console.log(`\n---------------- DEMO RESULT ----------------`);
    console.log(JSON.stringify(result, null, 2));
    console.log(`---------------------------------------------`);
  } catch (err) {
    console.error(`\n[HeadedDemo Error]:`, err.message);
  } finally {
    await closeBrowser();
    process.exit(0);
  }
}

runHeadedDemo();
