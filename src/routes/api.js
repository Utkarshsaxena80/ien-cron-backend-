const express = require('express');
const router = express.Router();

const searchController = require('../controllers/searchController');
const trackedProductsController = require('../controllers/trackedProductsController');
const scrapeController = require('../controllers/scrapeController');

// Search Route
router.get('/search', searchController.searchProducts);

// Tracked Products Routes
router.get('/tracked-products', trackedProductsController.getTrackedProducts);
router.post('/tracked-products', trackedProductsController.createTrackedProduct);
router.delete('/tracked-products/:id', trackedProductsController.deleteTrackedProduct);

// History & Logs Routes
router.get('/tracked-products/:id/history', trackedProductsController.getProductHistory);
router.get('/tracked-products/:id/logs', trackedProductsController.getProductLogs);

// Batch Scrape Trigger Route (called by dashboard or cron-job.org)
router.post('/scrape/run', scrapeController.runBatchScrape);

// Health Check Route
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
