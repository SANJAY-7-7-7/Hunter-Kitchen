-- ==============================================================================
-- Hunter's Kitchen — Production PostgreSQL Schema Migration (001_initial_schema.sql)
-- ==============================================================================

-- 1. Restaurant Settings
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'rest_hunter_01',
    restaurant_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    address TEXT NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    temporary_pause BOOLEAN NOT NULL DEFAULT FALSE,
    pause_reason TEXT DEFAULT '',
    opening_time TEXT NOT NULL DEFAULT '11:00 AM',
    closing_time TEXT NOT NULL DEFAULT '11:00 PM',
    delivery_radius_km NUMERIC(6,2) NOT NULL DEFAULT 10.00,
    base_delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 35.00,
    free_delivery_threshold NUMERIC(12,2) NOT NULL DEFAULT 500.00,
    cod_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    online_payment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    announcement TEXT DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('CUSTOMER', 'STAFF', 'ADMIN', 'OWNER', 'DELIVERY_PARTNER')),
    staff_role VARCHAR(32) CHECK (staff_role IS NULL OR staff_role IN (
        'KITCHEN_STAFF', 'GENERAL_MANAGER', 'STAFF', 'KITCHEN_MANAGER',
        'HEAD_CHEF', 'LINE_COOK', 'FRONT_DESK', 'KITCHEN_CHEF',
        'ORDER_BILLER', 'STORE_DISPATCHER'
    )),
    avatar TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED')),
    partner_status VARCHAR(32) DEFAULT 'OFFLINE' CHECK (partner_status IS NULL OR partner_status IN ('ONLINE', 'OFFLINE')),
    vehicle_number TEXT,
    vehicle_type TEXT,
    current_rating NUMERIC(3,2) DEFAULT 5.00 CHECK (current_rating >= 0 AND current_rating <= 5.00),
    total_deliveries INTEGER NOT NULL DEFAULT 0 CHECK (total_deliveries >= 0),
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    restaurant_id VARCHAR(64) DEFAULT 'rest_hunter_01',
    google_id TEXT UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- 3. User Authentication Credentials (Secure Bcrypt Hashes)
CREATE TABLE IF NOT EXISTS user_auth_credentials (
    user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    reset_password_token TEXT,
    reset_password_expires TIMESTAMPTZ,
    invite_token TEXT,
    invite_expires TIMESTAMPTZ,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    last_failed_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_cred_email ON user_auth_credentials(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_auth_reset_token ON user_auth_credentials(reset_password_token) WHERE reset_password_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_invite_token ON user_auth_credentials(invite_token) WHERE invite_token IS NOT NULL;

-- 4. Customer Addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL DEFAULT 'HOME' CHECK (type IN ('HOME', 'WORK', 'OTHER')),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    door_no TEXT NOT NULL,
    street TEXT NOT NULL,
    area TEXT NOT NULL,
    city TEXT NOT NULL,
    pincode TEXT NOT NULL,
    landmark TEXT DEFAULT '',
    instructions TEXT DEFAULT '',
    coordinates TEXT DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cust_addresses_cust_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_addresses_default ON customer_addresses(customer_id, is_default) WHERE is_default = TRUE;

-- 5. Categories
CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(64) PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order, name);

-- 6. Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
    id VARCHAR(64) PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id VARCHAR(64) NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    category_name TEXT NOT NULL,
    price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    discount_price NUMERIC(12,2) CHECK (discount_price IS NULL OR (discount_price >= 0 AND discount_price <= price)),
    image_url TEXT NOT NULL DEFAULT '',
    is_veg BOOLEAN NOT NULL DEFAULT TRUE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    prep_time_minutes INTEGER NOT NULL DEFAULT 15 CHECK (prep_time_minutes >= 0),
    is_popular BOOLEAN NOT NULL DEFAULT FALSE,
    is_bestseller BOOLEAN NOT NULL DEFAULT FALSE,
    rating NUMERIC(3,2) NOT NULL DEFAULT 5.00 CHECK (rating >= 0 AND rating <= 5.00),
    rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    customizations JSONB NOT NULL DEFAULT '[]'::jsonb,
    addons JSONB NOT NULL DEFAULT '[]'::jsonb,
    ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_cat_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_avail ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_popular ON menu_items(is_popular, is_bestseller);
CREATE INDEX IF NOT EXISTS idx_menu_items_name ON menu_items(name);

-- 7. Orders
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(64) PRIMARY KEY,
    order_number VARCHAR(64) NOT NULL UNIQUE,
    customer_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_address JSONB NOT NULL,
    order_notes TEXT DEFAULT '',
    
    subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
    delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
    tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    grand_total NUMERIC(12,2) NOT NULL CHECK (grand_total >= 0),

    payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('ONLINE', 'COD')),
    payment_status VARCHAR(32) NOT NULL CHECK (payment_status IN ('PENDING', 'VERIFIED', 'COD_PENDING', 'PAID_CASH', 'FAILED', 'REFUNDED')),
    payment_transaction_id TEXT,
    cod_cash_tendered NUMERIC(12,2) CHECK (cod_cash_tendered IS NULL OR cod_cash_tendered >= 0),
    cod_change_due NUMERIC(12,2) CHECK (cod_change_due IS NULL OR cod_change_due >= 0),

    status VARCHAR(32) NOT NULL CHECK (status IN (
        'PLACED', 'ACCEPTED', 'REJECTED', 'PREPARING', 'READY',
        'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'
    )),
    rejection_reason TEXT,
    cancellation_reason TEXT,

    assigned_staff_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    assigned_staff_name TEXT,
    assigned_delivery_partner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    assigned_delivery_partner_name TEXT,
    assigned_delivery_partner_phone TEXT,
    assigned_delivery_partner_vehicle TEXT,

    batch_id VARCHAR(64),
    checklist JSONB,
    scheduled_slot JSONB,
    has_been_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    preparing_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_partner ON orders(assigned_delivery_partner_id) WHERE assigned_delivery_partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id) WHERE batch_id IS NOT NULL;

-- 8. Order Items (Snapshot at order time)
CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    is_veg BOOLEAN NOT NULL DEFAULT TRUE,
    customizations JSONB NOT NULL DEFAULT '[]'::jsonb,
    addons JSONB NOT NULL DEFAULT '[]'::jsonb,
    special_instructions TEXT DEFAULT '',
    total_price NUMERIC(12,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- 9. Order Events (Audit trail of status transitions)
CREATE TABLE IF NOT EXISTS order_events (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by TEXT NOT NULL,
    changed_by_role VARCHAR(32) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id ON order_events(order_id, timestamp ASC);

-- 10. Delivery Batches
CREATE TABLE IF NOT EXISTS delivery_batches (
    id VARCHAR(64) PRIMARY KEY,
    batch_number VARCHAR(64) NOT NULL UNIQUE,
    delivery_partner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    delivery_partner_name TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'IN_TRANSIT', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS delivery_batch_orders (
    batch_id VARCHAR(64) NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sequence_order INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (batch_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_batches_partner ON delivery_batches(delivery_partner_id, status);

-- 11. COD Transactions & Settlements
CREATE TABLE IF NOT EXISTS cod_transactions (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    order_number VARCHAR(64) NOT NULL,
    delivery_partner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    amount_expected NUMERIC(12,2) NOT NULL CHECK (amount_expected >= 0),
    amount_collected NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (amount_collected >= 0),
    cash_tendered NUMERIC(12,2),
    change_due NUMERIC(12,2),
    collection_status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (collection_status IN ('PENDING', 'COLLECTED', 'FAILED')),
    settlement_status VARCHAR(32) NOT NULL DEFAULT 'UNSETTLED' CHECK (settlement_status IN ('UNSETTLED', 'SETTLED')),
    collected_at TIMESTAMPTZ,
    settled_at TIMESTAMPTZ,
    settled_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_partner_status ON cod_transactions(delivery_partner_id, settlement_status);
CREATE INDEX IF NOT EXISTS idx_cod_order_id ON cod_transactions(order_id);

-- 12. Reviews
CREATE TABLE IF NOT EXISTS reviews (
    id VARCHAR(64) PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    customer_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    food_rating NUMERIC(2,1) NOT NULL CHECK (food_rating >= 1.0 AND food_rating <= 5.0),
    delivery_rating NUMERIC(2,1) NOT NULL CHECK (delivery_rating >= 1.0 AND delivery_rating <= 5.0),
    overall_rating NUMERIC(2,1) NOT NULL CHECK (overall_rating >= 1.0 AND overall_rating <= 5.0),
    comment TEXT DEFAULT '',
    item_ratings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);

-- 13. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_role VARCHAR(32) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(32) NOT NULL CHECK (type IN ('ORDER', 'PAYMENT', 'OFFER', 'SYSTEM')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);

-- 14. Audit Logs with Cryptographic Hash Chaining
CREATE TABLE IF NOT EXISTS audit_logs (
    sequence_number BIGSERIAL PRIMARY KEY,
    id VARCHAR(64) NOT NULL UNIQUE,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    old_value JSON,
    new_value JSON,
    request_id TEXT NOT NULL,
    ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    previous_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- 15. Transactional Outbox Pattern
CREATE TABLE IF NOT EXISTS outbox_events (
    id VARCHAR(64) PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    last_error TEXT,
    processing_started_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, next_retry_at, created_at ASC)
WHERE status IN ('PENDING', 'FAILED');

-- 16. Idempotency Records
CREATE TABLE IF NOT EXISTS idempotency_records (
    key VARCHAR(255) PRIMARY KEY,
    request_path TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);

-- 17. Inventory Tracking
CREATE TABLE IF NOT EXISTS inventory_items (
    id VARCHAR(64) PRIMARY KEY,
    menu_item_id VARCHAR(64) NOT NULL UNIQUE REFERENCES menu_items(id) ON DELETE CASCADE,
    available_quantity INTEGER NOT NULL DEFAULT 100 CHECK (available_quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
    is_unlimited BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id BIGSERIAL PRIMARY KEY,
    menu_item_id VARCHAR(64) NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    order_id VARCHAR(64) REFERENCES orders(id) ON DELETE SET NULL,
    change_quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON inventory_transactions(menu_item_id, created_at DESC);
