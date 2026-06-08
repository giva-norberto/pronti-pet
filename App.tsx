import React, { useState, useEffect } from 'react';
import { Plus, Users, X, Upload } from 'lucide-react';

// 1. IMPORTAÇÕES DO FIREBASE
import { db, auth, storage } from './firebase-config.js';
import { collection, addDoc, onSnapshot, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged } from 'firebase/auth';

// Define a estrutura de um Profissional
interface Profissional {
  id: string;
  nome: string;
  fotoUrl: string;
  ehDono: boolean;
}

function App() {
  // 2. ESTADOS DA APLICAÇÃO
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [foto, setFoto] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  // 3. EFEITO PARA AUTENTICAÇÃO E BUSCA DE DADOS
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const q = query(collection(db, "empresarios"), where("donoId", "==", user.uid));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setEmpresaId(snapshot.docs[0].id);
        } else {
          setLoading(false);
          console.warn("Nenhuma empresa encontrada para este usuário.");
        }
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!empresaId) return;
    setLoading(true);
    const profissionaisRef = collection(db, "empresarios", empresaId, "profissionais");
    const q = query(profissionaisRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Profissional));
      setProfissionais(lista);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao buscar profissionais:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [empresaId]);

  // Funções para controlar o modal e o formulário
  const abrirModal = () => { setModalAberto(true); setNome(''); setFoto(null); };
  const fecharModal = () => { setModalAberto(false); };
  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) setFoto(e.target.files[0]); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !empresaId) {
      alert('O nome do profissional é obrigatório.');
      return;
    }
    setSalvando(true);
    let fotoURL = '';
    if (foto) {
      try {
        const storageRef = ref(storage, `fotos-profissionais/${empresaId}/${Date.now()}-${foto.name}`);
        await uploadBytes(storageRef, foto);
        fotoURL = await getDownloadURL(storageRef);
      } catch (error) {
        console.error("Erro no upload da foto: ", error);
        alert("Falha ao enviar a foto.");
        setSalvando(false);
        return;
      }
    }
    const novoProfissional = {
      nome: nome.trim(),
      fotoUrl: fotoURL,
      ehDono: false,
      servicos: [],
      horarios: {},
      criadoEm: serverTimestamp()
    };
    try {
      const profissionaisRef = collection(db, "empresarios", empresaId, "profissionais");
      await addDoc(profissionaisRef, novoProfissional);
      alert('✅ Profissional adicionado com sucesso!');
      fecharModal();
    } catch (error) {
      console.error("Erro ao salvar profissional: ", error);
      alert("Falha ao salvar o profissional.");
    } finally {
      setSalvando(false);
    }
  };

  // 4. A INTERFACE VISUAL (JSX)
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="main-content">
        <div className="header-section">
          <div className="header-content">
            <h1>Minha Equipe</h1>
            <p>Gerencie os profissionais que fazem parte do seu negócio.</p>
          </div>
          <div className="header-actions">
            <button type="button" onClick={abrirModal} className="btn-new" disabled={!empresaId || loading}>
              + Adicionar Profissional
            </button>
          </div>
        </div>
        <div className="form-card">
          <h3>Profissionais Cadastrados</h3>
          <div id="lista-profissionais-painel">
            {loading ? (
              <p>🔄 Carregando equipe...</p>
            ) : profissionais.length === 0 ? (
              <p>Nenhum profissional na equipe ainda. Clique em "Adicionar Profissional" para começar.</p>
            ) : (
              profissionais.map(profissional => (
                <div key={profissional.id} className="profissional-card">
                  <img src={profissional.fotoUrl || 'https://placehold.co/40x40'} alt={`Foto de ${profissional.nome}`} />
                  <span className="profissional-nome">{profissional.nome}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {modalAberto && (
        <div id="modal-add-profissional" className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-box">
            <h2>Adicionar Novo Profissional</h2>
            <form id="form-add-profissional" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="nome-profissional">Nome do Profissional *</label>
                <input type="text" id="nome-profissional" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="foto-profissional">Foto do Profissional (Opcional)</label>
                <input type="file" id="foto-profissional" accept="image/*" onChange={handleFotoChange} />
              </div>
              <div className="form-actions">
                <button type="button" id="btn-cancelar-profissional" className="btn-secondary" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn-submit" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar Profissional'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
