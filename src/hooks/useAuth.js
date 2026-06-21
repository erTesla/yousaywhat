import { useState, useEffect } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// Returns the Firebase User once anonymous sign-in completes, or null if still loading.
export function useAuth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      if (u) {
        setUser(u);
      } else {
        signInAnonymously(auth);
      }
    });
    return unsub;
  }, []);

  return user;
}
