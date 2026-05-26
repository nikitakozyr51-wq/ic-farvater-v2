<?php
/**
 * IC Фарватер — единый обработчик форм (KP-drawer + contact-form).
 * Разместить на Beget по пути /scripts/send.php
 *
 * Принимает multipart/form-data POST со следующими полями:
 *   kind        — "kp" | "contact" (определяет шаблон письма + тему)
 *   name        — имя (required)
 *   email       — email (required, валидируется)
 *   phone       — телефон (optional)
 *   message     — текст обращения (contact form, required)
 *   comment     — комментарий к запросу (kp form, optional)
 *   product     — название товара/раздела (kp form, optional)
 *   category    — категория (kp form, optional)
 *   consent     — checkbox "1"
 *   files[]     — до 5 вложений суммарно 10 MB (kp form only)
 *   honeypot    — должно быть пустым (anti-bot)
 *
 * Возвращает JSON { ok: true } или { ok: false, error: "..." }
 */

define('TO_EMAIL',       'info@ic-farvater.ru');
define('CC_EMAIL',       'sale@ic-farvater.ru');   // дублируем коммерческому отделу
define('FROM_EMAIL',     'noreply@ic-farvater.ru'); // должен совпадать с почтой Beget
define('ALLOWED_ORIGIN', 'https://ic-farvater.ru');
define('FILE_MAX_COUNT',  5);
define('FILE_MAX_TOTAL',  10 * 1024 * 1024);

$ALLOWED_EXT = ['pdf','doc','docx','xls','xlsx','csv','txt','png','jpg','jpeg','webp','zip','rar','7z'];

header('Content-Type: application/json; charset=utf-8');

// CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === ALLOWED_ORIGIN) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// CSRF: пропускаем только запросы со своего домена
$referer   = $_SERVER['HTTP_REFERER'] ?? '';
$okOrigin  = ($origin === ALLOWED_ORIGIN);
$okReferer = (strpos($referer, ALLOWED_ORIGIN . '/') === 0);
if (!$okOrigin && !$okReferer) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

// Honeypot — должно быть пустым
if (!empty($_POST['honeypot'] ?? '')) {
    // Бот: молча возвращаем ok, ничего не отправляем
    echo json_encode(['ok' => true]);
    exit;
}

// Сбор данных
$kind     = trim($_POST['kind']     ?? 'contact');
$name     = trim($_POST['name']     ?? '');
$email    = trim($_POST['email']    ?? '');
$phone    = trim($_POST['phone']    ?? '');
$message  = trim($_POST['message']  ?? '');
$comment  = trim($_POST['comment']  ?? '');
$product  = trim($_POST['product']  ?? '');
$category = trim($_POST['category'] ?? '');
$consent  = $_POST['consent']       ?? '';

// Валидация
if (!$name || !$email) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Заполните обязательные поля']);
    exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Некорректный email']);
    exit;
}
if (!$consent) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Необходимо согласие на обработку данных']);
    exit;
}
// Минимум контента
if ($kind === 'contact' && !$message) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Заполните сообщение']);
    exit;
}

// Вложения (только для KP формы)
$attachments = [];
if ($kind === 'kp' && !empty($_FILES['files']) && is_array($_FILES['files']['name'])) {
    $files = $_FILES['files'];
    $count = count($files['name']);
    $real  = [];
    for ($i = 0; $i < $count; $i++) {
        if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
        $real[] = $i;
    }
    if (count($real) > FILE_MAX_COUNT) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Максимум ' . FILE_MAX_COUNT . ' файлов']);
        exit;
    }
    $totalSize = 0;
    $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : false;
    foreach ($real as $i) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Ошибка загрузки: ' . $files['name'][$i]]);
            if ($finfo) finfo_close($finfo);
            exit;
        }
        $tmp = $files['tmp_name'][$i];
        $nm  = $files['name'][$i];
        if (!is_uploaded_file($tmp)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Некорректный файл']);
            if ($finfo) finfo_close($finfo);
            exit;
        }
        $ext = strtolower(pathinfo($nm, PATHINFO_EXTENSION));
        if (!in_array($ext, $ALLOWED_EXT, true)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => "Тип «.$ext» не поддерживается"]);
            if ($finfo) finfo_close($finfo);
            exit;
        }
        $totalSize += $files['size'][$i];
        if ($totalSize > FILE_MAX_TOTAL) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Превышен общий размер 10 MB']);
            if ($finfo) finfo_close($finfo);
            exit;
        }
        $mime = $finfo ? finfo_file($finfo, $tmp) : 'application/octet-stream';
        $attachments[] = [
            'name' => $nm,
            'mime' => $mime ?: 'application/octet-stream',
            'data' => file_get_contents($tmp),
        ];
    }
    if ($finfo) finfo_close($finfo);
}

// Санитизация
$name_s     = htmlspecialchars($name,     ENT_QUOTES, 'UTF-8');
$email_s    = htmlspecialchars($email,    ENT_QUOTES, 'UTF-8');
$phone_s    = htmlspecialchars($phone,    ENT_QUOTES, 'UTF-8');
$message_s  = htmlspecialchars($message,  ENT_QUOTES, 'UTF-8');
$comment_s  = htmlspecialchars($comment,  ENT_QUOTES, 'UTF-8');
$product_s  = htmlspecialchars($product,  ENT_QUOTES, 'UTF-8');
$category_s = htmlspecialchars($category, ENT_QUOTES, 'UTF-8');

// Текст письма
$bodyText   = ($kind === 'kp' ? $comment_s : $message_s);
$bodyLabel  = ($kind === 'kp' ? 'Комментарий' : 'Сообщение');
$subjectRu  = ($kind === 'kp' ? 'Новый запрос КП с сайта IC Фарватер' : 'Новая заявка с сайта IC Фарватер');

$attachLine = $attachments
    ? 'Вложений:  ' . count($attachments)
    : 'Вложений:  нет';

$lines = [
    "Новая заявка с сайта ic-farvater.ru ({$kind})",
    str_repeat('-', 40),
];
if ($product_s)  $lines[] = "Раздел:   $category_s";
if ($product_s)  $lines[] = "Товар:    $product_s";
$lines[] = "Имя:      $name_s";
$lines[] = "Email:    $email_s";
$lines[] = "Телефон:  " . ($phone_s ?: 'не указан');
$lines[] = $attachLine;
$lines[] = '';
$lines[] = "$bodyLabel:";
$lines[] = $bodyText ?: '(пусто)';
$lines[] = '';
$lines[] = str_repeat('-', 40);
$lines[] = "Дата: " . date('d.m.Y H:i') . " (МСК)";
$lines[] = "IP:   " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$body = implode("\n", $lines);

$subjectEnc = '=?UTF-8?B?' . base64_encode($subjectRu) . '?=';

$sent = false;
$toFinal = TO_EMAIL . (CC_EMAIL ? ', ' . CC_EMAIL : '');

if (empty($attachments)) {
    $headers = implode("\r\n", [
        "From: IC Фарватер <" . FROM_EMAIL . ">",
        "Reply-To: $email",
        "Content-Type: text/plain; charset=UTF-8",
        "MIME-Version: 1.0",
        "X-Mailer: PHP/" . phpversion(),
    ]);
    $sent = mail($toFinal, $subjectEnc, $body, $headers);
} else {
    // MIME multipart с вложениями
    $boundary = '=_b_' . md5(uniqid('', true));
    $eol = "\r\n";
    $headers = implode($eol, [
        "From: IC Фарватер <" . FROM_EMAIL . ">",
        "Reply-To: $email",
        "MIME-Version: 1.0",
        "Content-Type: multipart/mixed; boundary=\"$boundary\"",
        "X-Mailer: PHP/" . phpversion(),
    ]);
    $msg  = "--$boundary$eol";
    $msg .= "Content-Type: text/plain; charset=UTF-8$eol";
    $msg .= "Content-Transfer-Encoding: 8bit$eol$eol";
    $msg .= $body . $eol;
    foreach ($attachments as $att) {
        $fnameEnc = '=?UTF-8?B?' . base64_encode($att['name']) . '?=';
        $msg .= "--$boundary$eol";
        $msg .= "Content-Type: " . $att['mime'] . "; name=\"$fnameEnc\"$eol";
        $msg .= "Content-Disposition: attachment; filename=\"$fnameEnc\"$eol";
        $msg .= "Content-Transfer-Encoding: base64$eol$eol";
        $msg .= chunk_split(base64_encode($att['data'])) . $eol;
    }
    $msg .= "--$boundary--$eol";
    $sent = mail($toFinal, $subjectEnc, $msg, $headers);
}

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Ошибка отправки. Напишите нам напрямую: ' . TO_EMAIL,
    ]);
}
