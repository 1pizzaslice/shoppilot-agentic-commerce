ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL
  DEFAULT 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=82';

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_image_url_https;

ALTER TABLE products
  ADD CONSTRAINT products_image_url_https
  CHECK (image_url LIKE 'https://%');
