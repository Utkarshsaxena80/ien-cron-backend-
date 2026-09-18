const dotenv = require('dotenv');
dotenv.config();

const STOREFRONT_BASE_URL = process.env.STOREFRONT_BASE_URL || 'https://demo.inelabteamdev.com';

/**
 * Extracts product details (Name, Price, Stock) from the INE mock storefront using Playwright.
 * Satisfies anti-scraping interaction requirements (Ar: minMoves=8, minDwellMs=600, throttling=40ms).
 */
async function extractProductPage(page, productIdentifier, timeoutMs = 15000) {
  const targetUrl = productIdentifier.startsWith('http')
    ? productIdentifier
    : `${STOREFRONT_BASE_URL.replace(/\/$/, '')}/product/${productIdentifier}`;

  console.log(`[Scraper Extractor] Navigating to: ${targetUrl}`);

  // Navigate to target URL
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs
  });

  // 1. Check for 404 or Error Page
  const is404 = await page.locator('.error-page, h1:has-text("404"), h1:has-text("Not Found")').count();
  if (is404 > 0) {
    throw new Error(`Product page not found (404) at ${targetUrl}`);
  }

  // 2. Wait for detail container & heading element to be visible
  const titleLocator = page.locator('.detail-card h1, .detail-card h2, .detail-info h1, .detail-info h2, h1, h2').first();
  await titleLocator.waitFor({ state: 'visible', timeout: Math.min(timeoutMs, 8000) });

  let name = (await titleLocator.innerText()).trim();

  if (!name) {
    const headings = await page.locator('h1, h2').allInnerTexts();
    name = headings.find(h => h && h.length > 2 && !h.includes('Specifications') && !h.includes('INE Store')) || '';
  }

  // 3. Explicitly target .price-block element and ensure it is scrolled into view
  const priceBlockLocator = page.locator('.price-block').first();

  if (await priceBlockLocator.count() === 0) {
    throw new Error('STRUCTURE_CHANGE_DETECTED: Price container selector (.price-block) not found on page');
  }

  await priceBlockLocator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  const box = await priceBlockLocator.boundingBox();
  if (box) {
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Move mouse to center of .price-block
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(100);

    // Perform 15 mouse movements spaced at 70ms apart (>40ms requirement limit)
    for (let i = 0; i < 15; i++) {
      const offsetX = (i % 2 === 0 ? 30 : -30);
      const offsetY = (i % 3 === 0 ? 10 : -10);
      await page.mouse.move(startX + offsetX, startY + offsetY);
      await page.waitForTimeout(70);
    }

    // Dwell inside .price-block for 1000ms (>600ms requirement)
    await page.waitForTimeout(1000);

    // Click button inside .price-block with force option
    const button = page.locator('.price-block button').first();
    if (await button.count() > 0) {
      try {
        await button.click({ force: true });
      } catch (e) {
        console.warn('[Scraper Extractor] Button click warning:', e.message);
      }
    }
  }

  // 4. Poll DOM for quote resolution & decrypted price (handles artificial retry delays up to 7s)
  let extractedPrice = null;
  let extractedStock = null;
  let rawPriceText = '';

  const pollStartTime = Date.now();
  while (Date.now() - pollStartTime < 7500) {
    const blockText = await priceBlockLocator.innerText();

    // Priority 1: Deal price ₹XX,XXX or Sale price ₹XX,XXX
    const dealMatch = blockText.match(/(?:Deal price|Sale price|Special price)\s*(?:₹|Rs\.?|INR)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
    // Priority 2: Standard currency match ₹XX,XXX
    const genMatch = blockText.match(/(?:₹|Rs\.?|INR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);

    const priceMatch = dealMatch || genMatch;
    if (priceMatch) {
      rawPriceText = priceMatch[0];
      const cleanNum = priceMatch[1].replace(/,/g, '');
      const parsed = parseFloat(cleanNum);
      if (!isNaN(parsed) && parsed > 0) {
        extractedPrice = parsed;
      }
    }

    // Comprehensive Stock Status Extraction
    const stockMatch = blockText.match(/IN STOCK[^\n\.\,]*/i) ||
                       blockText.match(/ONLY \d+ LEFT[^\n\.\,]*/i) ||
                       blockText.match(/OUT OF STOCK[^\n\.\,]*/i) ||
                       blockText.match(/\d+ IN STOCK[^\n\.\,]*/i) ||
                       blockText.match(/In stock[^\n\.\,]*/i) ||
                       blockText.match(/\d+\s*left[^\n\.\,]*/i);

    if (stockMatch) {
      extractedStock = stockMatch[0].trim();
    } else if (extractedPrice !== null && (blockText.includes('Get it by') || blockText.includes('Sold by') || blockText.includes('ratings'))) {
      extractedStock = 'In stock'; // Default fallback when price quote is active
    }

    if (extractedPrice !== null && extractedStock !== null) {
      break;
    }

    await page.waitForTimeout(400);
  }

  // Fallback stock check against full body if not in .price-block
  if (!extractedStock) {
    const bodyText = await page.innerText('body');
    const fallbackStock = bodyText.match(/IN STOCK[^\n\.\,]*/i) || bodyText.match(/In stock[^\n\.\,]*/i);
    if (fallbackStock) {
      extractedStock = fallbackStock[0].trim();
    } else if (extractedPrice !== null) {
      extractedStock = 'In stock';
    }
  }

  // Image URL Extraction
  let imageUrl = null;
  const imgLocator = page.locator('.detail img, .product-image img, img[src*="product"]').first();
  if (await imgLocator.count() > 0) {
    imageUrl = await imgLocator.getAttribute('src');
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = new URL(imageUrl, STOREFRONT_BASE_URL).href;
    }
  }

  return {
    name,
    price: extractedPrice,
    stock: extractedStock,
    rawPriceText,
    imageUrl,
    url: targetUrl
  };
}

module.exports = {
  extractProductPage
};
