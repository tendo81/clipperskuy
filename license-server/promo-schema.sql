-- Tabel promo_codes untuk sistem diskon web checkout
-- Jalankan di Supabase SQL Editor: https://supabase.com/dashboard/project/ioujmwlrsogwckclucpo/sql

CREATE TABLE IF NOT EXISTS promo_codes (
    id              SERIAL PRIMARY KEY,
    code            TEXT UNIQUE NOT NULL,           -- kode promo (e.g. HEMAT10)
    description     TEXT DEFAULT '',                -- deskripsi untuk admin
    discount_type   TEXT NOT NULL DEFAULT 'percent', -- 'percent' | 'flat'
    discount_value  NUMERIC NOT NULL,               -- 10 = 10% diskon, atau 15000 = Rp15.000 flat
    max_uses        INTEGER DEFAULT NULL,            -- NULL = unlimited
    used_count      INTEGER NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ DEFAULT NULL,        -- NULL = tidak ada expiry
    product_ids     TEXT[] DEFAULT NULL,             -- NULL = semua produk, ['pro_30'] = tertentu
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query cepat
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes (code);

-- Row Level Security (service role bisa akses semua)
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON promo_codes USING (true) WITH CHECK (true);

-- Contoh kode promo awal (hapus atau edit sesuka kamu)
INSERT INTO promo_codes (code, description, discount_type, discount_value, max_uses)
VALUES
    ('HEMAT10',  'Diskon 10% untuk semua produk',    'percent', 10,    100),
    ('COBA15K',  'Flat Rp15.000 off untuk Pro 30',   'flat',    15000, 50),
    ('LAUNCH20', 'Diskon 20% launch promo',           'percent', 20,    30)
ON CONFLICT (code) DO NOTHING;
