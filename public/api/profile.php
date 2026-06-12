<?php
/**
 * api/profile.php — LinkUp Express User Profile API
 * ─────────────────────────────────────────────────────────────────
 * Routes:
 *   GET   ?action=get            Return full profile for logged-in user
 *   POST  ?action=update         Update personal / contact / address fields
 *   POST  ?action=change_password  Change password (requires current password)
 *   POST  ?action=switch_role    Switch between buyer and seller
 *   POST  ?action=delete         Permanently delete account
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
    case 'get': handle_get(); break;
    case 'update': handle_update(); break;
    case 'change_password': handle_change_password(); break;
    case 'switch_role': handle_switch_role(); break;
    case 'delete': handle_delete(); break;
    default: lue_error('Unknown action: ' . $action, 404);
}

// ══════════════════════════════════════════════════════════════════
// GET PROFILE
// ══════════════════════════════════════════════════════════════════
function handle_get()
{
    lue_method('GET');
    $user = lue_require_auth();
    $db   = lue_db();

    $stmt = $db->prepare('SELECT id, full_name, email, phone, role, status, email_verified, created_at FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $profile = $stmt->fetch();
    if (!$profile) lue_error('User not found.', 404);

    // Attach role-specific profile data with LIVE counts from the database
    if ($profile['role'] === 'buyer') {
        $bp = $db->prepare('SELECT id, total_orders, total_spent FROM buyer_profiles WHERE user_id = ?');
        $bp->execute([$user['id']]);
        $buyerProfile = $bp->fetch();
        $profile['buyer_profile'] = $buyerProfile;

        if ($buyerProfile) {
            // Live count of orders placed
            $oc = $db->prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0) AS spent FROM orders WHERE buyer_id = ?');
            $oc->execute([$buyerProfile['id']]);
            $orderStats = $oc->fetch();
            $profile['total_orders'] = (int) $orderStats['cnt'];
            $profile['total_spent']  = (float) $orderStats['spent'];
        } else {
            $profile['total_orders'] = 0;
            $profile['total_spent']  = 0;
        }
    } else {
        $sp = $db->prepare('SELECT id, store_name, store_bio, rating, total_sales, verified FROM seller_profiles WHERE user_id = ?');
        $sp->execute([$user['id']]);
        $sellerProfile = $sp->fetch();
        $profile['seller_profile'] = $sellerProfile;

        if ($sellerProfile) {
            // Live count of active (live) listings
            $lc = $db->prepare("SELECT COUNT(*) AS cnt FROM listings WHERE seller_id = ? AND status = 'live'");
            $lc->execute([$sellerProfile['id']]);
            $profile['active_listings'] = (int) $lc->fetch()['cnt'];

            // Live count of total orders containing this seller's listings
            $oc = $db->prepare("
                SELECT COUNT(DISTINCT oi.order_id) AS cnt
                FROM order_items oi
                JOIN listings l ON l.id = oi.listing_id
                WHERE l.seller_id = ?
            ");
            $oc->execute([$sellerProfile['id']]);
            $profile['total_orders'] = (int) $oc->fetch()['cnt'];
        } else {
            $profile['active_listings'] = 0;
            $profile['total_orders']    = 0;
        }
    }

    lue_ok($profile);
}

// ══════════════════════════════════════════════════════════════════
// UPDATE PROFILE FIELDS
// ══════════════════════════════════════════════════════════════════
function handle_update()
{
    lue_method('POST');
    $user = lue_require_auth();
    $body = lue_json_body();
    $db   = lue_db();
    $now  = lue_now();

    // ── Personal fields ──────────────────────────────────────────
    if (isset($body['full_name'])) {
        $name = lue_clean($body['full_name']);
        if (strlen($name) < 2) lue_error('Full name must be at least 2 characters.');
        $db->prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?')
           ->execute([$name, $now, $user['id']]);
        $_SESSION['user']['fullName'] = $name;
    }

    // ── Email ─────────────────────────────────────────────────────
    if (isset($body['email'])) {
        $email = strtolower(lue_clean($body['email']));
        if (!lue_valid_email($email)) lue_error('Invalid email address.');

        // Check not already taken by another user
        $dup = $db->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
        $dup->execute([$email, $user['id']]);
        if ($dup->fetch()) lue_error('This email address is already in use.', 409);

        $db->prepare('UPDATE users SET email = ?, email_verified = 0, updated_at = ? WHERE id = ?')
           ->execute([$email, $now, $user['id']]);
        $_SESSION['user']['email'] = $email;
    }

    // ── Phone ─────────────────────────────────────────────────────
    if (isset($body['phone'])) {
        $phone = lue_clean($body['phone']);
        if (!lue_valid_phone($phone)) lue_error('Invalid South African phone number.');
        $db->prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?')
           ->execute([$phone, $now, $user['id']]);
        $_SESSION['user']['phone'] = $phone;
    }

    // ── Seller store details ─────────────────────────────────────
    if (isset($body['store_name']) && $user['role'] === 'seller') {
        $storeName = lue_clean($body['store_name']);
        $storeBio  = isset($body['store_bio']) ? lue_clean($body['store_bio']) : '';
        $db->prepare('UPDATE seller_profiles SET store_name=?, store_bio=? WHERE user_id=?')
           ->execute([$storeName, $storeBio, $user['id']]);
    }

    // ── Address fields ────────────────────────────────────────────
    $addressFields = ['address_street', 'address_city', 'address_postal', 'address_province', 'address_country'];
    foreach ($addressFields as $field) {
        if (isset($body[$field])) {
            $val = lue_clean($body[$field]);
            $db->prepare("UPDATE users SET {$field} = ?, updated_at = ? WHERE id = ?")
               ->execute([$val, $now, $user['id']]);
        }
    }

    // ── Legacy single 'address' field — split and save ────────────
    if (isset($body['address']) && !isset($body['address_street'])) {
        $addr = lue_clean($body['address']);
        $db->prepare('UPDATE users SET address_street = ?, updated_at = ? WHERE id = ?')
           ->execute([$addr, $now, $user['id']]);
    }

    lue_ok(['message' => 'Profile updated successfully.']);
}

// ══════════════════════════════════════════════════════════════════
// CHANGE PASSWORD
// ══════════════════════════════════════════════════════════════════
function handle_change_password()
{
    lue_method('POST');
    $user = lue_require_auth();
    $body = lue_json_body();

    $currentPwd = lue_get($body, 'current_password', '');
    $newPwd     = lue_get($body, 'new_password',     '');
    $confirmPwd = lue_get($body, 'confirm_password', '');

    if (empty($currentPwd)) lue_error('Current password is required.');
    if (!lue_valid_password($newPwd)) lue_error('New password must be at least 8 characters.');
    if ($newPwd !== $confirmPwd)      lue_error('Passwords do not match.');

    $db   = lue_db();
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row  = $stmt->fetch();

    if (!lue_verify_password($currentPwd, $row['password_hash'])) {
        lue_error('Current password is incorrect.', 401);
    }

    $db->prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
       ->execute([lue_hash_password($newPwd), lue_now(), $user['id']]);

    lue_ok(['message' => 'Password changed successfully.']);
}

// ══════════════════════════════════════════════════════════════════
// SWITCH ROLE
// ══════════════════════════════════════════════════════════════════
function handle_switch_role()
{
    lue_method('POST');
    $user = lue_require_auth();
    $body = lue_json_body();
    $role = lue_clean(lue_get($body, 'role', ''));

    if (!in_array($role, ['buyer', 'seller'], true)) {
        lue_error('Role must be buyer or seller.');
    }
    if ($user['role'] === $role) {
        lue_error('Your account is already set to ' . $role . '.');
    }

    $db  = lue_db();
    $now = lue_now();

    // Create the new profile if it does not exist yet
    if ($role === 'seller') {
        $exists = $db->prepare('SELECT id FROM seller_profiles WHERE user_id = ?');
        $exists->execute([$user['id']]);
        if (!$exists->fetch()) {
            $db->prepare('INSERT INTO seller_profiles (id,user_id,store_name,created_at) VALUES (?,?,?,?)')
               ->execute([lue_uuid(), $user['id'], $user['fullName'] . "'s Store", $now]);
        }
    } else {
        $exists = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
        $exists->execute([$user['id']]);
        if (!$exists->fetch()) {
            $profileId = lue_uuid();
            $db->prepare('INSERT INTO buyer_profiles (id,user_id,created_at) VALUES (?,?,?)')
               ->execute([$profileId, $user['id'], $now]);
            $db->prepare('INSERT INTO carts (id,buyer_id) VALUES (?,?)')
               ->execute([lue_uuid(), $profileId]);
        }
    }

    $db->prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?')
       ->execute([$role, $now, $user['id']]);

    // Create profile row if it doesn't exist for the new role
    if ($role === 'seller') {
        $check = $db->prepare('SELECT id FROM seller_profiles WHERE user_id = ?');
        $check->execute([$user['id']]);
        if (!$check->fetch()) {
            $db->prepare('INSERT INTO seller_profiles (id, user_id, store_name, created_at) VALUES (?, ?, ?, ?)')
               ->execute([lue_uuid(), $user['id'], '', $now]);
        }
    } else {
        $check = $db->prepare('SELECT id FROM buyer_profiles WHERE user_id = ?');
        $check->execute([$user['id']]);
        if (!$check->fetch()) {
            $db->prepare('INSERT INTO buyer_profiles (id, user_id, created_at) VALUES (?, ?, ?)')
               ->execute([lue_uuid(), $user['id'], $now]);
        }
    }

    $_SESSION['user']['role'] = $role;
    lue_ok(['message' => 'Account switched to ' . $role . '.', 'role' => $role]);
}

// ══════════════════════════════════════════════════════════════════
// DELETE ACCOUNT
// ══════════════════════════════════════════════════════════════════
function handle_delete()
{
    lue_method('POST');
    $user = lue_require_auth();
    $body = lue_json_body();

    // Require password confirmation before deleting
    $password = lue_get($body, 'password', '');
    if (empty($password)) lue_error('Password confirmation is required to delete your account.');

    $db   = lue_db();
    $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $row  = $stmt->fetch();

    if (!lue_verify_password($password, $row['password_hash'])) {
        lue_error('Incorrect password. Account not deleted.', 401);
    }

    // Soft delete — set status to deleted
    $db->prepare('UPDATE users SET status = \'deleted\', updated_at = ? WHERE id = ?')
       ->execute([lue_now(), $user['id']]);

    $_SESSION = [];
    session_destroy();

    lue_ok(['message' => 'Account deleted successfully.']);
}