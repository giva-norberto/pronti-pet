// src/components/LayoutProtegido.js

import React, { useState, useEffect } from 'react';
import { showCustomAlert } from './custom-alert.js';
import { getUserStatus, startUserTrial } from '../services/api';
import { logout } from '../services/auth';

// O segredo está aqui: { children }
// 'children' será o componente da página que queremos renderizar (ex: <Dashboard />)
export default function LayoutProtegido({ children }) {
  const [userHasAccess, setUserHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleStartTrial = async () => { /* ... lógica de ativar trial ... */ 
      const response = await startUserTrial();
      if (response.success) {
        alert("Período de teste ativado!");
        window.location.reload();
      }
    };
    const handleClose = () => { /* ... lógica de fechar/logout ... */ 
      logout();
    };

    const checkStatus = async () => {
      try {
        const status = await getUserStatus();
        if (status.hasActivePlan || status.isTrialActive) {
          setUserHasAccess(true);
        } else {
          showCustomAlert({
            title: "Acesso Restrito",
            onTrial: handleStartTrial,
            onClose: handleClose
          });
          // Não define userHasAccess como true, então nada será renderizado
        }
      } catch (error) {
        console.error("Erro de autenticação, deslogando.", error);
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, []); // Array vazio, roda só uma vez

  if (isLoading) {
    return <div>Verificando sua assinatura...</div>;
  }

  // Se o usuário tiver acesso, renderize a página "filho".
  // Se não, não renderize nada (o alerta já está na tela).
  return userHasAccess ? children : null;
}
