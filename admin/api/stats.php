<?php
error_reporting(0);
ini_set('display_errors','0');
/**
 * admin/api/stats.php — Dashboard statistics
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');

require_once __DIR__ . '/helpers.php';

admin_auth_guard();

$db = admin_db();

$stats = [];

// Counts
$stats['users']    = $db->query("SELECT COUNT(*) FROM users WHERE status != 'deleted'")->fetchColumn();
$stats['listings'] = $db->query("SELECT COUNT(*) FROM listings")->fetchColumn();
$stats['orders']   = $db->query("SELECT COUNT(*) FROM orders")->fetchColumn();
$stats['revenue']  = $db->query("SELECT COALESCE(SUM(total),0) FROM orders WHERE status != 'cancelled'")->fetchColumn();

// Recent orders
$stmt = $db->query("
    SELECT o.ref_number, o.total, o.status, o.placed_at,
           u.full_name AS buyer_name
    FROM orders o
    LEFT JOIN buyer_profiles bp ON bp.id = o.buyer_id
    LEFT JOIN users u ON u.id = bp.user_id
    ORDER BY o.placed_at DESC
    LIMIT 10
");
$stats['recent_orders'] = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode(['ok' => true, 'data' => $stats]);
