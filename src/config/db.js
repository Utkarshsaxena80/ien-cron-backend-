const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let isMock = false;

// Check if valid Supabase credentials are provided
const isValidKey = supabaseKey &&
  !supabaseKey.startsWith('your-') &&
  !supabaseKey.startsWith('dummy') &&
  supabaseKey.length > 20;

if (supabaseUrl && supabaseUrl.includes('supabase.co') && isValidKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[Database] Connected to Supabase Cloud PostgreSQL');
  } catch (err) {
    console.warn('[Database] Failed to initialize Supabase client:', err.message);
    isMock = true;
  }
} else {
  console.log('[Database] Using embedded in-memory database store (Supabase Cloud key pending).');
  isMock = true;
}

// In-Memory Database Store fallback (used if running locally without active Supabase credentials)
const memoryStore = {
  tracked_products: [],
  price_history: [],
  scrape_logs: []
};

// Database Service Interface
const db = {
  isMock,

  // Tracked Products
  async getTrackedProducts(activeOnly = false) {
    if (supabase) {
      let query = supabase.from('tracked_products').select('*').order('created_at', { ascending: false });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
    let res = memoryStore.tracked_products;
    if (activeOnly) res = res.filter(p => p.is_active);
    return res;
  },

  async getTrackedProductById(id) {
    if (supabase) {
      const { data, error } = await supabase.from('tracked_products').select('*').eq('id', id).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    }
    return memoryStore.tracked_products.find(p => p.id === id || p.product_id === id) || null;
  },

  async getTrackedProductByProductId(productId) {
    if (supabase) {
      const { data, error } = await supabase.from('tracked_products').select('*').eq('product_id', String(productId)).single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    }
    return memoryStore.tracked_products.find(p => p.product_id === String(productId)) || null;
  },

  async createTrackedProduct({ product_id, product_name, product_url, image_url }) {
    const newRecord = {
      id: crypto.randomUUID(),
      product_id: String(product_id),
      product_name,
      product_url,
      image_url: image_url || null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase
        .from('tracked_products')
        .insert({
          product_id: String(product_id),
          product_name,
          product_url,
          image_url: image_url || null,
          is_active: true
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    // Check duplicate
    const existing = memoryStore.tracked_products.find(p => p.product_id === String(product_id));
    if (existing) {
      existing.is_active = true;
      existing.updated_at = new Date().toISOString();
      return existing;
    }
    memoryStore.tracked_products.push(newRecord);
    return newRecord;
  },

  async updateTrackedProductStatus(id, isActive) {
    if (supabase) {
      const { data, error } = await supabase
        .from('tracked_products')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const item = memoryStore.tracked_products.find(p => p.id === id || p.product_id === id);
    if (item) {
      item.is_active = isActive;
      item.updated_at = new Date().toISOString();
    }
    return item;
  },

  async deleteTrackedProduct(id) {
    if (supabase) {
      const { error } = await supabase.from('tracked_products').delete().eq('id', id);
      if (error) throw error;
      return true;
    }
    memoryStore.tracked_products = memoryStore.tracked_products.filter(p => p.id !== id && p.product_id !== id);
    return true;
  },

  // Price History
  async addPriceHistory({ tracked_product_id, price, stock_status, scraped_at }) {
    const record = {
      id: crypto.randomUUID(),
      tracked_product_id,
      price: parseFloat(price),
      stock_status,
      scraped_at: scraped_at || new Date().toISOString()
    };

    if (supabase) {
      const { data, error } = await supabase.from('price_history').insert({
        tracked_product_id,
        price: parseFloat(price),
        stock_status,
        scraped_at: record.scraped_at
      }).select().single();
      if (error) throw error;
      return data;
    }

    memoryStore.price_history.push(record);
    return record;
  },

  async getPriceHistory(trackedProductId, limit = 50) {
    if (supabase) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('tracked_product_id', trackedProductId)
        .order('scraped_at', { ascending: true })
        .limit(limit);
      if (error) throw error;
      return data;
    }
    return memoryStore.price_history
      .filter(h => h.tracked_product_id === trackedProductId)
      .sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at))
      .slice(-limit);
  },

  async getLatestPriceHistory(trackedProductId) {
    if (supabase) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('tracked_product_id', trackedProductId)
        .order('scraped_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    }
    const list = memoryStore.price_history
      .filter(h => h.tracked_product_id === trackedProductId)
      .sort((a, b) => new Date(b.scraped_at) - new Date(a.scraped_at));
    return list[0] || null;
  },

  // Scrape Logs
  async addScrapeLog({ tracked_product_id, attempt_number, status, message, started_at, finished_at, extracted_price, extracted_stock }) {
    const record = {
      id: crypto.randomUUID(),
      tracked_product_id,
      attempt_number,
      status,
      message: message || '',
      started_at,
      finished_at: finished_at || new Date().toISOString(),
      extracted_price: extracted_price != null ? parseFloat(extracted_price) : null,
      extracted_stock: extracted_stock || null
    };

    if (supabase) {
      const { data, error } = await supabase.from('scrape_logs').insert({
        tracked_product_id,
        attempt_number,
        status,
        message: message || '',
        started_at,
        finished_at: record.finished_at,
        extracted_price: record.extracted_price,
        extracted_stock: record.extracted_stock
      }).select().single();
      if (error) throw error;
      return data;
    }

    memoryStore.scrape_logs.push(record);
    return record;
  },

  async getScrapeLogs(trackedProductId = null, limit = 50) {
    if (supabase) {
      let query = supabase.from('scrape_logs').select('*').order('started_at', { ascending: false }).limit(limit);
      if (trackedProductId) query = query.eq('tracked_product_id', trackedProductId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
    let res = memoryStore.scrape_logs;
    if (trackedProductId) res = res.filter(l => l.tracked_product_id === trackedProductId);
    return res.sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, limit);
  }
};

module.exports = db;
