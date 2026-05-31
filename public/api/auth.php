<?php
/**
 * api/auth.php — LinkUp Express Authentication API
 * ─────────────────────────────────────────────────────────────────
 * Handles user registration, login, logout, and session checks.
 *
 * Routes (determined by ?action= query parameter):
 *
 *   POST  ?action=register   Register a new buyer or seller
 *   POST  ?action=login      Log in with email + password
 *   POST  ?action=logout     Destroy the current session
 *   GET   ?action=me         Return the current session user
 *
 * All responses are JSON: { ok: true, data: {...} } or { ok: false, error: "..." }
 * ─────────────────────────────────────────────────────────────────
 */


require_once __DIR__ . '/../includes/db.php';
require_once __DIR__ . '/../includes/helpers.php';

// ── CORS pre-flight ────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }

// ── Route ──────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register': handle_register(); break;
    case 'login': handle_login(); break;
    case 'login_token': handle_login_token(); break;
    case 'logout': handle_logout(); break;
    case 'me': handle_me(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ══════════════════════════════════════════════════════════════════
// REGISTER
// ══════════════════════════════════════════════════════════════════
function handle_register()
{
    lue_method('POST');
    $body = lue_json_body();

    $fullName = lue_clean(lue_get($body, 'fullName', ''));
    $email    = lue_clean(lue_get($body, 'email', ''));
    $phone    = lue_clean(lue_get($body, 'phone', ''));
    $address  = lue_clean(lue_get($body, 'address', ''));
    $password = lue_get($body, 'password', '');
    $role     = lue_clean(lue_get($body, 'role', 'buyer'));

    // ── Validate ────────────────────────────────────────────────
    if (strlen($fullName) < 2) {
        lue_error('Full name must be at least 2 characters.');
    }
    if (!lue_valid_email($email)) {
        lue_error('Please enter a valid email address.');
    }
    if (!lue_valid_phone($phone)) {
        lue_error('Please enter a valid South African phone number.');
    }
    if (strlen($address) < 5) {
        lue_error('Please enter a valid delivery address.');
    }
    if (!lue_valid_password($password)) {
        lue_error('Password must be at least 8 characters.');
    }
    if (!in_array($role, ['buyer', 'seller'], true)) {
        lue_error('Role must be buyer or seller.');
    }

    $db = lue_db();

    // ── Check for duplicate email ────────────────────────────────
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ? ');
    $stmt->execute([strtolower($email)]);
    if ($stmt->fetch()) {
        lue_error('An account with this email already exists. Please log in.', 409);
    }

    // ── Insert user ──────────────────────────────────────────────
    $userId = lue_uuid();
    $now    = lue_now();

    $stmt = $db->prepare('
        INSERT INTO users (id, full_name, email, phone, password_hash, role, status, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, \'active\', 0, ?, ?)
    ');
    $stmt->execute([
        $userId,
        $fullName,
        strtolower($email),
        $phone,
        lue_hash_password($password),
        $role,
        $now,
        $now,
    ]);

    // ── Create buyer or seller profile ───────────────────────────
    $profileId = lue_uuid();
    if ($role === 'buyer') {
        $db->prepare('INSERT INTO buyer_profiles (id, user_id, created_at) VALUES (?, ?, ?)')
           ->execute([$profileId, $userId, $now]);
    } else {
        $storeName = $fullName . "'s Store";
        $db->prepare('INSERT INTO seller_profiles (id, user_id, store_name, created_at) VALUES (?, ?, ?, ?)')
           ->execute([$profileId, $userId, $storeName, $now]);
    }

    // ── Also create an empty cart for buyers ─────────────────────
    if ($role === 'buyer') {
        $cartId = lue_uuid();
        $db->prepare('INSERT INTO carts (id, buyer_id) VALUES (?, ?)')
           ->execute([$cartId, $profileId]);
    }

    // Save address_street to new column
    if ($address) {
        $db->prepare('UPDATE users SET address_street = ?, updated_at = ? WHERE id = ?')
           ->execute([$address, $now, $userId]);
    }

    // ── Start session ────────────────────────────────────────────
    $_SESSION['user'] = [
        'id'               => $userId,
        'profileId'        => $profileId,
        'fullName'         => $fullName,
        'email'            => strtolower($email),
        'phone'            => $phone,
        'role'             => $role,
        'address_street'   => $address,
        'address_city'     => '',
        'address_postal'   => '',
        'address_province' => '',
        'address_country'  => 'South Africa',
    ];

    lue_ok([
        'id'               => $userId,
        'fullName'         => $fullName,
        'email'            => strtolower($email),
        'phone'            => $phone,
        'role'             => $role,
        'address_street'   => $address,
        'address_city'     => '',
        'address_postal'   => '',
        'address_province' => '',
        'address_country'  => 'South Africa',
    ], 201);
}

// ══════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════
function handle_login()
{
    lue_method('POST');
    $body     = lue_json_body();
    $email    = lue_clean(lue_get($body, 'email', ''));
    $password = lue_get($body, 'password', '');

    if (!lue_valid_email($email)) {
        lue_error('Please enter a valid email address.');
    }
    if (empty($password)) {
        lue_error('Please enter your password.');
    }

    $db   = lue_db();
    $stmt = $db->prepare('SELECT * FROM users WHERE email = ?  AND status = \'active\'');
    $stmt->execute([strtolower($email)]);
    $user = $stmt->fetch();

    if (!$user) {
        lue_error('No active account found with this email address.', 401);
    }

    if (!lue_verify_password($password, $user['password_hash'])) {
        lue_error('Incorrect password. Please try again.', 401);
    }

    // ── Get profile ID ───────────────────────────────────────────
    $profileId = null;
    if ($user['role'] === 'buyer') {
        $p = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
    } else {
        $p = $db->prepare('SELECT id FROM seller_profiles WHERE user_id = ?');
    }
    $p->execute([$user['id']]);
    $profile   = $p->fetch();
    $profileId = $profile['id'] ?? null;

    // ── Update last_login (if column exists) ────────────────────
    try {
        $db->prepare('UPDATE users SET last_login = ? WHERE id = ?')
           ->execute([lue_now(), $user['id']]);
    } catch (Exception $e) { /* column may not exist — ignore */ }

    // ── Set session ──────────────────────────────────────────────
    $_SESSION['user'] = [
        'id'        => $user['id'],
        'profileId' => $profileId,
        'fullName'         => $user['full_name'],
        'email'            => $user['email'],
        'phone'            => $user['phone']             ?? '',
        'role'             => $user['role'],
        'address_street'   => $user['address_street']   ?? '',
        'address_city'     => $user['address_city']     ?? '',
        'address_postal'   => $user['address_postal']   ?? '',
        'address_province' => $user['address_province'] ?? '',
        'address_country'  => $user['address_country']  ?? 'South Africa',
    ];

    lue_ok([
        'id'               => $user['id'],
        'fullName'         => $user['full_name'],
        'email'            => $user['email'],
        'phone'            => $user['phone']             ?? '',
        'role'             => $user['role'],
        'address_street'   => $user['address_street']   ?? '',
        'address_city'     => $user['address_city']     ?? '',
        'address_postal'   => $user['address_postal']   ?? '',
        'address_province' => $user['address_province'] ?? '',
        'address_country'  => $user['address_country']  ?? 'South Africa',
    ]);
}

// ══════════════════════════════════════════════════════════════════
// LOGIN WITH HASH TOKEN (re-authentication from localStorage)
function handle_login_token()
{
    lue_method('POST');
    $body  = lue_json_body();
    $email = strtolower(lue_clean(lue_get($body, 'email', '')));
    $token = lue_get($body, 'token', '');

    if (!$email || !$token) lue_error('Email and token required.');

    $db   = lue_db();
    $stmt = $db->prepare("SELECT * FROM users WHERE email = ?  AND status = 'active'");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) lue_error('User not found.', 401);

    // Accept the stored password hash directly (JS client-side hash or bcrypt)
    $valid = ($token === $user['password_hash']) ||
             password_verify($token, $user['password_hash']);

    if (!$valid) lue_error('Invalid token.', 401);

    // Get profile ID
    $tbl = $user['role'] === 'seller' ? 'seller_profiles' : 'buyer_profiles';
    $p   = $db->prepare("SELECT id FROM {$tbl} WHERE user_id = ?");
    $p->execute([$user['id']]);
    $profile = $p->fetch();

    $_SESSION['user'] = [
        'id'        => $user['id'],
        'profileId' => $profile['id'] ?? null,
        'fullName'         => $user['full_name'],
        'email'            => $user['email'],
        'phone'            => $user['phone']             ?? '',
        'role'             => $user['role'],
        'address_street'   => $user['address_street']   ?? '',
        'address_city'     => $user['address_city']     ?? '',
        'address_postal'   => $user['address_postal']   ?? '',
        'address_province' => $user['address_province'] ?? '',
        'address_country'  => $user['address_country']  ?? 'South Africa',
    ];

    lue_ok(['id' => $user['id'], 'role' => $user['role']]);
}

// LOGOUT
// ══════════════════════════════════════════════════════════════════
function handle_logout()
{
    lue_method('POST');
    $_SESSION = [];
    session_destroy();
    lue_ok(['message' => 'Logged out successfully.']);
}

// ══════════════════════════════════════════════════════════════════
// ME — return current session user
// ══════════════════════════════════════════════════════════════════
function handle_me()
{
    lue_method('GET');

    // 1. Check PHP session
    if (!empty($_SESSION['user'])) {
        $u = $_SESSION['user'];
        // Re-fetch user to get latest address data
        $db   = lue_db();
        $stmt = $db->prepare("SELECT * FROM users WHERE id = ? AND status = 'active'");
        $stmt->execute([$u['id']]);
        $fresh = $stmt->fetch();
        if ($fresh) {
            lue_ok([
                'id'               => $fresh['id'],
                'fullName'         => $fresh['full_name'],
                'email'            => $fresh['email'],
                'phone'            => $fresh['phone']             ?? '',
                'role'             => $fresh['role'],
                'address_street'   => $fresh['address_street']   ?? '',
                'address_city'     => $fresh['address_city']     ?? '',
                'address_postal'   => $fresh['address_postal']   ?? '',
                'address_province' => $fresh['address_province'] ?? '',
                'address_country'  => $fresh['address_country']  ?? 'South Africa',
            ]);
        }
    }

    // 2. Fallback — accept user_id from query string
    $userId = isset($_GET['user_id']) ? trim($_GET['user_id']) : '';
    if (!$userId) {
        $body   = json_decode(file_get_contents('php://input'), true) ?? [];
        $userId = isset($body['user_id']) ? $body['user_id'] : '';
    }

    if ($userId) {
        $db   = lue_db();
        $stmt = $db->prepare("SELECT id, full_name, email, phone, role FROM users WHERE id = ? AND status = 'active'");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        if ($user) {
            // Restore PHP session so future calls work
            $_SESSION['user'] = [
                'id'              => $user['id'],
                'fullName'        => $user['full_name'],
                'email'           => $user['email'],
                'phone'           => $user['phone'] ?? '',
                'role'            => $user['role'],
                'address_street'  => $user['address_street']   ?? '',
                'address_city'    => $user['address_city']     ?? '',
                'address_postal'  => $user['address_postal']   ?? '',
                'address_province'=> $user['address_province'] ?? '',
                'address_country' => $user['address_country']  ?? 'South Africa',
            ];
            lue_ok($_SESSION['user']);
        }
    }

    lue_ok(null); // Not logged in
}