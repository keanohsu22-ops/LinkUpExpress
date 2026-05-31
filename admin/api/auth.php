<?php
error_reporting(0);
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

require_once __DIR__ . '/helpers.php';

$body     = admin_json_body();
$email    = strtolower(trim($body['username'] ?? $body['email'] ?? ''));
$password = trim($body['password'] ?? '');

if (!$email || !$password) admin_error('Email and password are required.');

$db   = admin_db();
$stmt = $db->prepare("SELECT * FROM admin_users WHERE email = ? AND status = 'active'");
$stmt->execute([$email]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid email or password.']);
    exit;
}

// Update last_login
$db->prepare("UPDATE admin_users SET last_login = ? WHERE id = ?")
   ->execute([date('Y-m-d H:i:s'), $user['id']]);

$isSuperAdmin = (int)($user['super_admin'] ?? 0) === 1;
$token        = hash('sha256', ADMIN_TOKEN_SECRET . $user['id'] . date('Y-m-d'));

ob_end_clean();
echo json_encode([
    'ok'          => true,
    'token'       => $token,
    'username'    => $user['full_name'],
    'super_admin' => $isSuperAdmin,
    'admin_id'    => $user['id'],
]);
