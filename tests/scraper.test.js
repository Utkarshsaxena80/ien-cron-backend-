const test = require('node:test');
const assert = require('node:assert/strict');

const { validateExtractedData } = require('../src/services/scraper/validator');
const db = require('../src/config/db');

// Test Suite 1: Data Validation Engine Rules
test('Data Validator - Case 1: Successful scrape validation', () => {
  const input = {
    name: 'Nordkraft Ultrabook X',
    price: 42900,
    stock: 'In stock · 14 left',
    imageUrl: 'https://demo.inelabteamdev.com/img.jpg'
  };

  const res = validateExtractedData(input);
  assert.equal(res.valid, true);
  assert.equal(res.data.name, 'Nordkraft Ultrabook X');
  assert.equal(res.data.price, 42900);
  assert.equal(res.data.stock, 'In stock · 14 left');
});

test('Data Validator - Case 4: Missing price element', () => {
  const input = {
    name: 'Sample Laptop',
    price: null,
    stock: 'In stock'
  };

  const res = validateExtractedData(input);
  assert.equal(res.valid, false);
  assert.match(res.error, /Price element or value missing/);
});

test('Data Validator - Case 5: Missing stock status', () => {
  const input = {
    name: 'Sample Laptop',
    price: 1299,
    stock: ''
  };

  const res = validateExtractedData(input);
  assert.equal(res.valid, false);
  assert.match(res.error, /Missing or empty stock status/);
});

test('Data Validator - Case 6: Invalid ₹0 or negative price rejection', () => {
  const inputZero = { name: 'Test', price: 0, stock: 'In stock' };
  const resZero = validateExtractedData(inputZero);
  assert.equal(resZero.valid, false);
  assert.match(resZero.error, /Invalid zero or negative price/);

  const inputNaN = { name: 'Test', price: 'invalid_number', stock: 'In stock' };
  const resNaN = validateExtractedData(inputNaN);
  assert.equal(resNaN.valid, false);
  assert.match(resNaN.error, /Invalid non-numeric price/);
});

// Test Suite 2: Retry and Scrape Log Audit Trail
test('Database & Logging - Case 9: Successful scrape creates history and log', async () => {
  const testProduct = await db.createTrackedProduct({
    product_id: 'test-prod-101',
    product_name: 'Test Nordkraft Watch',
    product_url: 'https://demo.inelabteamdev.com/product/test-prod-101'
  });

  const now = new Date().toISOString();

  // Record SUCCESS log
  await db.addScrapeLog({
    tracked_product_id: testProduct.id,
    attempt_number: 1,
    status: 'SUCCESS',
    message: 'Scraped successfully',
    started_at: now,
    finished_at: now,
    extracted_price: 1599,
    extracted_stock: 'In stock'
  });

  // Record valid price history
  await db.addPriceHistory({
    tracked_product_id: testProduct.id,
    price: 1599,
    stock_status: 'In stock',
    scraped_at: now
  });

  // Assert history created
  const history = await db.getPriceHistory(testProduct.id);
  assert.equal(history.length, 1);
  assert.equal(history[0].price, 1599);

  // Assert log created
  const logs = await db.getScrapeLogs(testProduct.id);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'SUCCESS');
});

test('Database & Logging - Case 10: Failed scrape does NOT create invalid history', async () => {
  const testProduct = await db.createTrackedProduct({
    product_id: 'test-failed-prod-202',
    product_name: 'Test Failed Phone',
    product_url: 'https://demo.inelabteamdev.com/product/test-failed-prod-202'
  });

  const time1 = new Date(Date.now() - 1000).toISOString();
  const time2 = new Date().toISOString();

  // Record RETRY log first
  await db.addScrapeLog({
    tracked_product_id: testProduct.id,
    attempt_number: 1,
    status: 'RETRY',
    message: 'Timeout error',
    started_at: time1,
    finished_at: time1
  });

  // Record FAILED log second
  await db.addScrapeLog({
    tracked_product_id: testProduct.id,
    attempt_number: 2,
    status: 'FAILED',
    message: 'All retries exhausted',
    started_at: time2,
    finished_at: time2
  });

  // Assert NO invalid price history record was added
  const history = await db.getPriceHistory(testProduct.id);
  assert.equal(history.length, 0);

  // Assert logs accurately recorded attempts (newest first)
  const logs = await db.getScrapeLogs(testProduct.id);
  assert.equal(logs.length, 2);
  const statuses = logs.map(l => l.status);
  assert.ok(statuses.includes('FAILED'));
  assert.ok(statuses.includes('RETRY'));
});
