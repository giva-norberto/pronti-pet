// Arquivo: uploadService.js
// Responsabilidade: Fazer upload de qualquer arquivo para o Firebase Storage.
// Este módulo agora é 100% independente e não importa nada do Firebase.

/**
 * Faz o upload de um arquivo para um caminho específico no Firebase Storage.
 * @param {object} firebase - Um objeto contendo as funções e o serviço do Firebase.
 * @param {object} firebase.storage - O serviço do Storage já inicializado.
 * @param {function} firebase.ref - A função ref() do SDK do Storage.
 * @param {function} firebase.uploadBytes - A função uploadBytes() do SDK do Storage.
 * @param {function} firebase.getDownloadURL - A função getDownloadURL() do SDK do Storage.
 * @param {File} file O objeto do arquivo a ser enviado.
 * @param {string} storagePath O caminho completo onde o arquivo será salvo.
 * @returns {Promise<string>} A URL de download pública do arquivo.
 */
export async function uploadFile(firebase, file, storagePath) {
    if (!file || !storagePath) {
        throw new Error("Um arquivo e um caminho de destino são obrigatórios para o upload.");
    }
    if (!firebase || !firebase.storage || !firebase.ref || !firebase.uploadBytes || !firebase.getDownloadURL) {
        throw new Error("As dependências do Firebase (storage, ref, uploadBytes, getDownloadURL) são obrigatórias.");
    }

    // Validações
    if (file.size > 2 * 1024 * 1024) { // 2MB
        throw new Error("Arquivo muito grande. Máximo permitido: 2 MB.");
    }
    if (!file.type.startsWith('image/')) {
        throw new Error("Somente arquivos de imagem são permitidos.");
    }

    try {
        // Usa as funções e o serviço passados como parâmetro
        const storageRef = firebase.ref(firebase.storage, storagePath);
        const uploadResult = await firebase.uploadBytes(storageRef, file);
        const downloadURL = await firebase.getDownloadURL(uploadResult.ref);
        return downloadURL;

    } catch (error) {
        console.error("Erro no serviço de upload:", error);
        // Lança o erro original para que a função que chamou possa tratá-lo
        throw error;
    }
}
