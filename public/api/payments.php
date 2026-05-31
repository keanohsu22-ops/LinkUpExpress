<?php
/**
 * api/payments.php — LinkUp Express Payments API (Yoko Gateway)
 * ─────────────────────────────────────────────────────────────────
 * Routes:
 *   POST  ?action=process      Process payment via Yoko for an order
 *   GET   ?action=receipt&id=X Return payment receipt for an order
 * ─────────────────────────────────────────────────────────────────
 */
require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

$action = $_GET['action'] ?? '';
switch ($action) {
    case 'process': handle_process(); break;
    case 'receipt': handle_receipt(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ══════════════════════════════════════════════════════════════════
// PROCESS PAYMENT via Yoko
// ══════════════════════════════════════════════════════════════════
function handle_process()
{
    lue_method('POST');
    $user = lue_require_auth();
    $body = lue_json_body();

    $orderId    = lue_clean(lue_get($body, 'order_id',   ''));
    $cardNumber = lue_clean(lue_get($body, 'card_number',''));
    $cardExpiry = lue_clean(lue_get($body, 'card_expiry',''));
    $cardCvv    = lue_clean(lue_get($body, 'card_cvv',  ''));
    $cardholder = lue_clean(lue_get($body, 'cardholder',''));
    $cardType   = lue_clean(lue_get($body, 'card_type', 'visa'));

    // ── Validate inputs ──────────────────────────────────────────
    if ($orderId === '')    lue_error('order_id is required.');
    if ($cardNumber === '') lue_error('Card number is required.');
    if ($cardExpiry === '') lue_error('Card expiry is required.');
    if ($cardCvv === '')   lue_error('CVV is required.');
    if ($cardholder === '') lue_error('Cardholder name is required.');

    // Basic card number validation (strip spaces, check 13-19 digits)
    $cleanCard = preg_replace('/\s+/', '', $cardNumber);
    if (!preg_match('/^\d{13,19}$/', $cleanCard)) {
        lue_error('Invalid card number format.');
    }

    // Expiry format MM/YY
    if (!preg_match('/^(0[1-9]|1[0-2])\/\d{2}$/', $cardExpiry)) {
        lue_error('Invalid expiry date. Use MM/YY format.');
    }

    // Check card is not expired
    [$expMonth, $expYear] = explode('/', $cardExpiry);
    $expTimestamp = mktime(0, 0, 0, (int)$expMonth + 1, 1, (int)('20' . $expYear));
    if ($expTimestamp < time()) {
        lue_error('This card has expired.');
    }

    // CVV must be 3 or 4 digits
    if (!preg_match('/^\d{3,4}$/', $cardCvv)) {
        lue_error('Invalid CVV.');
    }

    $db = lue_db();

    // ── Verify the order belongs to this user and is unpaid ──────
    $stmt = $db->prepare('
        SELECT o.id, o.total, o.status
        FROM orders o
        JOIN buyer_profiles bp ON bp.id = o.buyer_id
        WHERE o.id = ? AND bp.user_id = ?
    ');
    $stmt->execute([$orderId, $user['id']]);
    $order = $stmt->fetch();

    if (!$order) lue_error('Order not found.', 404);
    if ($order['status'] === 'cancelled') lue_error('This order has been cancelled.');

    // Check if already paid
    $existingPay = $db->prepare('SELECT id FROM payments WHERE order_id = ? AND status = \'confirmed\'');
    $existingPay->execute([$orderId]);
    if ($existingPay->fetch()) lue_error('This order has already been paid.', 409);

    // ── Simulate Yoko Gateway ────────────────────────────────────
    // In production this would make an HTTP request to the Yoko API.
    // For the prototype we simulate a successful authorisation.
    $yokoResult = yoko_simulate_charge([
        'amount'      => (float) $order['total'],
        'currency'    => 'ZAR',
        'card_number' => $cleanCard,
        'cardholder'  => $cardholder,
        'card_type'   => $cardType,
    ]);

    if (!$yokoResult['authorised']) {
        // Record a failed payment attempt
        $db->prepare('
            INSERT INTO payments
              (id, order_id, yoko_txn_id, auth_code, card_masked, card_type,
               cardholder, amount, currency, status, three_ds_verified, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'ZAR\', \'failed\', 0, ?)
        ')->execute([
            lue_uuid(), $orderId,
            $yokoResult['txn_id'], 'DECLINED',
            mask_card($cleanCard), $cardType,
            strtoupper($cardholder),
            $order['total'], lue_now(),
        ]);
        lue_error($yokoResult['message'] ?? 'Payment declined by gateway.', 402);
    }

    // ── Store confirmed payment ───────────────────────────────────
    $paymentId = lue_uuid();
    $db->prepare('
        INSERT INTO payments
          (id, order_id, yoko_txn_id, auth_code, card_masked, card_type,
           cardholder, amount, currency, status, three_ds_verified, paid_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'ZAR\', \'confirmed\', 1, ?)
    ')->execute([
        $paymentId, $orderId,
        $yokoResult['txn_id'],
        $yokoResult['auth_code'],
        mask_card($cleanCard),
        $cardType,
        strtoupper($cardholder),
        $order['total'],
        lue_now(),
    ]);

    // ── Update order status to preparing ─────────────────────────
    $db->prepare('UPDATE orders SET status = \'preparing\', updated_at = ? WHERE id = ?')
       ->execute([lue_now(), $orderId]);

    lue_ok([
        'payment_id'  => $paymentId,
        'txn_id'      => $yokoResult['txn_id'],
        'auth_code'   => $yokoResult['auth_code'],
        'card_masked' => mask_card($cleanCard),
        'amount'      => $order['total'],
        'status'      => 'confirmed',
    ], 201);
}

// ══════════════════════════════════════════════════════════════════
// RECEIPT
// ══════════════════════════════════════════════════════════════════
function handle_receipt()
{
    lue_method('GET');
    $user    = lue_require_auth();
    $orderId = lue_clean($_GET['id'] ?? '');
    if ($orderId === '') lue_error('Order ID is required.');

    $db   = lue_db();
    $stmt = $db->prepare('
        SELECT o.ref_number, o.subtotal, o.discount, o.vat, o.total,
               o.status, o.placed_at,
               p.id AS payment_id, p.yoko_txn_id, p.auth_code,
               p.card_masked, p.card_type, p.cardholder,
               p.amount, p.status AS payment_status,
               p.three_ds_verified, p.paid_at,
               u.full_name AS buyer_name, u.email AS buyer_email,
               da.street, da.city, da.postal_code, da.province, da.country
        FROM orders o
        JOIN buyer_profiles bp  ON bp.id = o.buyer_id
        JOIN users u            ON u.id  = bp.user_id
        LEFT JOIN payments p    ON p.order_id = o.id
        LEFT JOIN delivery_addresses da ON da.id = o.delivery_address_id
        WHERE o.id = ? AND bp.user_id = ?
    ');
    $stmt->execute([$orderId, $user['id']]);
    $receipt = $stmt->fetch();
    if (!$receipt) lue_error('Receipt not found.', 404);

    // Attach order items
    $items = $db->prepare('SELECT product_name, seller_name, unit_price, quantity, line_total FROM order_items WHERE order_id = ?');
    $items->execute([$orderId]);
    $receipt['items'] = $items->fetchAll();

    lue_ok($receipt);
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

/**
 * Simulate the Yoko payment gateway charge.
 * Replace this function body with real Yoko API calls in production.
 *
 * @param $payload
 * @return array { authorised, txn_id, auth_code, message? }
 */
function yoko_simulate_charge($payload)
{
    // Simulate a small failure rate for realism (5%)
    if (mt_rand(1, 100) <= 5) {
        return [
            'authorised' => false,
            'txn_id'     => 'YKO-FAIL-' . strtoupper(substr(md5(uniqid()), 0, 8)),
            'auth_code'  => '',
            'message'    => 'Payment declined. Please check your card details and try again.',
        ];
    }

    // Generate realistic-looking Yoko transaction identifiers
    $seg = fn($n) => strtoupper(substr(md5(uniqid()), 0, $n));
    return [
        'authorised' => true,
        'txn_id'     => sprintf('YKO-%s-%s-%s', $seg(4), $seg(4), $seg(4)),
        'auth_code'  => 'AUTH-' . mt_rand(100000, 999999),
        'message'    => 'Authorised',
    ];
}

/**
 * Mask all but the last 4 digits of a card number.
 * @param $card raw digits only
 * @return string  e.g. "**** **** **** 4821"
 */
function mask_card($card)
{
    $last4  = substr($card, -4);
    $groups = str_repeat('**** ', (int)ceil((strlen($card) - 4) / 4));
    return rtrim($groups) . ' ' . $last4;
}
