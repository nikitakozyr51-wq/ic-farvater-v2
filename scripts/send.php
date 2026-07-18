<?php
/**
 * IC Фарватер — единый обработчик форм (KP-drawer + contact-form).
 * Отправляет письма через SMTP (PHPMailer). Все секреты — в env vars Dokploy.
 *
 * Принимает multipart/form-data POST со следующими полями:
 *   kind        — "kp" | "contact"
 *   name        — required
 *   email       — required
 *   phone       — optional
 *   message     — contact form required
 *   comment     — kp form optional
 *   product     — kp form optional (название товара)
 *   category    — kp form optional (категория)
 *   consent     — "1" required (согласие на ОПД)
 *   files[]     — до 5 вложений суммарно 10 MB (kp form only)
 *   honeypot    — должно быть пустым (anti-bot)
 *
 * Возвращает JSON { ok: true } или { ok: false, error: "..." }
 *
 * Конфигурация — env vars (в Dokploy → Application frontend → Environment):
 *   SMTP_HOST       (default: smtp.beget.com)
 *   SMTP_PORT       (default: 465)
 *   SMTP_USER       (full email, e.g. noreply@ic-farvater.ru)
 *   SMTP_PASS       (пароль ящика)
 *   SMTP_FROM       (default: совпадает с SMTP_USER)
 *   SMTP_FROM_NAME  (default: "IC Фарватер")
 *   MAIL_TO         (default: info@ic-farvater.ru)
 *   MAIL_CC         (optional, e.g. sale@ic-farvater.ru)
 *   ALLOWED_ORIGIN  (default: https://ic-farvater.ru)
 */

require_once __DIR__ . '/../vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

/* ─── Конфиг из env vars с дефолтами ─── */
$SMTP_HOST       = getenv('SMTP_HOST')       ?: 'smtp.beget.com';
$SMTP_PORT       = (int)(getenv('SMTP_PORT') ?: 465);
$SMTP_USER       = getenv('SMTP_USER')       ?: 'noreply@ic-farvater.ru';
$SMTP_PASS       = getenv('SMTP_PASS')       ?: '';
$SMTP_FROM       = getenv('SMTP_FROM')       ?: $SMTP_USER;
$SMTP_FROM_NAME  = getenv('SMTP_FROM_NAME')  ?: 'IC Фарватер';
$MAIL_TO         = getenv('MAIL_TO')         ?: 'info@ic-farvater.ru';
$MAIL_CC         = getenv('MAIL_CC')         ?: '';
$ALLOWED_ORIGIN  = getenv('ALLOWED_ORIGIN')  ?: 'https://ic-farvater.ru';

define('FILE_MAX_COUNT', 5);
define('FILE_MAX_TOTAL', 10 * 1024 * 1024);
$ALLOWED_EXT = ['pdf','doc','docx','xls','xlsx','csv','txt','png','jpg','jpeg','webp','zip','rar','7z'];

header('Content-Type: application/json; charset=utf-8');

/* ─── CORS ─── */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin === $ALLOWED_ORIGIN) {
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

/* ─── CSRF guard ─── */
$referer   = $_SERVER['HTTP_REFERER'] ?? '';
$okOrigin  = ($origin === $ALLOWED_ORIGIN);
$okReferer = (strpos($referer, $ALLOWED_ORIGIN . '/') === 0);
if (!$okOrigin && !$okReferer) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

/* ─── Honeypot ─── */
if (!empty($_POST['honeypot'] ?? '')) {
    echo json_encode(['ok' => true]); // молча
    exit;
}

/* ─── Сбор данных ─── */
$kind     = trim($_POST['kind']     ?? 'contact');
$name     = trim($_POST['name']     ?? '');
$email    = trim($_POST['email']    ?? '');
$phone    = trim($_POST['phone']    ?? '');
$message  = trim($_POST['message']  ?? '');
$comment  = trim($_POST['comment']  ?? '');
$product  = trim($_POST['product']  ?? '');
$category = trim($_POST['category'] ?? '');
$consent  = $_POST['consent']       ?? '';

/* ─── Валидация ─── */
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
if ($kind === 'contact' && !$message) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Заполните сообщение']);
    exit;
}

/* ─── Аттачи (только для KP формы) ─── */
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
    foreach ($real as $i) {
        if ($files['error'][$i] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Ошибка загрузки: ' . $files['name'][$i]]);
            exit;
        }
        $tmp = $files['tmp_name'][$i];
        $nm  = $files['name'][$i];
        if (!is_uploaded_file($tmp)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Некорректный файл']);
            exit;
        }
        $ext = strtolower(pathinfo($nm, PATHINFO_EXTENSION));
        if (!in_array($ext, $ALLOWED_EXT, true)) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => "Тип «.$ext» не поддерживается"]);
            exit;
        }
        $totalSize += $files['size'][$i];
        if ($totalSize > FILE_MAX_TOTAL) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Превышен общий размер 10 MB']);
            exit;
        }
        $attachments[] = ['path' => $tmp, 'name' => $nm];
    }
}

/* ─── Сборка тела письма ─── */
$bodyText  = ($kind === 'kp' ? $comment : $message);
$bodyLabel = ($kind === 'kp' ? 'Комментарий' : 'Сообщение');
$subject   = ($kind === 'kp' ? 'Новый запрос КП с сайта IC Фарватер'
                              : 'Новая заявка с сайта IC Фарватер');

$lines = [
    "Новая заявка с сайта ic-farvater.ru ({$kind})",
    str_repeat('-', 40),
];
if ($category) $lines[] = "Раздел:   $category";
if ($product)  $lines[] = "Товар:    $product";
$lines[] = "Имя:      $name";
$lines[] = "Email:    $email";
$lines[] = "Телефон:  " . ($phone ?: 'не указан');
$lines[] = 'Вложений: ' . (count($attachments) ?: 'нет');
$lines[] = '';
$lines[] = "$bodyLabel:";
$lines[] = $bodyText ?: '(пусто)';
$lines[] = '';
$lines[] = str_repeat('-', 40);
$lines[] = 'Дата: ' . date('d.m.Y H:i:s') . ' (МСК)';
$lines[] = 'IP:   ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
/* Фиксация согласия в письме = журнал доказательств по ст. 9 ч. 3 152-ФЗ
 * (письма хранятся в ящике info@ — это и есть «технические логи» из consent.html §9). */
$lines[] = 'Согласие на обработку ПДн: подтверждено (чекбокс отмечен пользователем)';
$lines[] = 'Текст согласия: https://ic-farvater.ru/pages/consent.html';
$bodyPlain = implode("\n", $lines);

/* ─── Отправка через SMTP ─── */
$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host       = $SMTP_HOST;
    $mail->Port       = $SMTP_PORT;
    $mail->SMTPAuth   = true;
    $mail->Username   = $SMTP_USER;
    $mail->Password   = $SMTP_PASS;
    $mail->SMTPSecure = ($SMTP_PORT === 465)
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;
    $mail->CharSet    = 'UTF-8';
    $mail->Encoding   = 'base64';

    $mail->setFrom($SMTP_FROM, $SMTP_FROM_NAME);
    $mail->addAddress($MAIL_TO);
    if ($MAIL_CC) $mail->addCC($MAIL_CC);
    $mail->addReplyTo($email, $name);

    $mail->Subject = $subject;
    $mail->Body    = $bodyPlain;

    foreach ($attachments as $att) {
        $mail->addAttachment($att['path'], $att['name']);
    }

    $mail->send();
    echo json_encode(['ok' => true]);
} catch (Exception $e) {
    error_log('SMTP error: ' . $mail->ErrorInfo);
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Ошибка отправки. Напишите нам напрямую: ' . $MAIL_TO,
    ]);
}
