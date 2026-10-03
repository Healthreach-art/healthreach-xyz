import { createStart } from '@tanstack/react-start';
import { attachFirebaseAuth } from '@/lib/firebase-auth-middleware';

export const startInstance = createStart(() => ({
  functionMiddleware: [attachFirebaseAuth],
}));
