import { getFirestore, doc, runTransaction, Timestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Garante que o usuário tenha os campos trialStart e trialEndDate salvos no Firestore.
 * Regras:
 * - trialStart é o instante do primeiro acesso (Timestamp).
 * - trialEndDate é o fim do 15º dia (trialStart + 14 dias) às 23:59:59.999 local.
 * - Não sobrescreve campos existentes; usa transaction para evitar race conditions.
 */
export async function ensureTrialStart(): Promise<void> {
  const db = getFirestore();
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;

  const userRef = doc(db, "usuarios", user.uid);

  // Auxiliar: converte Timestamp | string | Date para Date | null
  function toDate(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === "function") {
      try {
        return value.toDate();
      } catch {
        return null;
      }
    }
    const d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);

      if (!snap.exists()) {
        // Primeiro acesso: cria documento já com trialStart e trialEndDate
        const trialStartDate = new Date();
        const trialEndDate = new Date(trialStartDate);
        // +14 dias para totalizar 15 dias contando o dia inicial
        trialEndDate.setDate(trialEndDate.getDate() + 14);
        // ajusta para fim do dia local
        trialEndDate.setHours(23, 59, 59, 999);

        tx.set(userRef, {
          nome: user.displayName || null,
          email: user.email || "",
          trialStart: Timestamp.fromDate(trialStartDate),
          trialEndDate: Timestamp.fromDate(trialEndDate),
          isPremium: false,
        });
        return;
      }

      // Documento existe: só acrescenta os campos que faltam (não sobrescreve)
      const data = snap.data();
      const updates: Record<string, any> = {};

      if (!data.trialStart) {
        const trialStartDate = new Date();
        updates.trialStart = Timestamp.fromDate(trialStartDate);

        // se também estiver faltando trialEndDate, define com base no trialStart recém criado
        if (!data.trialEndDate) {
          const trialEndDate = new Date(trialStartDate);
          trialEndDate.setDate(trialEndDate.getDate() + 14);
          trialEndDate.setHours(23, 59, 59, 999);
          updates.trialEndDate = Timestamp.fromDate(trialEndDate);
        }
      } else if (!data.trialEndDate) {
        // existe trialStart, mas falta trialEndDate: calcula a partir do trialStart existente
        const existingStart = data.trialStart;
        const startDate = toDate(existingStart);

        if (startDate) {
          const trialEndDate = new Date(startDate);
          trialEndDate.setDate(trialEndDate.getDate() + 14);
          trialEndDate.setHours(23, 59, 59, 999);
          updates.trialEndDate = Timestamp.fromDate(trialEndDate);
        } else {
          // não conseguimos interpretar o start existente: recalcula a partir de agora
          const trialStartDate = new Date();
          const trialEndDate = new Date(trialStartDate);
          trialEndDate.setDate(trialEndDate.getDate() + 14);
          trialEndDate.setHours(23, 59, 59, 999);
          updates.trialStart = Timestamp.fromDate(trialStartDate);
          updates.trialEndDate = Timestamp.fromDate(trialEndDate);
        }
      }

      // Aplica updates somente se houver algo a atualizar
      if (Object.keys(updates).length > 0) {
        tx.update(userRef, updates);
      }
    });
  } catch (err) {
    console.error("Erro em ensureTrialStart:", err);
    // não rethrow para não quebrar fluxo do cliente, mas você pode optar por lançar de novo
    throw err;
  }
}
