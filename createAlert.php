<?php
// Define o cabeçalho da resposta como JSON e permite o acesso (CORS)
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");

// Habilita a exibição de erros para depuração
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Verifica se as dependências existem ANTES de tentar incluí-las
if (!file_exists(__DIR__ . '/FireBaseNotifications.class.php')) {
    http_response_code(500 );
    echo json_encode(['success' => false, 'error' => 'Erro de servidor: FireBaseNotifications.class.php não encontrado.']);
    exit;
}
if (!file_exists(__DIR__ . '/vendor/autoload.php')) {
    http_response_code(500 );
    echo json_encode(['success' => false, 'error' => 'Erro de servidor: Pasta "vendor" não encontrada. Execute "composer install".']);
    exit;
}

require_once __DIR__ . '/FireBaseNotifications.class.php';
require __DIR__ . '/vendor/autoload.php';

use Google\Cloud\Firestore\FirestoreClient;

try {
    // --- CONFIGURAÇÕES ---
    $firebaseServerKey = 'SUA_CHAVE_DE_SERVIDOR_FCM_AQUI';
    $firebaseCredentialsPath = __DIR__ . '/firebase_credentials.json';

    if ($firebaseServerKey === 'SUA_CHAVE_DE_SERVIDOR_FCM_AQUI') {
        throw new Exception("Configuração incompleta: Chave do servidor FCM não definida.");
    }
    if (!file_exists($firebaseCredentialsPath)) {
        throw new Exception("Configuração incompleta: Arquivo 'firebase_credentials.json' não encontrado.");
    }

    // --- DADOS ---
    $donoId = $_POST['donoId'] ?? '';
    $titulo = $_POST['titulo'] ?? 'Novo Agendamento';
    $mensagem = $_POST['mensagem'] ?? 'Você recebeu um novo agendamento.';

    if (empty($donoId)) {
        throw new Exception("Parâmetro obrigatório ausente: donoId.");
    }

    // --- LÓGICA ---
    $firestore = new FirestoreClient(['keyFilePath' => $firebaseCredentialsPath, 'projectId' => 'pronti-app-37c6e']);
    $tokenDoc = $firestore->collection('mensagensTokens')->document($donoId)->snapshot();

    if (!$tokenDoc->exists()) {
        throw new Exception("Token FCM não encontrado para o dono ID: " . $donoId);
    }
    $fcmToken = $tokenDoc->data()['fcmToken'] ?? '';
    if (empty($fcmToken)) {
        throw new Exception("Campo 'fcmToken' está vazio no documento do dono.");
    }

    $firebaseNotifications = new FireBaseNotifications($firebaseServerKey);
    $firebaseResult = $firebaseNotifications->sendToTokens([$fcmToken], $titulo, $mensagem);

    // --- SUCESSO ---
    echo json_encode(['success' => true, 'message' => 'Notificação processada.', 'firebaseResult' => $firebaseResult]);

} catch (Exception $e) {
    // --- ERRO ---
    http_response_code(400 );
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

