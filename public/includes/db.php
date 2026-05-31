<?php
/**
 * includes/db.php — LinkUp Express
 * MySQL database connection using PDO.
 */

define('LUE_DB_HOST', 'localhost');
define('LUE_DB_NAME', 'linkupexpress');
define('LUE_DB_USER', 'root');
define('LUE_DB_PASS', '');
define('LUE_DB_PORT', 3306);

function lue_db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    try {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            LUE_DB_HOST, LUE_DB_PORT, LUE_DB_NAME
        );
        $pdo = new PDO($dsn, LUE_DB_USER, LUE_DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        die(json_encode(['ok' => false, 'error' => 'Database connection failed: ' . $e->getMessage()]));
    }

    return $pdo;
}