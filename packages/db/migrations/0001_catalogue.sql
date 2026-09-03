CREATE TABLE IF NOT EXISTS merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalogue_versions (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogue_versions_merchant_version_unique UNIQUE (merchant_id, version)
);

CREATE TABLE IF NOT EXISTS products (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  catalogue_version_id text NOT NULL REFERENCES catalogue_versions(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('running', 'walking', 'training', 'trail', 'casual', 'accessory')),
  return_policy_days integer NOT NULL CHECK (return_policy_days >= 0),
  active boolean NOT NULL DEFAULT true,
  CONSTRAINT products_merchant_slug_unique UNIQUE (merchant_id, slug)
);
CREATE INDEX IF NOT EXISTS products_merchant_type_idx ON products (merchant_id, product_type);

CREATE TABLE IF NOT EXISTS product_variants (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  colour text NOT NULL,
  size_uk integer CHECK (size_uk IS NULL OR size_uk BETWEEN 4 AND 13),
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS product_variants_filters_idx ON product_variants (size_uk, colour, price_paise);

CREATE TABLE IF NOT EXISTS inventory (
  variant_id text PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_relations (
  source_product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type = 'compatible_addon'),
  reason text NOT NULL,
  PRIMARY KEY (source_product_id, target_product_id, relation_type),
  CHECK (source_product_id <> target_product_id)
);
CREATE INDEX IF NOT EXISTS product_relations_source_idx ON product_relations (source_product_id);
