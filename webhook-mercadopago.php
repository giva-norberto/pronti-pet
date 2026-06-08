<?php
// =====================================================
// Webhook PHP para atualizar status de assinaturas
// VERSÃO REVISADA – PRONTI
// =====================================================

require __DIR__ . '/vendor/autoload.php';

use Kreait\Firebase\Factory;
use MercadoPago\Client\PreApproval\PreApprovalClient;
use MercadoPago\MercadoPagoConfig;

// -----------------------------------------------------
// CONFIGURAÇÃO
// -----------------------------------------------------

$mercadoPagoToken = getenv('MERCADOPAGO_TOKEN');
$firebaseCredentialsPath = getenv('FIREBASE_CREDENTIALS_PATH');

if (!$mercadoPagoToken || !$firebaseCredentialsPath) {
    error_log('❌ Variáveis de ambiente não configuradas corretamente.');
    http_response_code(200);
    echo 'OK';
    exit;
}

MercadoPagoConfig::setAccessToken($mercadoPagoToken);

try {
    $firebase = (new Factory)->withServiceAccount($firebaseCredentialsPath);
    $db = $firebase->createFirestore()->database();
} catch (\Exception $e) {
    error_log("❌ Erro ao inicializar Firebase: " . $e->getMessage());
    http_response_code(200);
    echo 'OK';
    exit;
}

// -----------------------------------------------------
// RECEBIMENTO DO WEBHOOK
// -----------------------------------------------------

$rawBody = file_get_contents('php://input');
$data = json_decode($rawBody, true);

error_log("📩 Webhook recebido: " . $rawBody);

if (
    !isset($data['type']) ||
    $data['type'] !== 'preapproval' ||
    !isset($data['data']['id'])
) {
    http_response_code(200);
    echo 'OK';
    exit;
}

$preapprovalId = $data['data']['id'];

try {
    $client = new PreApprovalClient();
    $preapproval = $client->get($preapprovalId);

    $empresaId = $preapproval->external_reference ?? null;

    if (!$empresaId) {
        throw new \Exception("external_reference não encontrada na assinatura {$preapprovalId}");
    }

    $statusMP = $preapproval->status;

    $novoStatus = match ($statusMP) {
        'authorized' => 'ativo',
        'paused' => 'pausado',
        'cancelled', 'canceled' => 'cancelado',
        default => 'desconhecido',
    };

    $empresaRef = $db->collection('empresarios')->document($empresaId);
    $empresaSnap = $empresaRef->snapshot();

    if (!$empresaSnap->exists()) {
        throw new \Exception("Empresa {$empresaId} não encontrada.");
    }

    $empresaData = $empresaSnap->data();
    $donoId = $empresaData['donoId'] ?? null;

    if (!$donoId) {
        throw new \Exception("Empresa {$empresaId} sem donoId.");
    }

    $usuarioRef = $db->collection('usuarios')->document($donoId);

    $agora = new \Google\Cloud\Core\Timestamp(new DateTime());

    $usuarioRef->update([
        ['path' => 'isPremium', 'value' => ($novoStatus === 'ativo')],
    ]);

    $updatesEmpresa = [
        ['path' => 'statusAssinatura', 'value' => $novoStatus],
        ['path' => 'mercadoPagoAssinaturaId', 'value' => $preapprovalId],
        ['path' => 'ultimaAtualizacaoMP', 'value' => $agora],
    ];

    if ($novoStatus === 'ativo') {
        $novaValidadeDate = (new DateTime())->modify('+30 days');
        $novaValidade = new \Google\Cloud\Core\Timestamp($novaValidadeDate);

        $updatesEmpresa[] = ['path' => 'assinaturaValidaAte', 'value' => $novaValidade];
        $updatesEmpresa[] = ['path' => 'proximoPagamento', 'value' => $novaValidade];
        $updatesEmpresa[] = ['path' => 'assinaturaAtiva', 'value' => true];
        $updatesEmpresa[] = ['path' => 'status', 'value' => 'ativo'];
        $updatesEmpresa[] = ['path' => 'plano', 'value' => 'pago'];
    } else {
        $updatesEmpresa[] = ['path' => 'assinaturaAtiva', 'value' => false];
        $updatesEmpresa[] = ['path' => 'status', 'value' => $novoStatus];
    }

    $empresaRef->update($updatesEmpresa);

    error_log("✅ Assinatura atualizada | Empresa: {$empresaId} | Status MP: {$statusMP} | Status Pronti: {$novoStatus}");

} catch (\Exception $e) {
    error_log("❌ Erro no webhook MP: " . $e->getMessage());
}

http_response_code(200);
echo "OK";
