<?php
/**
 * includes/helpers.php — LinkUp Express
 * ─────────────────────────────────────────────────────────────────
 * Shared helper functions used across all PHP API files.
 *
 *   • JSON response helpers
 *   • Input sanitisation
 *   • Session management
 *   • Password hashing
 *   • Validation
 *   • Unique ID generation
 * ─────────────────────────────────────────────────────────────────
 */


// ─── SESSION — persistent across page visits ────────────────────────
if (session_status() === PHP_SESSION_NONE) {
    // Keep session alive for 30 days
    $lifetime = 60 * 60 * 24 * 30;
    session_set_cookie_params([
        'lifetime' => $lifetime,
        'path'     => '/',
        'domain'   => '',
        'secure'   => false,
        'httponly'  => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.gc_maxlifetime', $lifetime);
    ini_set('session.cookie_lifetime', $lifetime);
    session_start();
}

// ─── JSON RESPONSES ─────────────────────────────────────────────────

/**
 * Send a JSON success response and exit.
 * @param $data
 * @param $code HTTP status code
 */
function lue_ok($data = null, $code = 200)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send a JSON error response and exit.
 * @param $message
 * @param $code HTTP status code
 */
function lue_error($message, $code = 400)
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Enforce that the request method matches. Sends 405 otherwise.
 * @param $method e.g. 'GET', 'POST', 'DELETE'
 */
function lue_method($method)
{
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        lue_error('Method not allowed. Expected: ' . $method, 405);
    }
}

/**
 * Enforce that a session user is logged in.
 * Sends 401 if not authenticated.
 */
function lue_require_auth()
{
    // 1. Check PHP session first
    if (!empty($_SESSION['user'])) {
        return $_SESSION['user'];
    }

    // 2. Fallback: accept user_id from GET, POST, or JSON body
    $userId = '';
    if (!empty($_GET['user_id']))  $userId = $_GET['user_id'];
    if (!$userId && !empty($_POST['user_id'])) $userId = $_POST['user_id'];
    if (!$userId) {
        $raw  = file_get_contents('php://input');
        $body = $raw ? (json_decode($raw, true) ?? []) : [];
        if (!empty($body['user_id'])) $userId = $body['user_id'];
    }

    if ($userId) {
        $db   = lue_db();
        $stmt = $db->prepare("SELECT id, full_name, email, phone, role FROM users WHERE id = ? AND status = 'active'");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if ($user) {
            // Get profile id
            $tbl   = $user['role'] === 'seller' ? 'seller_profiles' : 'buyer_profiles';
            $pStmt = $db->prepare("SELECT id FROM {$tbl} WHERE user_id = ?");
            $pStmt->execute([$user['id']]);
            $prof  = $pStmt->fetch();

            // Hydrate a session-like array
            $sessionUser = [
                'id'        => $user['id'],
                'profileId' => $prof ? $prof['id'] : null,
                'fullName'  => $user['full_name'],
                'email'     => $user['email'],
                'phone'     => $user['phone'],
                'role'      => $user['role'],
            ];

            // Also set the session so subsequent calls in this request work
            $_SESSION['user'] = $sessionUser;
            return $sessionUser;
        }
    }

    lue_error('Not authenticated. Please log in.', 401);
}

/**
 * Enforce that the logged-in user has a specific role.
 * @param $role 'buyer' | 'seller' | 'admin'
 */
function lue_require_role($role)
{
    $user = lue_require_auth();
    if (($user['role'] ?? '') !== $role) {
        lue_error('Access denied. Required role: ' . $role, 403);
    }
    return $user;
}

// ─── INPUT ──────────────────────────────────────────────────────────

/**
 * Get and decode the raw JSON request body.
 * @return array
 */
function lue_json_body()
{
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Sanitise a string — trim whitespace and strip HTML tags.
 * @param $value
 * @return string
 */
function lue_clean($value)
{
    return htmlspecialchars(strip_tags(trim($value)), ENT_QUOTES, 'UTF-8');
}

/**
 * Get a value from an array, with an optional default.
 * @param $arr
 * @param $key
 * @param $default
 * @return mixed
 */
function lue_get($arr, $key, $default = null)
{
    return $arr[$key] ?? $default;
}

// ─── VALIDATION ─────────────────────────────────────────────────────

/**
 * Check if a string is a valid email address.
 */
function lue_valid_email($email)
{
    return filter_var(trim($email), FILTER_VALIDATE_EMAIL) !== false;
}

/**
 * Check if a string is a plausible South African phone number.
 * Accepts: 071 234 5678 / +27711234567 / 0711234567
 */
function lue_valid_phone($phone)
{
    $cleaned = preg_replace('/[\s\-()]/', '', $phone);
    return (bool) preg_match('/^(\+27|0)[6-8][0-9]{8}$/', $cleaned);
}

/**
 * Check minimum password length.
 */
function lue_valid_password($pwd, $min = 8)
{
    return strlen($pwd) >= $min;
}

// ─── PASSWORD ────────────────────────────────────────────────────────

/**
 * Hash a password using bcrypt (PHP's password_hash).
 * @param $password
 * @return string
 */
function lue_hash_password($password)
{
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

/**
 * Verify a password against a stored bcrypt hash.
 * Also accepts the simple client-side hash used by auth.js (lue_XXXXXXXX)
 * during the transition to server-side auth.
 *
 * @param $password  plain-text password
 * @param $hash      stored hash
 * @return bool
 */
function lue_verify_password($password, $hash)
{
    // Standard bcrypt
    if (password_verify($password, $hash)) {
        return true;
    }
    // Legacy client-side hash from auth.js (lue_XXXXXXXX)
    if (str_starts_with($hash, 'lue_')) {
        $jsHash = 'lue_' . dechex(abs(lue_js_hash($password)));
        return hash_equals($hash, $jsHash);
    }
    return false;
}

/**
 * Replicate the simple hash from auth.js for backward compatibility.
 * @internal
 */
function lue_js_hash($str)
{
    $hash = 0;
    for ($i = 0; $i < strlen($str); $i++) {
        $hash = (($hash << 5) - $hash) + ord($str[$i]);
        $hash &= 0x7FFFFFFF;
    }
    return $hash;
}

// ─── ID GENERATION ───────────────────────────────────────────────────

/**
 * Generate a UUID v4-style identifier.
 * @return string e.g. "usr-68b3-4f2a1c"
 */
function lue_uuid()
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

/**
 * Generate a human-readable order reference.
 * @return string e.g. "LUE-2026-847291"
 */
function lue_order_ref()
{
    return 'LUE-' . date('Y') . '-' . str_pad((string)mt_rand(0, 999999), 6, '0', STR_PAD_LEFT);
}

/**
 * Return the current UTC timestamp in ISO 8601 format.
 */
function lue_now()
{
    return gmdate('Y-m-d\TH:i:s\Z');
}
