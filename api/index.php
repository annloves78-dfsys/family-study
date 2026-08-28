<?php
// =========================================================
// 도장판 API (가비아 웹호스팅 / PHP + MySQL)
//   POST {웹루트}/api/?action=<액션>   Body: JSON
// =========================================================
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

if (!file_exists(__DIR__ . '/config.php')) {
    http_response_code(500);
    echo json_encode(['error' => 'config.php 가 없습니다. config.sample.php 를 복사해서 만들어 주세요.'], JSON_UNESCAPED_UNICODE);
    exit;
}
require __DIR__ . '/config.php';

// ---------- 공통 ----------
function out(array $data): void {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $code, string $msg): void {
    http_response_code($code);
    out(['error' => $msg]);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            fail(500, 'DB 연결 실패 (config.php 의 접속 정보를 확인해 주세요)');
        }
    }
    return $pdo;
}

function body(): array {
    static $body = null;
    if ($body === null) {
        $raw  = file_get_contents('php://input');
        $body = $raw ? json_decode($raw, true) : [];
        if (!is_array($body)) $body = [];
    }
    return $body;
}

function param(string $key, $default = null) {
    $b = body();
    return array_key_exists($key, $b) ? $b[$key] : $default;
}

function isDate($v): bool {
    return is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) === 1;
}

// JSON 숫자를 안전하게 정수로 (3, 3.0, "3" 모두 허용)
function asInt($v): ?int {
    if (is_int($v)) return $v;
    if (is_float($v) && floor($v) === $v) return (int)$v;
    if (is_string($v) && preg_match('/^-?\d+$/', $v) === 1) return (int)$v;
    return null;
}

// ---------- 세션 ----------
function currentUser(): ?array {
    $token = param('token');
    if (!is_string($token) || strlen($token) !== 64) return null;

    $st = db()->prepare(
        'SELECT p.id, p.role FROM sessions s
         JOIN profiles p ON p.id = s.user_id
         WHERE s.token = ? AND s.expires_at > NOW()'
    );
    $st->execute([$token]);
    $row = $st->fetch();
    return $row ?: null;
}

function requireUser(): array {
    $u = currentUser();
    if (!$u) fail(401, '로그인이 필요합니다.');
    return $u;
}

function requireAdmin(): array {
    $u = requireUser();
    if ($u['role'] !== 'admin') fail(403, '관리자만 할 수 있습니다.');
    return $u;
}

// 대상 아이를 수정할 권한이 있는지 (관리자 또는 본인)
function requireCanEdit(string $targetId): array {
    $u = requireUser();
    if ($u['role'] !== 'admin' && $u['id'] !== $targetId) {
        fail(403, '다른 사람의 도장은 바꿀 수 없습니다.');
    }
    return $u;
}

function createSession(string $userId): string {
    $token = bin2hex(random_bytes(32));
    // 만료된 세션 정리
    db()->prepare('DELETE FROM sessions WHERE expires_at < NOW()')->execute();
    $days = (int)SESSION_DAYS;
    $st = db()->prepare(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL $days DAY))"
    );
    $st->execute([$token, $userId]);
    return $token;
}

// ---------- 통계 ----------
function buildStats(): array {
    $pdo = db();

    $kids = $pdo->query("SELECT id FROM profiles WHERE role = 'child'")->fetchAll(PDO::FETCH_COLUMN);

    $stats = [];
    foreach ($kids as $id) {
        $stats[$id] = [
            'unsettledMoney' => 0,
            'usableCoupons'  => 0,
            'waitCoupons'    => 0,
            'settledUntil'   => null,
            'lastStampDate'  => null,
            'history'        => [],
        ];
    }

    // 도장 집계 (목표 시간 안쪽 = 돈, 목표 시간 바깥 = 쿠폰)
    $agg = $pdo->query(
        'SELECT s.user_id,
                SUM(CASE WHEN s.stamp_index <  COALESCE(t.target_count, 0) THEN 1 ELSE 0 END) AS money_stamps,
                SUM(CASE WHEN s.stamp_index <  COALESCE(t.target_count, 0) AND s.is_coupon_used = 1 THEN 1 ELSE 0 END) AS used_coupons,
                SUM(CASE WHEN s.stamp_index >= COALESCE(t.target_count, 0) THEN 1 ELSE 0 END) AS earned_coupons,
                MAX(s.date_str) AS last_stamp_date
         FROM study_stamps s
         LEFT JOIN daily_targets t
                ON t.user_id = s.user_id AND t.date_str = s.date_str
         GROUP BY s.user_id'
    )->fetchAll();

    $earned = [];
    $used   = [];
    foreach ($agg as $r) {
        $id = $r['user_id'];
        if (!isset($stats[$id])) continue;
        $stats[$id]['unsettledMoney'] = ((int)$r['money_stamps']) * RATE;
        $stats[$id]['lastStampDate']  = $r['last_stamp_date'];
        $earned[$id] = (int)$r['earned_coupons'];
        $used[$id]   = (int)$r['used_coupons'];
    }

    // 지급 내역
    $payouts = $pdo->query(
        "SELECT id, user_id, amount, coupon_amount, settled_until, created_at
         FROM custom_events
         WHERE event_type = 'payout'
         ORDER BY created_at DESC, id DESC"
    )->fetchAll();

    $paidMoney   = [];
    $paidCoupons = [];
    foreach ($payouts as $p) {
        $id = $p['user_id'];
        if (!isset($stats[$id])) continue;
        // 지급액은 음수로 저장돼 있음
        $paidMoney[$id]   = ($paidMoney[$id]   ?? 0) - (int)$p['amount'];
        $paidCoupons[$id] = ($paidCoupons[$id] ?? 0) + (int)$p['coupon_amount'];

        if ($p['settled_until'] !== null) {
            $cur = $stats[$id]['settledUntil'];
            if ($cur === null || $p['settled_until'] > $cur) {
                $stats[$id]['settledUntil'] = $p['settled_until'];
            }
        }
        if (count($stats[$id]['history']) < 30) {
            $stats[$id]['history'][] = [
                'id'            => (int)$p['id'],
                'amount'        => (int)$p['amount'],
                'coupon_amount' => (int)$p['coupon_amount'],
                'settled_until' => $p['settled_until'],
                'created_at'    => $p['created_at'],
            ];
        }
    }

    foreach ($stats as $id => &$s) {
        $s['unsettledMoney'] -= ($paidMoney[$id] ?? 0);
        $s['usableCoupons']   = ($paidCoupons[$id] ?? 0) - ($used[$id] ?? 0);
        $s['waitCoupons']     = ($earned[$id] ?? 0) - ($paidCoupons[$id] ?? 0);
    }
    unset($s);

    return $stats;
}

// ---------- 라우팅 ----------
$action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : '';

try {
    switch ($action) {

        // ---- 로그인 ----
        case 'login': {
            $userId = param('userId');
            $pw     = param('password');
            if (!is_string($userId) || !is_string($pw)) fail(400, '입력값이 올바르지 않습니다.');

            $st = db()->prepare('SELECT id, name, role, password, is_password_set FROM profiles WHERE id = ?');
            $st->execute([$userId]);
            $row = $st->fetch();
            if (!$row) fail(404, '사용자를 찾을 수 없습니다.');
            if (!hash_equals((string)$row['password'], $pw)) fail(401, '비밀번호가 틀렸습니다.');

            out([
                'token'  => createSession($row['id']),
                'userId' => $row['id'],
                'name'   => $row['name'],
                'role'   => $row['role'],
            ]);
        }

        // ---- 저장된 토큰이 아직 유효한지 확인 (자동 로그인) ----
        case 'me': {
            $u = currentUser();
            if (!$u) out(['userId' => null]);
            out(['userId' => $u['id'], 'role' => $u['role']]);
        }

        case 'logout': {
            $token = param('token');
            if (is_string($token) && $token !== '') {
                db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
            }
            out(['ok' => true]);
        }

        // ---- 비밀번호 변경 ----
        case 'change_password': {
            $userId  = param('userId');
            $current = param('currentPassword');
            $next    = param('newPassword');
            if (!is_string($userId) || !is_string($current) || !is_string($next)) fail(400, '입력값이 올바르지 않습니다.');
            if ($next === '') fail(400, '새 비밀번호를 입력해 주세요.');
            if (strlen($next) > 60) fail(400, '비밀번호가 너무 깁니다.');

            $st = db()->prepare('SELECT id, password FROM profiles WHERE id = ?');
            $st->execute([$userId]);
            $row = $st->fetch();
            if (!$row) fail(404, '사용자를 찾을 수 없습니다.');
            if (!hash_equals((string)$row['password'], $current)) fail(401, '현재 비밀번호가 틀렸습니다.');

            db()->prepare('UPDATE profiles SET password = ?, is_password_set = 1 WHERE id = ?')
                ->execute([$next, $userId]);
            // 다른 기기의 기존 세션은 만료시킴
            db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);

            out(['token' => createSession($userId), 'userId' => $userId]);
        }

        // ---- 주간 보드 + 전체 통계 ----
        case 'board': {
            requireUser();
            $week = param('week');
            if (!is_array($week) || count($week) === 0 || count($week) > 31) fail(400, '주간 날짜가 올바르지 않습니다.');
            foreach ($week as $d) {
                if (!isDate($d)) fail(400, '날짜 형식이 올바르지 않습니다.');
            }

            $ph = implode(',', array_fill(0, count($week), '?'));

            $st = db()->prepare(
                "SELECT user_id, date_str, stamp_index, is_coupon_used
                 FROM study_stamps WHERE date_str IN ($ph)"
            );
            $st->execute(array_values($week));
            $weekStamps = $st->fetchAll();

            $st = db()->prepare(
                "SELECT user_id, date_str, target_count
                 FROM daily_targets WHERE date_str IN ($ph)"
            );
            $st->execute(array_values($week));
            $weekTargets = $st->fetchAll();

            out([
                'weekStamps'  => array_map(static function ($r) {
                    return [
                        'user_id'        => $r['user_id'],
                        'date_str'       => $r['date_str'],
                        'stamp_index'    => (int)$r['stamp_index'],
                        'is_coupon_used' => (bool)$r['is_coupon_used'],
                    ];
                }, $weekStamps),
                'weekTargets' => array_map(static function ($r) {
                    return [
                        'user_id'      => $r['user_id'],
                        'date_str'     => $r['date_str'],
                        'target_count' => (int)$r['target_count'],
                    ];
                }, $weekTargets),
                'stats'       => buildStats(),
            ]);
        }

        // ---- 도장 찍기 ----
        case 'stamp_add': {
            $targetId   = (string)param('userId', '');
            $dateStr    = param('dateStr');
            $stampIndex = asInt(param('stampIndex'));
            $isCoupon   = (bool)param('isCouponUsed', false);
            if (!isDate($dateStr) || $stampIndex === null || $stampIndex < 0 || $stampIndex > 100) {
                fail(400, '입력값이 올바르지 않습니다.');
            }
            requireCanEdit($targetId);

            $st = db()->prepare(
                'INSERT IGNORE INTO study_stamps (user_id, date_str, stamp_index, is_coupon_used)
                 VALUES (?, ?, ?, ?)'
            );
            $st->execute([$targetId, $dateStr, $stampIndex, $isCoupon ? 1 : 0]);
            out(['ok' => true]);
        }

        // ---- 도장 지우기 ----
        case 'stamp_remove': {
            $targetId   = (string)param('userId', '');
            $dateStr    = param('dateStr');
            $stampIndex = asInt(param('stampIndex'));
            if (!isDate($dateStr) || $stampIndex === null) fail(400, '입력값이 올바르지 않습니다.');
            requireCanEdit($targetId);

            $st = db()->prepare(
                'DELETE FROM study_stamps WHERE user_id = ? AND date_str = ? AND stamp_index = ?'
            );
            $st->execute([$targetId, $dateStr, $stampIndex]);
            out(['ok' => true]);
        }

        // ---- 목표 시간 설정 (관리자) ----
        case 'target_set': {
            requireAdmin();
            $targetId = (string)param('userId', '');
            $dateStr  = param('dateStr');
            $count    = asInt(param('count'));
            if (!isDate($dateStr) || $count === null || $count < 0 || $count > 100) fail(400, '입력값이 올바르지 않습니다.');

            $st = db()->prepare(
                'INSERT INTO daily_targets (user_id, date_str, target_count) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE target_count = VALUES(target_count)'
            );
            $st->execute([$targetId, $dateStr, $count]);
            out(['ok' => true]);
        }

        // ---- 용돈 지급 (관리자) ----
        case 'payout_add': {
            requireAdmin();
            $targetId     = (string)param('userId', '');
            $amount       = asInt(param('amount'));
            $couponAmount = asInt(param('couponAmount', 0));
            $settledUntil = param('settledUntil');
            if ($amount === null || $couponAmount === null) fail(400, '금액이 올바르지 않습니다.');
            if ($settledUntil !== null && !isDate($settledUntil)) fail(400, '정산 기준일이 올바르지 않습니다.');

            $st = db()->prepare(
                "INSERT INTO custom_events (user_id, event_type, amount, coupon_amount, settled_until)
                 VALUES (?, 'payout', ?, ?, ?)"
            );
            $st->execute([$targetId, $amount, $couponAmount, $settledUntil]);
            out(['ok' => true]);
        }

        default:
            fail(404, '알 수 없는 요청입니다: ' . $action);
    }
} catch (PDOException $e) {
    error_log('[stamp-api] ' . $e->getMessage());
    fail(500, '데이터베이스 오류가 발생했습니다.');
} catch (Throwable $e) {
    error_log('[stamp-api] ' . $e->getMessage());
    fail(500, '서버 오류가 발생했습니다.');
}
