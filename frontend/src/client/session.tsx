import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'sp-plate';

function readStoredPlate(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface Session {
  plate: string | null;
  signIn: (plate: string) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

/** "Login" do cliente: apenas a placa, guardada no navegador. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [plate, setPlate] = useState<string | null>(readStoredPlate);

  const signIn = useCallback((value: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* segue só em memória */
    }
    setPlate(value);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* nada a fazer */
    }
    setPlate(null);
  }, []);

  return <SessionContext.Provider value={{ plate, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession fora do SessionProvider');
  return session;
}
