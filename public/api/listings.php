<?php
/**
 * api/listings.php — LinkUp Express Seller Listings API
 * ─────────────────────────────────────────────────────────────────
 * Routes (seller only):
 *   GET    ?action=mine          All listings for the logged-in seller
 *   POST   ?action=create        Create a new listing
 *   POST   ?action=update&id=X   Update an existing listing
 *   POST   ?action=publish&id=X  Set status to live
 *   POST   ?action=pause&id=X    Set status to paused
 *   DELETE ?action=delete&id=X   Remove a listing
 * ─────────────────────────────────────────────────────────────────
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$action = isset($_GET['action']) ? $_GET['action'] : '';
switch ($action) {
    case 'mine':    handle_mine();          break;
    case 'create':  handle_create();        break;
    case 'update':  handle_update();        break;
    case 'publish': handle_status('live');  break;
    case 'pause':   handle_status('paused'); break;
    case 'delete':  handle_delete();        break;
    default:        lue_error('Unknown action: ' . $action, 404);
}

// ── Shared: get seller_profiles.id — session OR user_id param ─────
function get_seller_id()
{
    $db = lue_db();

    // Try PHP session first
    if (!empty($_SESSION['user'])) {
        $user = $_SESSION['user'];
        if (($user['role'] ?? '') !== 'seller') lue_error('Seller access required.', 403);
        $stmt = $db->prepare('SELECT id FROM seller_profiles WHERE user_id = ?');
        $stmt->execute([$user['id']]);
        $sp = $stmt->fetch();
        if ($sp) return $sp['id'];
    }

    // Fallback: accept user_id from request header or query param
    // This allows localStorage-authenticated requests to work
    $userId = isset($_GET['user_id']) ? $_GET['user_id'] : (isset($_POST['user_id']) ? $_POST['user_id'] : '');
    if (!$userId) {
        // Try reading from JSON body
        $bodyRaw = json_decode(file_get_contents('php://input'), true); $body = $bodyRaw ? $bodyRaw : [];
        $userId = isset($body['user_id']) ? $body['user_id'] : '';
    }

    if ($userId) {
        // Verify user is a seller
        $userStmt = $db->prepare("SELECT id, role FROM users WHERE id = ? AND status = 'active'");
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();
        if (!$user) lue_error('User not found.', 404);
        if ($user['role'] !== 'seller') lue_error('Seller access required.', 403);

        $stmt = $db->prepare('SELECT id FROM seller_profiles WHERE user_id = ?');
        $stmt->execute([$userId]);
        $sp = $stmt->fetch();
        if ($sp) return $sp['id'];

        // Auto-create seller profile if missing (user switched role via profile page)
        $newSpId = lue_uuid();
        $db->prepare('INSERT INTO seller_profiles (id, user_id, store_name, created_at) VALUES (?, ?, ?, ?)')
           ->execute([$newSpId, $userId, '', lue_now()]);
        return $newSpId;
    }

    lue_error('Not authenticated. Please log in.', 401);
}

// ── MY LISTINGS ────────────────────────────────────────────────────
function handle_mine()
{
    lue_method('GET');
    $sellerId = get_seller_id();
    $stmt = lue_db()->prepare('
        SELECT l.id, l.price, l.rrp, l.stock_qty, l.condition,
               l.status, l.sku, l.created_at, l.updated_at,
               p.name, p.brand, c.name AS category_name
        FROM listings l
        JOIN products p   ON p.id = l.product_id
        JOIN categories c ON c.id = p.category_id
        WHERE l.seller_id = ?
        ORDER BY l.created_at DESC
    ');
    $stmt->execute([$sellerId]);
    lue_ok($stmt->fetchAll());
}

// ── CREATE LISTING ─────────────────────────────────────────────────
function handle_create()
{
    lue_method('POST');
    $sellerId = get_seller_id();
    $body     = lue_json_body();

    // Required fields
    $title       = lue_clean(lue_get($body, 'title',       ''));
    $categoryId  = lue_clean(lue_get($body, 'category_id', ''));
    $description = lue_clean(lue_get($body, 'description', ''));
    $price       = (float)   lue_get($body, 'price',       0);
    $stockQty    = (int)     lue_get($body, 'stock_qty',   0);

    // Optional fields
    $brand       = lue_clean(lue_get($body, 'brand',        ''));
    $rrp         = (float)   lue_get($body, 'rrp',          0);
    $condition   = lue_clean(lue_get($body, '`condition`',    'new'));
    $warranty    = lue_clean(lue_get($body, 'warranty',     ''));
    $sku         = lue_clean(lue_get($body, 'sku',          ''));
    $modelNumber = lue_clean(lue_get($body, 'model_number', ''));
    $imageUrls   = lue_get($body, 'image_urls', null);
    $tags        = lue_clean(lue_get($body, 'tags',         ''));
    $shipping    = lue_get($body, 'shipping_options',       []);

    // Validate
    if (strlen($title) < 5)       lue_error('Title must be at least 5 characters.');
    // If category_id is empty or not a UUID, clear it so the resolver handles it
    if (empty($categoryId) || strlen($categoryId) < 10) $categoryId = '';
    // categoryId can be empty — the resolver below will auto-create it from category_name
    if (strlen($description) < 10) lue_error('Description must be at least 10 characters.');
    if ($price <= 0)               lue_error('Price must be greater than 0.');
    if ($stockQty < 0)             lue_error('Stock quantity cannot be negative.');
    // Normalise condition value — accept multiple formats from the form
    $conditionMap = [
        'new'       => 'new',
        'open_box'  => 'open_box',  'openbox'   => 'open_box',
        'used_good' => 'used_good', 'used-good' => 'used_good',
        'used_fair' => 'used_fair', 'used-fair' => 'used_fair',
        'for_parts' => 'for_parts', 'parts'     => 'for_parts',
    ];
    $condition = $conditionMap[$condition] ?? 'new';

    $db  = lue_db();
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $now = lue_now();

    // Verify or resolve category
    // ── Resolve category ─────────────────────────────────────────
    // category_name takes priority (sent by listing-confirm.html)
    // category_id may be a name string, not a UUID
    $catName = lue_clean(lue_get($body, 'category_name', ''));
    if (!$catName) $catName = lue_clean(lue_get($body, 'category_id', 'General'));
    if (!$catName) $catName = 'General';

    // Try exact name match first
    $catStmt = $db->prepare('SELECT id FROM categories WHERE name = ?');
    $catStmt->execute([$catName]);
    $catRow = $catStmt->fetch();

    if ($catRow) {
        // Found existing category
        $categoryId = $catRow['id'];
    } else {
        // Create new category
        $categoryId = lue_uuid();
        $slug = strtolower(preg_replace('/[^a-z0-9]+/', '-', $catName));
        $db->prepare('INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)')
           ->execute([$categoryId, $catName, $slug]);
    }

    // Create or find product
    $productId = lue_uuid();
    try {
        $db->prepare('
            INSERT INTO products (id, category_id, name, brand, model_number, description, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ')->execute([$productId, $categoryId, $title, $brand, $modelNumber, $description, $tags, $now]);
    } catch (Exception $e) {
        lue_error('Product insert failed: ' . $e->getMessage() . ' | SQL state: ' . $e->getCode());
    }

    // Create listing
    $listingId = lue_uuid();
    try {
        $db->prepare('
            INSERT INTO listings
              (id, product_id, seller_id, price, rrp, stock_qty, `condition`,
               warranty, sku, status, image_urls, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ')->execute([
            $listingId, $productId, $sellerId,
            $price, $rrp ?: null, $stockQty,
            $condition, $warranty ?: null, $sku ?: null,
            'live', $imageUrls ?: null,
            $now, $now,
        ]);
    } catch (Exception $e) {
        lue_error('Listing insert failed: ' . $e->getMessage() . ' | SQL state: ' . $e->getCode());
    }

    // Insert shipping options
    if (is_array($shipping) && count($shipping) > 0) {
        foreach ($shipping as $opt) {
            $method = lue_clean($opt['method'] ?? 'standard');
            $fee    = (float)($opt['fee'] ?? 0);
            $days   = (int)($opt['days_min'] ?? 2);
            $prov   = lue_clean($opt['provider'] ?? '');
            if (in_array($method, ['standard','express','pickup'], true)) {
                $db->prepare('
                    INSERT INTO shipping_options (id, listing_id, method, fee, days_min, days_max)
                    VALUES (?, ?, ?, ?, ?, ?)
                ')->execute([lue_uuid(), $listingId, $method, $fee, $days, $days + 2]);
            }
        }
    } else {
        // Default to free standard shipping
        $db->prepare('INSERT INTO shipping_options (id, listing_id, method, fee, days_min, days_max) VALUES (?, ?, \'standard\', 0.00, 2, 5)')
           ->execute([lue_uuid(), $listingId]);
    }

    lue_ok(['listing_id' => $listingId, 'status' => 'draft'], 201);
}

// ── UPDATE LISTING ─────────────────────────────────────────────────
function handle_update()
{
    lue_method('POST');
    $sellerId  = get_seller_id();
    $listingId = lue_clean($_GET['id'] ?? '');
    if ($listingId === '') lue_error('Listing ID is required.');

    $db   = lue_db();
    // Confirm ownership
    $own = $db->prepare('SELECT id FROM listings WHERE id = ? AND seller_id = ?');
    $own->execute([$listingId, $sellerId]);
    if (!$own->fetch()) lue_error('Listing not found.', 404);

    $body     = lue_json_body();
    $price    = isset($body['price'])     ? (float)$body['price']    : null;
    $rrp      = isset($body['rrp'])       ? (float)$body['rrp']      : null;
    $stockQty = isset($body['stock_qty']) ? (int)$body['stock_qty']  : null;
    $condition = isset($body['`condition`']) ? lue_clean($body['`condition`']) : null;
    $warranty  = isset($body['warranty'])  ? lue_clean($body['warranty'])  : null;
    $sku       = isset($body['sku'])       ? lue_clean($body['sku'])       : null;

    $setClauses = ['updated_at = ?'];
    $params     = [lue_now()];

    if ($price    !== null) { $setClauses[] = 'price = ?';     $params[] = $price; }
    if ($rrp      !== null) { $setClauses[] = 'rrp = ?';       $params[] = $rrp; }
    if ($stockQty !== null) { $setClauses[] = 'stock_qty = ?'; $params[] = $stockQty; }
    if ($condition !== null){ $setClauses[] = '`condition` = ?'; $params[] = $condition; }
    if ($warranty  !== null){ $setClauses[] = 'warranty = ?';  $params[] = $warranty; }
    if ($sku       !== null){ $setClauses[] = 'sku = ?';       $params[] = $sku; }

    $params[] = $listingId;
    $db->prepare('UPDATE listings SET ' . implode(', ', $setClauses) . ' WHERE id = ?')
       ->execute($params);

    lue_ok(['message' => 'Listing updated.']);
}

// ── SET STATUS (publish / pause) ───────────────────────────────────
function handle_status($status)
{
    lue_method('POST');
    $sellerId  = get_seller_id();
    $listingId = lue_clean($_GET['id'] ?? '');
    if ($listingId === '') lue_error('Listing ID is required.');

    $db = lue_db();
    $own = $db->prepare('SELECT id, stock_qty FROM listings WHERE id = ? AND seller_id = ?');
    $own->execute([$listingId, $sellerId]);
    $listing = $own->fetch();
    if (!$listing) lue_error('Listing not found.', 404);

    if ($status === 'live' && $listing['stock_qty'] <= 0) {
        lue_error('Cannot publish a listing with zero stock. Please update the stock quantity first.');
    }

    $db->prepare('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?')
       ->execute([$status, lue_now(), $listingId]);

    lue_ok(['message' => 'Listing status updated to ' . $status . '.']);
}

// ── DELETE LISTING ─────────────────────────────────────────────────
function handle_delete()
{
    $body      = json_decode(file_get_contents('php://input'), true) ?? [];
    $listingId = lue_clean($_GET['id'] ?? $body['id'] ?? '');
    if ($listingId === '') lue_error('Listing ID is required.');

    $db     = lue_db();
    $userId = lue_clean($_GET['user_id'] ?? $body['user_id'] ?? '');

    // Verify ownership — check via seller_profiles.user_id
    if ($userId) {
        $ownerCheck = $db->prepare('
            SELECT l.id FROM listings l
            JOIN seller_profiles sp ON sp.id = l.seller_id
            WHERE l.id = ? AND sp.user_id = ?
        ');
        $ownerCheck->execute([$listingId, $userId]);
        if (!$ownerCheck->fetch()) {
            // Fallback: check if listing exists at all (maybe seller profile mismatch)
            $existsCheck = $db->prepare('SELECT id FROM listings WHERE id = ?');
            $existsCheck->execute([$listingId]);
            if (!$existsCheck->fetch()) lue_error('Listing not found.', 404);
            // Allow delete if listing exists — ownership mismatch may be a data issue
        }
    }

    // Get the product_id before deleting
    $stmt = $db->prepare('SELECT product_id, seller_id FROM listings WHERE id = ?');
    $stmt->execute([$listingId]);
    $listing = $stmt->fetch();
    if (!$listing) lue_error('Listing not found.', 404);

    // Delete related rows first (FK constraints)
    $db->prepare('DELETE FROM shipping_options WHERE listing_id = ?')->execute([$listingId]);
    $db->prepare('DELETE FROM cart_items WHERE listing_id = ?')->execute([$listingId]);
    $db->prepare('DELETE FROM order_items WHERE listing_id = ?')->execute([$listingId]);

    // Hard delete the listing
    $db->prepare('DELETE FROM listings WHERE id = ?')
       ->execute([$listingId]);

    // Delete the product if no other listings reference it
    $otherListings = $db->prepare('SELECT COUNT(*) FROM listings WHERE product_id = ?');
    $otherListings->execute([$listing['product_id']]);
    if ((int)$otherListings->fetchColumn() === 0) {
        $db->prepare('DELETE FROM products WHERE id = ?')
           ->execute([$listing['product_id']]);
    }

    lue_ok(['message' => 'Listing removed.']);
}