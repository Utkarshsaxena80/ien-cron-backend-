const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
require('express-async-errors');

dotenv.config();

const apiRoutes = require('./routes/api');
const { closeBrowser } = require('./services/scraper/browserEngine');

const app = express();
const PORT = process.env.PORT || 5000;

// Production CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173']
  : '*';

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman, or server-to-server)
    if (!origin || allowedOrigins === '*') {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive fallback for production storefront demo deployments
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Express Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | Duration: ${duration}ms`);
  });
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'INE Product Price Tracker API',
    status: 'Running',
    documentation: '/api/health'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[ServerError] Unhandled Exception:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Product Price Tracker Backend Server running on port ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`  Storefront Target: ${process.env.STOREFRONT_BASE_URL || 'https://demo.inelabteamdev.com'}`);
  console.log(`  CORS: Enabled for all origins / Vercel / Render / Localhost`);
  console.log(`=======================================================`);
});

// Graceful Shutdown Handler for Playwright browser resources and Express
async function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    console.log('[Server] HTTP server closed.');
    await closeBrowser();
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;
