<?php
require_once __DIR__ . '/../includes/db.php';
header('Content-Type: application/json');
$db = lue_db();
$uid = $_GET['user_id'] ?? '';

try {
    $stmt = $db->prepare('SELECT id, full_name, email, phone, role, status, email_verified, created_at, last_login FROM users WHERE id = ?');
    $stmt->execute([$uid]);
    $profile = $stmt->fetch();
    $out = ['step1_user' => $profile];

    $sp = $db->prepare('SELECT id, store_name, store_bio, rating, total_sales, verified FROM seller_profiles WHERE user_id = ?');
    $sp->execute([$uid]);
    $sellerProfile = $sp->fetch();
    $out['step2_seller_profile'] = $sellerProfile;

    if ($sellerProfile) {
        $lc = $db->prepare("SELECT COUNT(*) AS cnt FROM listings WHERE seller_id = ? AND status = 'live'");
        $lc->execute([$sellerProfile['id']]);
        $out['step3_active_listings'] = $lc->fetch();

        $oc = $db->prepare("
            SELECT COUNT(DISTINCT oi.order_id) AS cnt
            FROM order_items oi
            JOIN listings l ON l.id = oi.listing_id
            WHERE l.seller_id = ?
        ");
        $oc->execute([$sellerProfile['id']]);
        $out['step4_orders'] = $oc->fetch();
    }

    echo json_encode(['ok'=>true,'data'=>$out]);
} catch (Exception $e) {
    echo json_encode(['ok'=>false,'error'=>$e->getMessage(),'trace'=>$e->getTraceAsString()]);
}
