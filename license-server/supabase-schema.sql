-- ============================================================
-- ClipperSkuy License Server — Supabase Schema
-- Run this SQL in your Supabase SQL Editor
-- ============================================================

-- 1. License Keys Table
CREATE TABLE IF NOT EXISTS license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key VARCHAR(19) UNIQUE NOT NULL,
    tier VARCHAR(20) NOT NULL DEFAULT 'pro',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    duration_days INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    max_activations INTEGER DEFAULT 1,
    max_transfers INTEGER DEFAULT 2,
    deactivation_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. License Activations Table (tracks which machines activated which keys)
CREATE TABLE IF NOT EXISTS license_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key_id UUID REFERENCES license_keys(id) ON DELETE CASCADE,
    machine_id VARCHAR(64) NOT NULL,
    machine_name VARCHAR(255),
    ip_address VARCHAR(45),
    app_version VARCHAR(20),
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ,
    UNIQUE(license_key_id, machine_id)
);

-- 3. Audit Log (track all license events)
CREATE TABLE IF NOT EXISTS license_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key_id UUID REFERENCES license_keys(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    machine_id VARCHAR(64),
    ip_address VARCHAR(45),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_license_keys_key ON license_keys(license_key);
CREATE INDEX IF NOT EXISTS idx_license_keys_status ON license_keys(status);
CREATE INDEX IF NOT EXISTS idx_activations_key_id ON license_activations(license_key_id);
CREATE INDEX IF NOT EXISTS idx_activations_machine ON license_activations(machine_id);
CREATE INDEX IF NOT EXISTS idx_audit_key_id ON license_audit_log(license_key_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON license_audit_log(created_at DESC);

-- 5. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER license_keys_updated_at
    BEFORE UPDATE ON license_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 6. Row Level Security (RLS)
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (used by our API)
CREATE POLICY "Service role full access on license_keys" ON license_keys
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on license_activations" ON license_activations
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on license_audit_log" ON license_audit_log
    FOR ALL USING (true) WITH CHECK (true);
