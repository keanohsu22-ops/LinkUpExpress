<?php
/**
 * admin/api/helpers.php — Shared admin helpers
 */
// Suppress PHP warnings from leaking into JSON output
error_reporting(0);
ini_set('display_errors', '0');
ob_start(); // Buffer any accidental output

// ── MySQL credentials — must match db.php ────────────────────────
// These are read from the main db.php constants
require_once __DIR__ . '/../../public/includes/db.php';
define('ADMIN_TOKEN_SECRET', 'lue_admin_secret_8x2k9');

// Allowed tables for CRUD — prevents SQL injection via table name
define('ALLOWED_TABLES', [
    'users', 'seller_profiles', 'buyer_profiles',
    'listings', 'products', 'categories',
    'orders', 'order_items', 'cart_items',
    'carts', 'shipping_options', 'payments', 'audit_logs', 'admin_users'
]);

function admin_db(): PDO {
    return lue_db(); // Shared MySQL connection
}

function admin_auth_guard(): void {
    $token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if (!$token) {
        ob_end_clean();
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'No token provided. Please log in.']);
        exit;
    }

    // Validate token against all admin users in DB
    try {
        $db   = admin_db();
        $stmt = $db->query("SELECT id FROM admin_users WHERE status = 'active'");
        $users = $stmt->fetchAll();
        $valid = false;
        foreach ($users as $u) {
            $expected = hash('sha256', ADMIN_TOKEN_SECRET . $u['id'] . date('Y-m-d'));
            if (hash_equals($expected, $token)) { $valid = true; break; }
        }
        if (!$valid) {
            ob_end_clean();
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'Invalid or expired session. Please log in again.']);
            exit;
        }
    } catch (Exception $e) {
        ob_end_clean();
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Auth check failed: ' . $e->getMessage()]);
        exit;
    }
}

// Check if current admin is a super admin
function admin_is_super(): bool {
    $token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    try {
        $db   = admin_db();
        $stmt = $db->query("SELECT id, super_admin FROM admin_users WHERE status = 'active'");
        foreach ($stmt->fetchAll() as $u) {
            $expected = hash('sha256', ADMIN_TOKEN_SECRET . $u['id'] . date('Y-m-d'));
            if (hash_equals($expected, $token)) {
                return (int)$u['super_admin'] === 1;
            }
        }
    } catch (Exception $e) {}
    return false;
}

function admin_ok($data = null): void {
    ob_end_clean();
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}

function admin_error(string $msg, int $code = 400): void {
    ob_end_clean();
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function admin_json_body(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function admin_clean(string $val): string {
    return trim(strip_tags($val));
}

function admin_uuid(): string {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff),
        mt_rand(0,0x0fff)|0x4000, mt_rand(0,0x3fff)|0x8000,
        mt_rand(0,0xffff), mt_rand(0,0xffff), mt_rand(0,0xffff));
}

function admin_now(): string {
    return date('Y-m-d H:i:s');
}
