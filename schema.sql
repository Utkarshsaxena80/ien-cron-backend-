-- Supabase PostgreSQL Database Schema for Product Price Tracker

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: tracked_products
CREATE TABLE IF NOT EXISTS tracked_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id VARCHAR(255) NOT NULL UNIQUE, -- Storefront product identifier (ID or slug)
    product_name VARCHAR(500) NOT NULL,
    product_url VARCHAR(1000) NOT NULL,
    image_url VARCHAR(1000),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for searching and status lookup
CREATE INDEX IF NOT EXISTS idx_tracked_products_active ON tracked_products(is_active);
CREATE INDEX IF NOT EXISTS idx_tracked_products_product_id ON tracked_products(product_id);

-- Table 2: price_history
-- Saved ONLY when a scrape passes validation
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    stock_status VARCHAR(255) NOT NULL,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast time-series queries per product
CREATE INDEX IF NOT EXISTS idx_price_history_product_time ON price_history(tracked_product_id, scraped_at DESC);

-- Table 3: scrape_logs
-- Every scrape attempt (SUCCESS, RETRY, FAILED) is recorded here for complete auditability
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracked_product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL CHECK (attempt_number >= 1),
    status VARCHAR(50) NOT NULL CHECK (status IN ('SUCCESS', 'RETRY', 'FAILED')),
    message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    extracted_price NUMERIC(12, 2),
    extracted_stock VARCHAR(255)
);

-- Index for querying logs by product and execution time
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time ON scrape_logs(tracked_product_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_status ON scrape_logs(status);

-- Trigger to auto-update updated_at on tracked_products
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_updated_at ON tracked_products;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON tracked_products
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
