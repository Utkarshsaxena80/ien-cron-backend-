const { chromium } = require('playwright');
const dotenv = require('dotenv');
dotenv.config();

let browserInstance = null;

async function launchWithFallback(launchOptions) {
  // 1. Try default bundled chromium
  try {
    return await chromium.launch(launchOptions);
  } catch (err1) {
    console.warn('[Scraper BrowserEngine] Default Chromium launch failed, trying system Edge ("msedge")...');
    // 2. Try pre-installed Edge on Windows/Linux
    try {
      return await chromium.launch({ ...launchOptions, channel: 'msedge' });
    } catch (err2) {
      console.warn('[Scraper BrowserEngine] System Edge launch failed, trying system Chrome ("chrome")...');
      // 3. Try pre-installed Chrome
      try {
        return await chromium.launch({ ...launchOptions, channel: 'chrome' });
      } catch (err3) {
        console.error('[Scraper BrowserEngine] All browser launch options failed.');
        throw err1;
      }
    }
  }
}

async function getBrowser() {
  const isHeadless = process.env.HEADLESS !== 'false';
  if (!browserInstance || !browserInstance.isConnected()) {
    console.log(`[Scraper] Launching browser instance (headless: ${isHeadless})...`);
    const options = {
      headless: isHeadless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    };

    browserInstance = await launchWithFallback(options);
  }
  return browserInstance;
}

async function createPage() {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  return { context, page };
}

async function closeBrowser() {
  if (browserInstance) {
    console.log('[Scraper] Closing browser instance...');
    await browserInstance.close();
    browserInstance = null;
  }
}

module.exports = {
  getBrowser,
  createPage,
  closeBrowser
};
