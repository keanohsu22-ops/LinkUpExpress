<?php
/**
 * api/reviews.php — LinkUp Express Reviews API
 * ─────────────────────────────────────────────────────────────────
 * Routes:
 *   GET   ?action=list&product_id=X   All reviews for a product
 *   POST  ?action=create              Submit a verified review
 * ─────────────────────────────────────────────────────────────────
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'list': handle_list(); break;
    case 'create': handle_create(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ── LIST REVIEWS FOR A PRODUCT ─────────────────────────────────────
function handle_list()
{
    lue_method('GET');
    $productId = lue_clean($_GET['product_id'] ?? '');
    if ($productId === '') lue_error('product_id is required.');

    $stmt = lue_db()->prepare('
        SELECT rv.id, rv.rating, rv.title, rv.body, rv.created_at,
               u.full_name AS reviewer_name
        FROM reviews rv
        JOIN buyer_profiles bp ON bp.id = rv.buyer_id
        JOIN users u           ON u.id  = bp.user_id
        WHERE rv.product_id = ?
        ORDER BY rv.created_at DESC
    ');
    $stmt->execute([$productId]);
    lue_ok($stmt->fetchAll());
}

// ── CREATE REVIEW ──────────────────────────────────────────────────
function handle_create()
{
    lue_method('POST');
    $user = lue_require_role('buyer');
    $body = lue_json_body();

    $productId = lue_clean(lue_get($body, 'product_id', ''));
    $orderId   = lue_clean(lue_get($body, 'order_id',   ''));
    $rating    = (int)    lue_get($body, 'rating',      0);
    $title     = lue_clean(lue_get($body, 'title',      ''));
    $bodyText  = lue_clean(lue_get($body, 'body',       ''));

    if ($productId === '')             lue_error('product_id is required.');
    if ($orderId === '')               lue_error('order_id is required.');
    if ($rating < 1 || $rating > 5)   lue_error('Rating must be between 1 and 5.');

    $db = lue_db();

    // Get buyer profile ID
    $bp = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
    $bp->execute([$user['id']]);
    $buyer = $bp->fetch();
    if (!$buyer) lue_error('Buyer profile not found.', 404);
    $buyerId = $buyer['id'];

    // Verify the buyer actually purchased this product in this order
    $verify = $db->prepare('
        SELECT oi.id FROM order_items oi
        JOIN orders o       ON o.id  = oi.order_id
        JOIN listings l     ON l.id  = oi.listing_id
        WHERE o.id = ? AND l.product_id = ? AND o.buyer_id = ? AND o.status = \'delivered\'
    ');
    $verify->execute([$orderId, $productId, $buyerId]);
    if (!$verify->fetch()) {
        lue_error('You can only review products from delivered orders.', 403);
    }

    // Check for duplicate review
    $dup = $db->prepare('SELECT id FROM reviews WHERE buyer_id = ? AND product_id = ? AND order_id = ?');
    $dup->execute([$buyerId, $productId, $orderId]);
    if ($dup->fetch()) lue_error('You have already reviewed this product.', 409);

    $db->prepare('
        INSERT INTO reviews (id, buyer_id, product_id, order_id, rating, title, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ')->execute([lue_uuid(), $buyerId, $productId, $orderId, $rating, $title, $bodyText, lue_now()]);

    // avg_rating and review_count updated automatically by the DB trigger
    lue_ok(['message' => 'Review submitted successfully.'], 201);
}
