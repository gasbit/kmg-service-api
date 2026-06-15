-- KMG-SERVICE PostgreSQL schema
-- สำหรับรันใน DBeaver: เปิด SQL Editor, เลือก database/schema ที่ต้องการ แล้ว Execute script
-- Default admin seed: username = admin, password = admin1234

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(id),
  name VARCHAR(100) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  brand VARCHAR(100) NOT NULL,
  weight_kg DECIMAL(10, 2) NOT NULL,
  exchange_cost_price DECIMAL(12, 2) NOT NULL,
  exchange_sale_price DECIMAL(12, 2) NOT NULL,
  full_tank_price DECIMAL(12, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_products_weight_positive CHECK (weight_kg > 0),
  CONSTRAINT chk_products_prices_non_negative CHECK (
    exchange_cost_price >= 0
    AND exchange_sale_price >= 0
    AND full_tank_price >= 0
  )
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  transaction_no VARCHAR(50) NOT NULL UNIQUE,
  transaction_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  queue_date DATE,
  queue_no INTEGER,
  customer_id BIGINT REFERENCES customers(id),
  customer_name_snapshot VARCHAR(150) NOT NULL,
  customer_phone_snapshot VARCHAR(50),
  customer_address_snapshot TEXT,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP(3),
  CONSTRAINT uq_transactions_queue UNIQUE (queue_date, queue_no),
  CONSTRAINT chk_transactions_type CHECK (
    transaction_type IN (
      'DELIVERY_EXCHANGE',
      'WALK_IN_EXCHANGE',
      'BORROW_CYLINDER',
      'RETURN_CYLINDER',
      'BUY_FULL_TANK'
    )
  ),
  CONSTRAINT chk_transactions_status CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  ),
  CONSTRAINT chk_transactions_total_non_negative CHECK (total_amount >= 0),
  CONSTRAINT chk_transactions_queue_pair CHECK (
    (queue_date IS NULL AND queue_no IS NULL)
    OR (queue_date IS NOT NULL AND queue_no IS NOT NULL AND queue_no > 0)
  )
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id),
  product_id BIGINT NOT NULL REFERENCES products(id),
  product_brand_snapshot VARCHAR(100) NOT NULL,
  product_weight_snapshot DECIMAL(10, 2) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  cost_price DECIMAL(12, 2) NOT NULL,
  line_total DECIMAL(12, 2) NOT NULL,
  item_action VARCHAR(50) NOT NULL,
  note TEXT,
  CONSTRAINT chk_transaction_items_action CHECK (
    item_action IN ('EXCHANGE', 'BORROW', 'RETURN', 'BUY_FULL_TANK')
  ),
  CONSTRAINT chk_transaction_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_transaction_items_amounts_non_negative CHECK (
    unit_price >= 0
    AND cost_price >= 0
    AND line_total >= 0
  )
);

CREATE TABLE IF NOT EXISTS transaction_status_logs (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id),
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  changed_by BIGINT NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,
  CONSTRAINT chk_transaction_status_logs_from_status CHECK (
    from_status IS NULL
    OR from_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  ),
  CONSTRAINT chk_transaction_status_logs_to_status CHECK (
    to_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  )
);

CREATE TABLE IF NOT EXISTS cylinder_loans (
  id BIGSERIAL PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES transactions(id),
  transaction_item_id BIGINT NOT NULL UNIQUE REFERENCES transaction_items(id),
  customer_id BIGINT REFERENCES customers(id),
  customer_name_snapshot VARCHAR(150) NOT NULL,
  customer_phone_snapshot VARCHAR(50),
  customer_address_snapshot TEXT,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  loan_status VARCHAR(50) NOT NULL,
  borrowed_date DATE NOT NULL,
  expected_return_date DATE,
  returned_date DATE,
  deposit_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_cylinder_loans_status CHECK (
    loan_status IN ('BORROWED', 'PARTIAL_RETURNED', 'RETURNED', 'OVERDUE', 'CANCELLED')
  ),
  CONSTRAINT chk_cylinder_loans_quantity_positive CHECK (quantity > 0),
  CONSTRAINT chk_cylinder_loans_deposit_non_negative CHECK (deposit_amount >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL UNIQUE REFERENCES products(id),
  full_qty INTEGER NOT NULL DEFAULT 0,
  empty_qty INTEGER NOT NULL DEFAULT 0,
  loaned_qty INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_inventory_balances_non_negative CHECK (
    full_qty >= 0
    AND empty_qty >= 0
    AND loaned_qty >= 0
  )
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  transaction_id BIGINT REFERENCES transactions(id),
  movement_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_inventory_movements_type CHECK (
    movement_type IN ('FULL_OUT', 'EMPTY_IN', 'LOAN_OUT', 'LOAN_RETURN', 'ADJUSTMENT')
  ),
  CONSTRAINT chk_inventory_movements_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_transactions_type
  ON transactions(transaction_type);

CREATE INDEX IF NOT EXISTS idx_transactions_customer_phone
  ON transactions(customer_phone_snapshot);

CREATE INDEX IF NOT EXISTS idx_loans_status
  ON cylinder_loans(loan_status);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_created
  ON inventory_movements(product_id, created_at);

DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON transactions;
CREATE TRIGGER trg_transactions_updated_at
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cylinder_loans_updated_at ON cylinder_loans;
CREATE TRIGGER trg_cylinder_loans_updated_at
BEFORE UPDATE ON cylinder_loans
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_balances_updated_at ON inventory_balances;
CREATE TRIGGER trg_inventory_balances_updated_at
BEFORE UPDATE ON inventory_balances
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO roles (code, name, is_active)
VALUES ('ADMIN', 'เจ้าของร้าน', TRUE)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

INSERT INTO users (role_id, name, username, password_hash, is_active)
SELECT
  roles.id,
  'KMG Admin',
  'admin',
  '$2b$12$QBwejfdcd0Gtq7FoDoLYie4pDBT4cTwwruZSdlgt8mT3s1zpT.SKW',
  TRUE
FROM roles
WHERE roles.code = 'ADMIN'
ON CONFLICT (username) DO UPDATE
SET name = EXCLUDED.name,
    role_id = EXCLUDED.role_id,
    password_hash = EXCLUDED.password_hash,
    is_active = EXCLUDED.is_active,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
