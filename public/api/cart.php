<?php
/**
 * api/cart.php — LinkUp Express Cart API
 * ─────────────────────────────────────────────────────────────────
 * Routes:
 *   GET    ?action=get           Return cart items for logged-in buyer
 *   POST   ?action=add           Add or increment an item
 *   POST   ?action=update        Update item quantity
 *   DELETE ?action=remove&id=X   Remove one item
 *   POST   ?action=clear         Empty the cart
 * ─────────────────────────────────────────────────────────────────
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'get': handle_get_cart(); break;
    case 'add': handle_add(); break;
    case 'update': handle_update(); break;
    case 'remove': handle_remove(); break;
    case 'clear': handle_clear(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ── Shared: get buyer_profiles.id for current session ─────────────
function get_buyer_id()
{
    $user = lue_require_auth();
    if ($user['role'] !== 'buyer') lue_error('Only buyers have a cart.', 403);
    $db   = lue_db();
    $stmt = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
    $stmt->execute([$user['id']]);
    $bp = $stmt->fetch();
    if (!$bp) lue_error('Buyer profile not found.', 404);
    return $bp['id'];
}

// ── Shared: get or create cart for buyer ──────────────────────────
function get_or_create_cart($buyerId)
{
    $db   = lue_db();
    $stmt = $db->prepare('SELECT id FROM carts WHERE buyer_id = ?');
    $stmt->execute([$buyerId]);
    $cart = $stmt->fetch();
    if ($cart) return $cart['id'];

    $cartId = lue_uuid();
    $db->prepare('INSERT INTO carts (id, buyer_id) VALUES (?, ?)')->execute([$cartId, $buyerId]);
    return $cartId;
}

// ── GET CART ───────────────────────────────────────────────────────
function handle_get_cart()
{
    lue_method('GET');
    $buyerId = get_buyer_id();
    $cartId  = get_or_create_cart($buyerId);
    $db      = lue_db();

    $stmt = $db->prepare('
        SELECT ci.id, ci.quantity, ci.variant,
               l.id AS listing_id, l.price, l.rrp, l.stock_qty, l.image_urls,
               p.name, p.brand,
               sp.store_name AS seller_name
        FROM cart_items ci
        JOIN listings l         ON l.id  = ci.listing_id
        JOIN products p         ON p.id  = l.product_id
        JOIN seller_profiles sp ON sp.id = l.seller_id
        WHERE ci.cart_id = ?
        ORDER BY ci.added_at DESC
    ');
    $stmt->execute([$cartId]);
    lue_ok($stmt->fetchAll());
}

// ── ADD TO CART ────────────────────────────────────────────────────
function handle_add()
{
    lue_method('POST');
    $buyerId   = get_buyer_id();
    $cartId    = get_or_create_cart($buyerId);
    $body      = lue_json_body();
    $listingId = lue_clean(lue_get($body, 'listing_id', ''));
    $qty       = max(1, (int) lue_get($body, 'quantity', 1));
    $variant   = lue_clean(lue_get($body, 'variant', ''));

    if ($listingId === '') lue_error('listing_id is required.');

    $db = lue_db();

    // Verify listing exists and is live
    $ls = $db->prepare('SELECT id, stock_qty FROM listings WHERE id = ? AND status = \'live\'');
    $ls->execute([$listingId]);
    $listing = $ls->fetch();
    if (!$listing) lue_error('Listing not found or not available.', 404);
    if ($listing['stock_qty'] < $qty) lue_error('Not enough stock. Available: ' . $listing['stock_qty']);

    // Insert or increment existing cart item
    $existing = $db->prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND listing_id = ?');
    $existing->execute([$cartId, $listingId]);
    $item = $existing->fetch();

    if ($item) {
        $newQty = min($listing['stock_qty'], $item['quantity'] + $qty);
        $db->prepare('UPDATE cart_items SET quantity = ? WHERE id = ?')->execute([$newQty, $item['id']]);
    } else {
        $db->prepare('INSERT INTO cart_items (id, cart_id, listing_id, quantity, variant) VALUES (?, ?, ?, ?, ?)')
           ->execute([lue_uuid(), $cartId, $listingId, $qty, $variant]);
    }

    // Update cart timestamp
    $db->prepare('UPDATE carts SET updated_at = ? WHERE id = ?')->execute([lue_now(), $cartId]);
    lue_ok(['message' => 'Item added to cart.']);
}

// ── UPDATE QUANTITY ────────────────────────────────────────────────
function handle_update()
{
    lue_method('POST');
    $buyerId = get_buyer_id();
    $body    = lue_json_body();
    $itemId  = lue_clean(lue_get($body, 'item_id', ''));
    $qty     = max(1, (int) lue_get($body, 'quantity', 1));

    if ($itemId === '') lue_error('item_id is required.');

    $db   = lue_db();
    $cartId = get_or_create_cart($buyerId);

    // Confirm item belongs to this buyer's cart
    $check = $db->prepare('SELECT ci.id FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE ci.id = ? AND c.buyer_id = ?');
    $check->execute([$itemId, $buyerId]);
    if (!$check->fetch()) lue_error('Cart item not found.', 404);

    $db->prepare('UPDATE cart_items SET quantity = ? WHERE id = ?')->execute([$qty, $itemId]);
    $db->prepare('UPDATE carts SET updated_at = ? WHERE id = ?')->execute([lue_now(), $cartId]);
    lue_ok(['message' => 'Quantity updated.']);
}

// ── REMOVE ITEM ────────────────────────────────────────────────────
function handle_remove()
{
    lue_method('DELETE');
    $buyerId = get_buyer_id();
    $itemId  = lue_clean($_GET['id'] ?? '');
    if ($itemId === '') lue_error('Item ID is required.');

    $db    = lue_db();
    $check = $db->prepare('SELECT ci.id FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE ci.id = ? AND c.buyer_id = ?');
    $check->execute([$itemId, $buyerId]);
    if (!$check->fetch()) lue_error('Cart item not found.', 404);

    $db->prepare('DELETE FROM cart_items WHERE id = ?')->execute([$itemId]);
    lue_ok(['message' => 'Item removed.']);
}

// ── CLEAR CART ─────────────────────────────────────────────────────
function handle_clear()
{
    lue_method('POST');
    $buyerId = get_buyer_id();
    $cartId  = get_or_create_cart($buyerId);
    lue_db()->prepare('DELETE FROM cart_items WHERE cart_id = ?')->execute([$cartId]);
    lue_ok(['message' => 'Cart cleared.']);
}

