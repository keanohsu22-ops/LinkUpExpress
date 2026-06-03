<?php
/**
 * api/products.php — LinkUp Express Products & Listings API
 * ─────────────────────────────────────────────────────────────────
 * Routes:
 *   GET  ?action=all           All live listings with product info
 *   GET  ?action=one&id=X      Single listing detail
 *   GET  ?action=categories    All categories
 *   GET  ?action=search&q=X    Search listings by keyword
 * ─────────────────────────────────────────────────────────────────
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'all': handle_all(); break;
    case 'one': handle_one(); break;
    case 'categories': handle_categories(); break;
    case 'search': handle_search(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ── ALL LIVE LISTINGS ──────────────────────────────────────────────
function handle_all()
{
    lue_method('GET');
    $db   = lue_db();
    $cat  = lue_clean($_GET['category'] ?? '');
    $sort = lue_clean($_GET['sort']     ?? 'newest');

    $sql = '
        SELECT l.id, l.price, l.rrp, l.stock_qty, l.condition, l.status, l.image_urls,
               p.name, p.brand, p.avg_rating, p.review_count, p.tags,
               c.name  AS category_name, c.slug AS category_slug,
               sp.store_name AS seller_name, sp.rating AS seller_rating, sp.verified AS seller_verified
        FROM listings l
        JOIN products p        ON p.id  = l.product_id
        JOIN categories c      ON c.id  = p.category_id
        JOIN seller_profiles sp ON sp.id = l.seller_id
        WHERE l.status = \'live\'
    ';

    $params = [];
    if ($cat !== '') {
        $sql .= ' AND (c.slug = ? OR c.name = ?)';
        $params[] = $cat;
        $params[] = $cat;
    }

    $sql .= match ($sort) {
        'price_asc'  => ' ORDER BY l.price ASC',
        'price_desc' => ' ORDER BY l.price DESC',
        'rating'     => ' ORDER BY p.avg_rating DESC',
        default      => ' ORDER BY l.created_at DESC',
    };

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    lue_ok($stmt->fetchAll());
}

// ── SINGLE LISTING ─────────────────────────────────────────────────
function handle_one()
{
    lue_method('GET');
    $id = lue_clean(isset($_GET['id']) ? $_GET['id'] : '');
    if ($id === '') lue_error('Listing ID is required.');

    $db   = lue_db();
    $stmt = $db->prepare('
        SELECT l.id, l.price, l.rrp, l.stock_qty, l.`condition`,
               l.warranty, l.sku, l.status, l.image_urls,
               p.name, p.brand, p.model_number, p.description,
               p.avg_rating, p.review_count, p.tags,
               c.name AS category_name,
               sp.id AS seller_profile_id,
               sp.store_name AS seller_name,
               sp.rating AS seller_rating,
               u.phone AS seller_phone
        FROM listings l
        JOIN products p         ON p.id  = l.product_id
        JOIN categories c       ON c.id  = p.category_id
        JOIN seller_profiles sp ON sp.id = l.seller_id
        JOIN users u            ON u.id  = sp.user_id
        WHERE l.id = ?
    ');
    $stmt->execute([$id]);
    $listing = $stmt->fetch();
    if (!$listing) lue_error('Listing not found.', 404);

    // Shipping options
    $s = $db->prepare('SELECT method, fee, days_min, days_max FROM shipping_options WHERE listing_id = ?');
    $s->execute([$id]);
    $listing['shipping_options'] = $s->fetchAll();

    lue_ok($listing);
}

// ── CATEGORIES ─────────────────────────────────────────────────────
function handle_categories()
{
    lue_method('GET');
    $stmt = lue_db()->query('SELECT id, name, slug FROM categories ORDER BY name');
    lue_ok($stmt->fetchAll());
}

// ── SEARCH ─────────────────────────────────────────────────────────
function handle_search()
{
    lue_method('GET');
    $q = lue_clean(isset($_GET['q']) ? $_GET['q'] : '');
    if (strlen($q) < 2) lue_error('Search query must be at least 2 characters.');

    $like = '%' . $q . '%';
    $stmt = lue_db()->prepare('
        SELECT l.id, l.price, l.rrp, l.stock_qty, l.image_urls,
               p.name, p.brand, p.avg_rating,
               sp.store_name AS seller_name
        FROM listings l
        JOIN products p         ON p.id  = l.product_id
        JOIN seller_profiles sp ON sp.id = l.seller_id
        WHERE l.status = \'live\'
          AND (p.name LIKE ? OR p.brand LIKE ? OR p.tags LIKE ? OR p.description LIKE ?)
        ORDER BY p.avg_rating DESC
        LIMIT 40
    ');
    $stmt->execute([$like, $like, $like, $like]);
    lue_ok($stmt->fetchAll());
}