<?php
error_reporting(0);
ini_set('display_errors','0');
/**
 * admin/api/table.php — Generic CRUD for all DB tables
 *
 * GET  ?table=X              → list all rows + column names
 * POST ?action=insert        → insert new row  (body: {table, ...fields})
 * POST ?action=update&id=X   → update row      (body: {table, ...fields})
 * POST ?action=delete&table=X&id=X → delete row
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

require_once __DIR__ . '/helpers.php';

admin_auth_guard();

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

// Route
try {
    if ($method === 'GET') {
        handle_list();
    } elseif ($method === 'POST') {
        switch ($action) {
            case 'insert': handle_insert(); break;
            case 'update': handle_update(); break;
            case 'delete': handle_delete(); break;
            default: admin_error('Unknown action: ' . $action);
        }
    } else {
        admin_error('Method not allowed.', 405);
    }
} catch (Throwable $e) {
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);
    exit;
}

// ── LIST ──────────────────────────────────────────────────────────
function handle_list(): void {
    $table = $_GET['table'] ?? '';
    validate_table($table);

    $db = admin_db();

    // Get column info
    $cols_raw = $db->query("DESCRIBE {$table}")->fetchAll();
    $cols = array_column($cols_raw, 'Field');

    // Fetch rows — join useful info for key tables
    $rows = [];
    switch ($table) {
        case 'listings':
            $rows = $db->query("
                SELECT l.id, p.name AS product_name, p.brand,
                       c.name AS category, l.price, l.stock_qty,
                       l.condition, l.status, l.created_at,
                       sp.store_name AS seller
                FROM listings l
                LEFT JOIN products p ON p.id = l.product_id
                LEFT JOIN categories c ON c.id = p.category_id
                LEFT JOIN seller_profiles sp ON sp.id = l.seller_id
                ORDER BY l.created_at DESC
            ")->fetchAll();
            $cols = ['id','product_name','brand','category','price','stock_qty','condition','status','created_at','seller'];
            break;

        case 'orders':
            $rows = $db->query("
                SELECT o.id, o.ref_number, u.full_name AS buyer,
                       o.subtotal, o.vat, o.total, o.status, o.placed_at
                FROM orders o
                LEFT JOIN buyer_profiles bp ON bp.id = o.buyer_id
                LEFT JOIN users u ON u.id = bp.user_id
                ORDER BY o.placed_at DESC
            ")->fetchAll();
            $cols = ['id','ref_number','buyer','subtotal','vat','total','status','placed_at'];
            break;

        case 'order_items':
            $rows = $db->query("
                SELECT oi.id, o.ref_number, oi.product_name, oi.seller_name,
                       oi.unit_price, oi.quantity, oi.line_total
                FROM order_items oi
                LEFT JOIN orders o ON o.id = oi.order_id
                ORDER BY oi.id DESC
            ")->fetchAll();
            $cols = ['id','ref_number','product_name','seller_name','unit_price','quantity','line_total'];
            break;

        case 'users':
            $rows = $db->query("
                SELECT id, full_name, email, phone, role, status, created_at,
                       address_street, address_city, address_province
                FROM users
                ORDER BY created_at DESC
            ")->fetchAll();
            $cols = ['id','full_name','email','phone','role','status','created_at','address_street','address_city','address_province'];
            break;

        case 'cart_items':
            $rows = $db->query("
                SELECT ci.id, u.full_name AS user, p.name AS product,
                       ci.quantity, ci.added_at
                FROM cart_items ci
                LEFT JOIN carts ca ON ca.id = ci.cart_id
                LEFT JOIN buyer_profiles bp ON bp.id = ca.buyer_id
                LEFT JOIN users u ON u.id = bp.user_id
                LEFT JOIN listings l ON l.id = ci.listing_id
                LEFT JOIN products p ON p.id = l.product_id
                ORDER BY ci.added_at DESC
            ")->fetchAll();
            $cols = ['id','user','product','quantity','added_at'];
            break;

        case 'admin_users':
            $rows = $db->query("SELECT id, full_name, email, super_admin, status, created_at, last_login FROM admin_users ORDER BY created_at DESC")->fetchAll();
            $cols = ['id','full_name','email','super_admin','status','created_at','last_login'];
            break;

        default:
            $rows = $db->query("SELECT * FROM {$table} ORDER BY id DESC")->fetchAll();
    }

    admin_ok(['rows' => $rows, 'columns' => $cols, 'count' => count($rows)]);
}

// ── INSERT ────────────────────────────────────────────────────────
function handle_insert(): void {
    $body  = admin_json_body();
    $table = admin_clean($body['table'] ?? '');
    validate_table($table);

    $db  = admin_db();
    $now = admin_now();

    unset($body['table']);

    switch ($table) {
        case 'users':
            $id       = admin_uuid();
            $name     = admin_clean($body['full_name'] ?? '');
            $email    = strtolower(admin_clean($body['email'] ?? ''));
            $phone    = admin_clean($body['phone'] ?? '');
            $role     = in_array($body['role']??'', ['buyer','seller','admin']) ? $body['role'] : 'buyer';
            $password = $body['password'] ?? '';

            if (!$name || !$email || !$password) admin_error('Name, email and password are required.');

            // Check duplicate email
            $dup = $db->prepare("SELECT id FROM users WHERE email = ?");
            $dup->execute([$email]);
            if ($dup->fetch()) admin_error('Email already exists.');

            $hash = password_hash($password, PASSWORD_BCRYPT);
            $db->prepare("INSERT INTO users (id, full_name, email, phone, role, password_hash, status, created_at, updated_at)
                          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)")
               ->execute([$id, $name, $email, $phone, $role, $hash, $now, $now]);

            // Create profile
            if ($role === 'seller') {
                $db->prepare("INSERT INTO seller_profiles (id, user_id, store_name, created_at) VALUES (?, ?, ?, ?)")
                   ->execute([admin_uuid(), $id, $name . "'s Store", $now]);
            } else {
                $db->prepare("INSERT INTO buyer_profiles (id, user_id, created_at) VALUES (?, ?, ?)")
                   ->execute([admin_uuid(), $id, $now]);
            }
            admin_ok(['id' => $id, 'message' => 'User created successfully.']);
            break;

        case 'categories':
            $id   = admin_uuid();
            $name = admin_clean($body['name'] ?? '');
            $slug = admin_clean($body['slug'] ?? strtolower(preg_replace('/[^a-z0-9]+/', '-', $name)));
            if (!$name) admin_error('Category name is required.');
            $db->prepare("INSERT OR IGNORE INTO categories (id, name, slug) VALUES (?, ?, ?)")
               ->execute([$id, $name, $slug]);
            admin_ok(['id' => $id]);
            break;

        case 'listings':
            // Simplified listing insert — create product + listing in one go
            $name      = admin_clean($body['name'] ?? '');
            $brand     = admin_clean($body['brand'] ?? '');
            $category  = admin_clean($body['category'] ?? 'Other');
            $desc      = admin_clean($body['description'] ?? '');
            $price     = floatval($body['price'] ?? 0);
            $stock     = intval($body['stock_qty'] ?? 1);
            $condition = admin_clean($body['condition'] ?? 'New');
            $status    = admin_clean($body['status'] ?? 'live');
            $sellerId  = admin_clean($body['seller_id'] ?? '');

            if (!$name)     admin_error('Product name is required.');
            if (!$price)    admin_error('Price is required.');
            if (!$sellerId) admin_error('Seller is required.');

            // Resolve or create category
            $catStmt = $db->prepare("SELECT id FROM categories WHERE name = ?");
            $catStmt->execute([$category]);
            $cat = $catStmt->fetch();
            if (!$cat) {
                $catId = admin_uuid();
                $slug  = strtolower(preg_replace('/[^a-z0-9]+/', '-', $category));
                $db->prepare("INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)")->execute([$catId, $category, $slug]);
            } else {
                $catId = $cat['id'];
            }

            // Create product
            $productId = admin_uuid();
            $db->prepare("INSERT INTO products (id, category_id, name, brand, description, avg_rating, review_count, created_at)
                          VALUES (?, ?, ?, ?, ?, 0, 0, ?)")
               ->execute([$productId, $catId, $name, $brand, $desc, $now]);

            // Create listing
            $listingId = admin_uuid();
            $db->prepare("INSERT INTO listings (id, product_id, seller_id, price, stock_qty, condition, status, created_at, updated_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
               ->execute([$listingId, $productId, $sellerId, $price, $stock, $condition, $status, $now, $now]);

            admin_ok(['listing_id' => $listingId, 'message' => 'Listing created successfully.']);
            break;

        case 'admin_users':
            if (!admin_is_super()) admin_error('Only Super Admins can add admin users.', 403);
            $aName     = admin_clean($body['full_name'] ?? '');
            $aEmail    = strtolower(admin_clean($body['email'] ?? ''));
            $aPassword = $body['password'] ?? '';
            $aSuper    = isset($body['super_admin']) && ($body['super_admin'] === '1' || $body['super_admin'] === 'true') ? 1 : 0;
            if (!$aName || !$aEmail || !$aPassword) admin_error('Full name, email and password are required.');
            $dup = $db->prepare("SELECT id FROM admin_users WHERE email = ?");
            $dup->execute([$aEmail]);
            if ($dup->fetch()) admin_error('Email already exists.');
            $aId   = admin_uuid();
            $aHash = password_hash($aPassword, PASSWORD_BCRYPT);
            $db->prepare("INSERT INTO admin_users (id, full_name, email, password_hash, super_admin, status, created_at)
                          VALUES (?, ?, ?, ?, ?, 'active', ?)")
               ->execute([$aId, $aName, $aEmail, $aHash, $aSuper, $now]);
            admin_ok(['id' => $aId, 'message' => 'Admin user created successfully.']);
            break;

        default:
            admin_error("Direct insert not supported for table '{$table}'. Use the main site forms.");
    }
}

// ── UPDATE ────────────────────────────────────────────────────────
function handle_update(): void {
    $id    = $_GET['id'] ?? '';
    $body  = admin_json_body();
    $table = admin_clean($body['table'] ?? '');
    validate_table($table);

    if (!$id) admin_error('Record ID is required.');

    $db  = admin_db();
    $now = admin_now();
    unset($body['table'], $body['id']);

    // ── Special case: listings are shown as a JOIN view ───────────
    if ($table === 'listings') {
        // Listing columns (raw listings table)
        $listingCols = ['price','rrp','stock_qty','condition','warranty','sku','status'];
        // Product columns (products table — need product_id from listing)
        $productCols = ['name','brand','model_number','description','tags'];

        // Get product_id for this listing
        $stmt = $db->prepare("SELECT product_id FROM listings WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        $productId = $row ? $row['product_id'] : null;

        // Update listings table
        $lParts = []; $lParams = [];
        foreach ($listingCols as $col) {
            if (isset($body[$col])) {
                $lParts[]  = "{$col} = ?";
                $lParams[] = ($body[$col] === '' || $body[$col] === '—') ? null : $body[$col];
            }
        }
        if (!empty($lParts)) {
            $lParts[]  = 'updated_at = ?';
            $lParams[] = $now;
            $lParams[] = $id;
            $db->prepare("UPDATE listings SET " . implode(', ', $lParts) . " WHERE id = ?")->execute($lParams);
        }

        // Update products table
        if ($productId) {
            $pParts = []; $pParams = [];
            foreach ($productCols as $col) {
                if (isset($body[$col])) {
                    $pParts[]  = "{$col} = ?";
                    $pParams[] = ($body[$col] === '' || $body[$col] === '—') ? null : $body[$col];
                }
            }
            // Handle category by name
            if (!empty($body['category'])) {
                $catStmt = $db->prepare("SELECT id FROM categories WHERE name = ?");
                $catStmt->execute([$body['category']]);
                $cat = $catStmt->fetch();
                if ($cat) {
                    $pParts[]  = 'category_id = ?';
                    $pParams[] = $cat['id'];
                }
            }
            if (!empty($pParts)) {
                $pParams[] = $productId;
                $db->prepare("UPDATE products SET " . implode(', ', $pParts) . " WHERE id = ?")->execute($pParams);
            }
        }
        admin_ok(['message' => 'Listing updated successfully.']);
    }

    // ── General update for all other tables ───────────────────────
    // For admin_users: only super admin can update
    if ($table === 'admin_users' && !admin_is_super()) {
        admin_error('Only Super Admins can edit admin users.', 403);
    }

    $skip = ['password_hash','created_at','placed_at','product_name','brand',
             'category','seller','category_name','category_slug','store_name'];
    foreach ($skip as $s) unset($body[$s]);

    if ($table === 'users' && !empty($body['password'])) {
        $body['password_hash'] = password_hash($body['password'], PASSWORD_BCRYPT);
        unset($body['password']);
    } else {
        unset($body['password']);
    }

    // Get real columns of this table
    $tableInfo = $db->query("DESCRIBE {$table}")->fetchAll();
    $realCols  = array_column($tableInfo, 'Field');

    $setParts = []; $params = [];
    foreach ($body as $col => $val) {
        if (!preg_match('/^[a-z_]+$/', $col)) continue;
        if (!in_array($col, $realCols)) continue; // skip joined/virtual columns
        $setParts[] = "{$col} = ?";
        $params[]   = ($val === '' || $val === '—') ? null : $val;
    }

    if (empty($setParts)) admin_error('Nothing to update.');

    if (in_array('updated_at', $realCols)) {
        $setParts[] = 'updated_at = ?';
        $params[]   = $now;
    }

    $params[] = $id;
    $stmt = $db->prepare("UPDATE {$table} SET " . implode(', ', $setParts) . " WHERE id = ?");
    $stmt->execute($params);
    admin_ok(['message' => 'Record updated.', 'rows_affected' => $stmt->rowCount()]);
}

// ── DELETE ────────────────────────────────────────────────────────
function handle_delete(): void {
    $table = admin_clean($_GET['table'] ?? '');
    $id    = trim($_GET['id'] ?? '');
    validate_table($table);
    if (!$id || $id === 'null') admin_error('ID is required and cannot be null.');

    $db = admin_db();
    if ($table === 'users') {
        // Hard delete — disable FK checks for MySQL, clean up all related rows, then delete user
        $db->exec('SET FOREIGN_KEY_CHECKS = 0');
        try {
            // carts uses buyer_id (= buyer_profiles.id), not user_id
            // Get buyer_profile id first
            $bp = $db->prepare("SELECT id FROM buyer_profiles WHERE user_id = ?");
            $bp->execute([$id]);
            $bpRow = $bp->fetch();
            $buyerId = $bpRow ? $bpRow['id'] : null;

            // Get seller_profile id
            $sp = $db->prepare("SELECT id FROM seller_profiles WHERE user_id = ?");
            $sp->execute([$id]);
            $spRow = $sp->fetch();
            $sellerId = $spRow ? $spRow['id'] : null;

            // Delete order_items → orders (via buyer_profiles.id = orders.buyer_id)
            if ($buyerId) {
                $db->prepare("DELETE FROM order_items WHERE order_id IN (
                    SELECT id FROM orders WHERE buyer_id = ?
                )")->execute([$buyerId]);
                $db->prepare("DELETE FROM orders WHERE buyer_id = ?")->execute([$buyerId]);
                // Delete cart_items → carts (carts.buyer_id = buyer_profiles.id)
                $db->prepare("DELETE FROM cart_items WHERE cart_id IN (
                    SELECT id FROM carts WHERE buyer_id = ?
                )")->execute([$buyerId]);
                $db->prepare("DELETE FROM carts WHERE buyer_id = ?")->execute([$buyerId]);
                $db->prepare("DELETE FROM buyer_profiles WHERE id = ?")->execute([$buyerId]);
            }

            // Delete seller listings and products
            if ($sellerId) {
                $listings = $db->prepare("SELECT id, product_id FROM listings WHERE seller_id = ?");
                $listings->execute([$sellerId]);
                foreach ($listings->fetchAll() as $listing) {
                    $db->prepare("DELETE FROM shipping_options WHERE listing_id = ?")->execute([$listing['id']]);
                    $db->prepare("DELETE FROM order_items WHERE listing_id = ?")->execute([$listing['id']]);
                    $db->prepare("DELETE FROM cart_items WHERE listing_id = ?")->execute([$listing['id']]);
                    $db->prepare("DELETE FROM listings WHERE id = ?")->execute([$listing['id']]);
                    $db->prepare("DELETE FROM products WHERE id = ?")->execute([$listing['product_id']]);
                }
                $db->prepare("DELETE FROM seller_profiles WHERE id = ?")->execute([$sellerId]);
            }

            // Finally delete the user
            $db->prepare("DELETE FROM users WHERE id = ?")->execute([$id]);
        } catch (Exception $e) {
            $db->exec('SET FOREIGN_KEY_CHECKS = 1');
            admin_error('Delete failed: ' . $e->getMessage());
        }
        $db->exec('SET FOREIGN_KEY_CHECKS = 1');
    } elseif ($table === 'listings') {
        // Get product_id before deleting
        $stmt = $db->prepare("SELECT product_id FROM listings WHERE id = ?");
        $stmt->execute([$id]);
        $listing = $stmt->fetch();

        // Delete all child rows first (MySQL FK order)
        $db->prepare("DELETE FROM shipping_options WHERE listing_id = ?")->execute([$id]);
        $db->prepare("DELETE FROM order_items WHERE listing_id = ?")->execute([$id]);
        $db->prepare("DELETE FROM cart_items WHERE listing_id = ?")->execute([$id]);
        $db->prepare("DELETE FROM listings WHERE id = ?")->execute([$id]);

        // Delete orphaned product
        if ($listing) {
            $remaining = $db->prepare("SELECT COUNT(*) FROM listings WHERE product_id = ?");
            $remaining->execute([$listing['product_id']]);
            if ((int)$remaining->fetchColumn() === 0) {
                $db->prepare("DELETE FROM products WHERE id = ?")->execute([$listing['product_id']]);
            }
        }

    } elseif ($table === 'products') {
        // Delete all listings for this product first, then the product
        $lstmt = $db->prepare("SELECT id FROM listings WHERE product_id = ?");
        $lstmt->execute([$id]);
        $productListings = $lstmt->fetchAll();
        foreach ($productListings as $pl) {
            $db->prepare("DELETE FROM shipping_options WHERE listing_id = ?")->execute([$pl['id']]);
            $db->prepare("DELETE FROM order_items WHERE listing_id = ?")->execute([$pl['id']]);
            $db->prepare("DELETE FROM cart_items WHERE listing_id = ?")->execute([$pl['id']]);
            $db->prepare("DELETE FROM listings WHERE id = ?")->execute([$pl['id']]);
        }
        $db->prepare("DELETE FROM products WHERE id = ?")->execute([$id]);

    } else {
        $db->prepare("DELETE FROM {$table} WHERE id = ?")->execute([$id]);
    }
    admin_ok(['message' => 'Record deleted.']);
}

// ── VALIDATE TABLE ────────────────────────────────────────────────
function validate_table(string $table): void {
    if (!in_array($table, ALLOWED_TABLES)) {
        admin_error("Table '{$table}' is not accessible.", 400);
    }
}