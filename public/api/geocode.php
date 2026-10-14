<?php
/*
 * Γειτονιές της Αθήνας — proxy διευθύνσεων προς Nominatim (OpenStreetMap).
 * SPDX-License-Identifier: EUPL-1.2
 *
 * Τι κάνει:
 *  - δέχεται μία διεύθυνση (?q=...) μόνο όταν ο χρήστης πατήσει «Εύρεση» (όχι autocomplete),
 *  - απαντά από cache όταν η ίδια αναζήτηση έχει ξαναγίνει,
 *  - στέλνει το πολύ 1 αίτημα/δευτερόλεπτο στο Nominatim για όλο τον ιστότοπο,
 *  - περιορίζει κάθε επισκέπτη σε λίγα αιτήματα το λεπτό,
 *  - επιστρέφει μόνο συντεταγμένες και σύντομη ετικέτα.
 * Τι ΔΕΝ κάνει: δεν καταγράφει διευθύνσεις ή IP σε αρχεία καταγραφής.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) reply(503, ['error' => 'not_configured']);
$cfg = require $cfgFile;

if ($_SERVER['REQUEST_METHOD'] !== 'GET') reply(405, ['error' => 'method']);
if (empty($cfg['enabled'])) reply(503, ['error' => 'disabled']);
if (str_contains((string)$cfg['user_agent'], 'ΑΛΛΑΞΤΕ')) reply(503, ['error' => 'not_configured']);

/* ---------- είσοδος ---------- */
$q = (string)($_GET['q'] ?? '');
$q = preg_replace('/[\x00-\x1F\x7F]/u', ' ', $q) ?? '';
$q = trim(preg_replace('/\s+/u', ' ', $q) ?? '');
$q = mb_substr($q, 0, 120);
if (mb_strlen($q) < 3) reply(400, ['error' => 'too_short']);

$dir = rtrim((string)$cfg['cache_dir'], '/');
foreach ([$dir, "$dir/q", "$dir/rl"] as $d) {
    if (!is_dir($d) && !@mkdir($d, 0750, true)) reply(500, ['error' => 'storage']);
}

/* ---------- cache ---------- */
$key = hash('sha256', mb_strtolower($q));
$cacheFile = "$dir/q/$key.json";
if (is_file($cacheFile) && filemtime($cacheFile) > time() - (int)$cfg['cache_ttl']) {
    $hit = json_decode((string)file_get_contents($cacheFile), true);
    if (is_array($hit)) reply(200, ['results' => $hit, 'cached' => true, 'attribution' => '© OpenStreetMap contributors (ODbL)']);
}

/* ---------- όριο ανά επισκέπτη (μόνο αλατισμένο hash της IP, για 60 δευτερόλεπτα) ---------- */
$client = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $cfg['salt']);
$rlFile = "$dir/rl/" . substr($client, 0, 32);
$now = microtime(true);
$fh = fopen($rlFile, 'c+');
if ($fh && flock($fh, LOCK_EX)) {
    $stamps = array_filter(array_map('floatval', explode(',', (string)stream_get_contents($fh))), fn($t) => $t > $now - 60);
    if (count($stamps) >= (int)$cfg['per_client_per_minute']) {
        flock($fh, LOCK_UN); fclose($fh);
        reply(429, ['error' => 'rate_limited']);
    }
    $stamps[] = $now;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, implode(',', $stamps));
    flock($fh, LOCK_UN); fclose($fh);
}

/* ---------- όριο προς Nominatim: 1 αίτημα/δευτ. για όλο τον ιστότοπο ---------- */
$lock = fopen("$dir/.throttle", 'c+');
if (!$lock || !flock($lock, LOCK_EX)) reply(503, ['error' => 'busy']);
$last = (float)stream_get_contents($lock);
$wait = (float)$cfg['min_interval'] - (microtime(true) - $last);
if ($wait > 3) { flock($lock, LOCK_UN); reply(503, ['error' => 'busy']); }
if ($wait > 0) usleep((int)($wait * 1e6));

[$w, $n, $e, $s] = $cfg['viewbox'];
$url = $cfg['nominatim_url'] . '?' . http_build_query([
    'q' => $q . ', Αθήνα',
    'format' => 'jsonv2',
    'addressdetails' => 1,
    'limit' => 5,
    'countrycodes' => 'gr',
    'viewbox' => "$w,$n,$e,$s",
    'bounded' => 1,
    'accept-language' => 'el',
    'email' => $cfg['email'],
]);
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => (int)$cfg['timeout'],
    CURLOPT_USERAGENT => $cfg['user_agent'],
    CURLOPT_REFERER => $cfg['referer'],
    CURLOPT_HTTPHEADER => ['Accept: application/json'],
]);
$body = curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

ftruncate($lock, 0); rewind($lock); fwrite($lock, (string)microtime(true));
flock($lock, LOCK_UN); fclose($lock);

if ($status === 403 || $status === 429) reply(503, ['error' => 'upstream_blocked']);
if ($body === false || $status !== 200) reply(502, ['error' => 'upstream']);
$data = json_decode((string)$body, true);
if (!is_array($data)) reply(502, ['error' => 'upstream']);

/* ---------- σύντομη απάντηση ---------- */
$results = [];
foreach ($data as $r) {
    $a = $r['address'] ?? [];
    $street = trim(($a['road'] ?? $a['pedestrian'] ?? $a['footway'] ?? '') . ' ' . ($a['house_number'] ?? ''));
    $area = $a['neighbourhood'] ?? $a['suburb'] ?? $a['city_district'] ?? '';
    $label = trim($street . ($area !== '' ? ", $area" : ''), ' ,');
    if ($label === '') $label = implode(',', array_slice(explode(',', (string)($r['display_name'] ?? '')), 0, 3));
    $results[] = ['lat' => (float)$r['lat'], 'lon' => (float)$r['lon'], 'label' => $label, 'exact' => isset($a['house_number'])];
}
file_put_contents($cacheFile, json_encode($results, JSON_UNESCAPED_UNICODE), LOCK_EX);

/* καθαρισμός παλιών αρχείων περιστασιακά */
if (random_int(1, 100) === 1) {
    foreach (glob("$dir/q/*.json") ?: [] as $f) if (filemtime($f) < time() - (int)$cfg['cache_ttl']) @unlink($f);
    foreach (glob("$dir/rl/*") ?: [] as $f) if (filemtime($f) < time() - 120) @unlink($f);
}

reply(200, ['results' => $results, 'cached' => false, 'attribution' => '© OpenStreetMap contributors (ODbL)']);
