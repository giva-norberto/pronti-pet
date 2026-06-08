<?php
/**
 * FireBaseNotifications.class.php
 * 
 * Classe para enviar notificações via Firebase Cloud Messaging (FCM)
 * Pode enviar para tokens específicos ou tópicos.
 * VERSÃO ATUALIZADA: Suporte a payload 'notification' para push automático em PWA.
 */

class FireBaseNotifications {
    private $serverApiKey;
    private $firebaseUrl;

    /**
     * Construtor
     * @param string $serverApiKey Chave do servidor FCM (Configurações do projeto -> Cloud Messaging)
     */
    public function __construct(string $serverApiKey = '') {
        if (!$serverApiKey) {
            throw new Exception("É necessário fornecer a server API key do Firebase.");
        }
        $this->serverApiKey = $serverApiKey;
        $this->firebaseUrl = "https://fcm.googleapis.com/fcm/send";
    }

    /**
     * Envia notificação para tokens específicos
     * @param array $tokens Array de tokens FCM
     * @param string $titulo Título da notificação
     * @param string $mensagem Corpo da notificação
     * @param string|null $icone URL do ícone
     * @param string|null $imagem URL da imagem
     * @param array|null $dados Extras personalizados em data
     * @return array Resultado da requisição
     */
    public function sendToTokens(array $tokens, string $titulo, string $mensagem, string $icone = null, string $imagem = null, array $dados = null): array {
        if (empty($tokens)) return ['success' => false, 'error' => 'Nenhum token fornecido'];

        // Payload de notification para push automático
        $notification = [
            'title' => $titulo,
            'body'  => $mensagem,
            'icon'  => $icone,
            'image' => $imagem
        ];

        $payload = [
            'registration_ids' => $tokens,
            'notification' => $notification,
            'data' => $dados ?? $notification,
            'priority' => 'high'
        ];

        return $this->executeCurl($payload);
    }

    /**
     * Envia notificação para um tópico
     * @param string $topic Nome do tópico (ex: "clientes")
     * @param string $titulo
     * @param string $mensagem
     * @param string|null $icone
     * @param string|null $imagem
     * @param array|null $dados Extras personalizados em data
     * @return array Resultado da requisição
     */
    public function sendToTopic(string $topic, string $titulo, string $mensagem, string $icone = null, string $imagem = null, array $dados = null): array {
        $notification = [
            'title' => $titulo,
            'body'  => $mensagem,
            'icon'  => $icone,
            'image' => $imagem
        ];

        $payload = [
            'to' => "/topics/{$topic}",
            'notification' => $notification,
            'data' => $dados ?? $notification,
            'priority' => 'high'
        ];

        return $this->executeCurl($payload);
    }

    /**
     * Executa a requisição CURL para FCM
     * @param array $payload Dados da notificação
     * @return array Resultado da requisição
     */
    private function executeCurl(array $payload): array {
        $headers = [
            'Authorization: key=' . $this->serverApiKey,
            'Content-Type: application/json'
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->firebaseUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

        $result = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return ['success' => false, 'error' => $error];
        }

        return ['success' => true, 'response' => json_decode($result, true)];
    }
}
