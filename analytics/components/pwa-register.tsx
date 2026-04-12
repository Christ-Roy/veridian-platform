'use client';

import { useEffect } from 'react';
import { registerSW } from '@/lib/register-sw';

/**
 * Composant client minimal qui enregistre le Service Worker au mount.
 * Injecte dans le layout racine — ne rend rien visuellement.
 */
export function PwaRegister() {
  useEffect(() => {
    registerSW();
  }, []);

  return null;
}
