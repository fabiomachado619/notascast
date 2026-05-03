import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, Download, Share } from 'lucide-react';

const PWAInstallPrompt = ({ isOpen, onClose, onInstall, platform }) => {
  const isIOS = platform === 'ios';

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
    exit: { opacity: 0, scale: 0.9 },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl border border-gray-100"
            variants={modalVariants}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Fechar"
            >
              <X size={24} />
            </button>
            
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <img alt="NotasCat App Icon" class="h-10 w-10" src="https://images.unsplash.com/photo-1600783245891-f275a1575d93" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Instale o NotasCat</h2>
              <p className="mt-2 text-gray-600">
                Tenha acesso rápido e fácil ao nosso app diretamente da sua tela inicial.
              </p>
            </div>

            <div className="mt-8">
              {isIOS ? (
                <div className="text-center text-sm text-gray-700 bg-gray-50 p-4 rounded-lg">
                  <p className="font-semibold">Para instalar no seu iPhone/iPad:</p>
                  <p className="mt-2">1. Toque no ícone de <Share className="inline-block h-4 w-4 mx-1" /> (Compartilhar) no menu do Safari.</p>
                  <p className="mt-1">2. Role para baixo e selecione "Adicionar à Tela de Início".</p>
                </div>
              ) : (
                <Button
                  onClick={onInstall}
                  className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Instalar Agora
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PWAInstallPrompt;