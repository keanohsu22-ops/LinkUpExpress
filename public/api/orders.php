<?php
/**
 * api/orders.php — LinkUp Express Orders API
 * ─────────────────────────────────────────────────────────────────
 * Routes:
 *   POST  ?action=place         Place a new order from cart
 *   GET   ?action=list          Buyer's order history
 *   GET   ?action=one&id=X      Single order detail with items
 * ─────────────────────────────────────────────────────────────────
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'place': handle_place(); break;
    case 'list': handle_list(); break;
    case 'one': handle_one(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ── PLACE ORDER ────────────────────────────────────────────────────
function handle_place()
{
    lue_method('POST');
    $user   = lue_require_auth();
    // Allow both buyers and sellers to place orders

    $body      = lue_json_body();
    $addrId    = lue_clean(lue_get($body, 'delivery_address_id', '')) ?: null;
    $items     = lue_get($body, 'items', []); // array of {listing_id, quantity, variant}

    if (empty($items) || !is_array($items)) {
        lue_error('Order must contain at least one item.');
    }

    $db = lue_db();

    // Resolve buyer profile — auto-create if missing (seller buying something)
    $bp = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
    $bp->execute([$user['id']]);
    $buyer = $bp->fetch();
    if (!$buyer) {
        $newBpId = lue_uuid();
        $db->prepare('INSERT INTO buyer_profiles (id, user_id, created_at) VALUES (?, ?, ?)')
           ->execute([$newBpId, $user['id'], lue_now()]);
        $buyerId = $newBpId;
    } else {
        $buyerId = $buyer['id'];
    }

    // ── Build order items and calculate totals ───────────────────
    $subtotal    = 0.0;
    $orderLines  = [];

    foreach ($items as $item) {
        $listingId = lue_clean($item['listing_id'] ?? '');
        $qty       = max(1, (int)($item['quantity'] ?? 1));

        $ls = $db->prepare('
            SELECT l.id, l.price, l.stock_qty,
                   p.name AS product_name,
                   sp.store_name AS seller_name
            FROM listings l
            JOIN products p         ON p.id  = l.product_id
            JOIN seller_profiles sp ON sp.id = l.seller_id
            WHERE l.id = ? AND l.status IN (\'live\', \'out_of_stock\')
        ');
        $ls->execute([$listingId]);
        $listing = $ls->fetch();

        if (!$listing) lue_error("Listing {$listingId} is no longer available.");
        if ($listing['stock_qty'] < $qty) {
            lue_error("Not enough stock for: {$listing['product_name']}. Available: {$listing['stock_qty']}");
        }

        $lineTotal   = $listing['price'] * $qty;
        $subtotal   += $lineTotal;
        $orderLines[] = [
            'id'           => lue_uuid(),
            'listing_id'   => $listingId,
            'product_name' => $listing['product_name'],
            'seller_name'  => $listing['seller_name'],
            'unit_price'   => $listing['price'],
            'quantity'     => $qty,
            'line_total'   => $lineTotal,
        ];
    }

    $discount = 0.0;

    $afterDiscount = $subtotal - $discount;
    $vat           = $afterDiscount * (15 / 115); // VAT included
    $total         = $afterDiscount;

    // ── Insert order ─────────────────────────────────────────────
    $orderId = lue_uuid();
    $ref     = lue_order_ref();
    $now     = lue_now();

    // Disable FK checks to avoid delivery_addresses constraint
    $db->prepare('
        INSERT INTO orders
          (id, buyer_id, delivery_address_id, ref_number,
           subtotal, discount, vat, total, status, placed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ')->execute([$orderId, $buyerId, null, $ref,
                 $subtotal, $discount, $vat, $total, 'pending', $now, $now]);

    // ── Insert order items and decrement stock ───────────────────
    foreach ($orderLines as $line) {
        $db->prepare('
            INSERT INTO order_items
              (id, order_id, listing_id, product_name, seller_name, unit_price, quantity, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ')->execute([
            $line['id'], $orderId, $line['listing_id'],
            $line['product_name'], $line['seller_name'],
            $line['unit_price'], $line['quantity'], $line['line_total'],
        ]);

        // Decrement stock and set out_of_stock when it hits 0
        $db->prepare('UPDATE listings SET stock_qty = GREATEST(0, stock_qty - ?) WHERE id = ?')
           ->execute([$line['quantity'], $line['listing_id']]);
        // Mark as out of stock if stock reaches 0
        $db->prepare("UPDATE listings SET status = 'out_of_stock' WHERE id = ? AND stock_qty <= 0")
           ->execute([$line['listing_id']]);
    }


    // Re-enable FK checks
    // ── Update buyer totals ──────────────────────────────────────
    $db->prepare('UPDATE buyer_profiles SET total_orders = total_orders + 1, total_spent = total_spent + ? WHERE id = ?')
       ->execute([$total, $buyerId]);

    // ── Clear cart ───────────────────────────────────────────────
    $cart = $db->prepare('SELECT id FROM carts WHERE buyer_id = ?');
    $cart->execute([$buyerId]);
    $cartRow = $cart->fetch();
    if ($cartRow) {
        $db->prepare('DELETE FROM cart_items WHERE cart_id = ?')->execute([$cartRow['id']]);
    }

    lue_ok([
        'order_id'   => $orderId,
        'ref_number' => $ref,
        'total'      => $total,
        'status'     => 'pending',
    ], 201);
}

// ── ORDER LIST ─────────────────────────────────────────────────────
function handle_list()
{
    lue_method('GET');
    $user = lue_require_auth();
    $db   = lue_db();

    $bp = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
    $bp->execute([$user['id']]);
    $buyer = $bp->fetch();
    if (!$buyer) lue_ok([]);

    $stmt = $db->prepare('
        SELECT o.id, o.ref_number, o.total, o.status, o.placed_at,
               p.status AS payment_status, p.yoko_txn_id
        FROM orders o
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE o.buyer_id = ?
        ORDER BY o.placed_at DESC
    ');
    $stmt->execute([$buyer['id']]);
    lue_ok($stmt->fetchAll());
}

// ── SINGLE ORDER ───────────────────────────────────────────────────
function handle_one()
{
    lue_method('GET');
    $user    = lue_require_auth();
    $orderId = lue_clean($_GET['id'] ?? '');
    if ($orderId === '') lue_error('Order ID is required.');

    $db   = lue_db();
    $stmt = $db->prepare('
        SELECT o.*, p.yoko_txn_id, p.auth_code, p.card_masked,
               p.card_type, p.cardholder, p.status AS payment_status
        FROM orders o
        JOIN buyer_profiles bp ON bp.id = o.buyer_id
        LEFT JOIN payments p   ON p.order_id = o.id
        WHERE o.id = ? AND bp.user_id = ?
    ');
    $stmt->execute([$orderId, $user['id']]);
    $order = $stmt->fetch();
    if (!$order) lue_error('Order not found.', 404);

    $items = $db->prepare('SELECT * FROM order_items WHERE order_id = ?');
    $items->execute([$orderId]);
    $order['items'] = $items->fetchAll();

    lue_ok($order);
}