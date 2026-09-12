'use strict';

const fs = require('fs');

const arquivo = 'firestore.rules';
const atual = fs.readFileSync(arquivo, 'utf8');

const blocoAtual = `      match /agendamentos/{agendamentoId} {

        // Compatibilidade com o Pronti Agenda:
        // a vitrine precisa consultar os agendamentos ativos do dia
        // para calcular corretamente os horários disponíveis.
        allow read: if true;`;

const blocoSeguro = `      match /agendamentos/{agendamentoId} {

        // Dados completos do agendamento são privados.
        // A vitrine pública consulta somente disponibilidade pela Cloud Function.
        allow read: if request.auth != null;`;

const ocorrencias = atual.split(blocoAtual).length - 1;

if (ocorrencias !== 1) {
  throw new Error(
    `Proteção abortada: esperado 1 bloco público de agendamentos, encontrado(s) ${ocorrencias}.`
  );
}

const seguro = atual.replace(blocoAtual, blocoSeguro);
fs.writeFileSync(arquivo, seguro, 'utf8');

console.log('Firestore Rules: leitura pública de agendamentos removida com sucesso.');
