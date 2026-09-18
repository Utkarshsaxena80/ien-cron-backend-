/**
 * Data Validator for Price Tracker Scraper
 * Enforces strict validation rules:
 * - NEVER save ₹0 or NaN as a valid price
 * - Reject null, undefined, or empty stock status
 * - Ensure product title/ID is confirmed
 */

function validateExtractedData(data) {
  if (!data) {
    return { valid: false, error: 'Empty extraction result' };
  }

  // 1. Product existence check
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return { valid: false, error: 'Missing or empty product name' };
  }

  // 2. Price existence and numerical validity check
  if (data.price === null || data.price === undefined) {
    return { valid: false, error: 'Price element or value missing' };
  }

  const numericPrice = typeof data.price === 'number' ? data.price : parseFloat(data.price);
  if (isNaN(numericPrice) || !isFinite(numericPrice)) {
    return { valid: false, error: `Invalid non-numeric price value: ${data.price}` };
  }

  if (numericPrice <= 0) {
    return { valid: false, error: `Invalid zero or negative price: ₹${numericPrice}` };
  }

  // 3. Stock status validation
  if (!data.stock || typeof data.stock !== 'string' || data.stock.trim().length === 0) {
    return { valid: false, error: 'Missing or empty stock status' };
  }

  const lowerStock = data.stock.toLowerCase();
  const validStockKeywords = ['in stock', 'left', 'selling fast', 'hurry', 'out of stock', 'available', 'unavailable'];
  const isValidStock = validStockKeywords.some(kw => lowerStock.includes(kw));

  if (!isValidStock) {
    return { valid: false, error: `Unrecognized stock status format: "${data.stock}"` };
  }

  return {
    valid: true,
    data: {
      name: data.name.trim(),
      price: numericPrice,
      stock: data.stock.trim(),
      imageUrl: data.imageUrl || null
    }
  };
}

module.exports = {
  validateExtractedData
};
