/**
 * One authenticated Socket.IO connection per signed-in user.
 * Personal events (your turn / you're next / skipped / completed / booking
 * updates) are handled here once, globally, so the customer hears about them
 * on any page.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_ORIGIN } from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { browserNotify } from '../lib/notify';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const toast = useToast();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const announced = useRef(new Set());

  useEffect(() => {
    if (!token || !user) return undefined;
    const s = io(API_ORIGIN || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    if (user.role === 'CUSTOMER') {
      const once = (key, fn) => {
        if (announced.current.has(key)) return;
        announced.current.add(key);
        fn();
      };
      const place = (e) => e.serviceLocation || e.serviceName;
      s.on('token:called', (e) =>
        once(`called-${e.id}`, () => {
          toast.turn(`It's your turn — ${e.token}`, `Please go to ${place(e)} now.`);
          browserNotify(`It's your turn: ${e.token}`, `Go to ${place(e)} now.`);
        })
      );
      s.on('token:next', (e) =>
        once(`next-${e.id}`, () => {
          toast.info(`You're next — ${e.token}`, `Start heading to ${e.serviceName}.`);
          browserNotify(`You're next: ${e.token}`, `Start heading to ${e.serviceName}.`);
        })
      );
      s.on('token:skipped', (e) =>
        once(`skipped-${e.id}`, () => toast.error(`Token ${e.token} was skipped`, 'Staff could not find you when your turn came. You can join the queue again.'))
      );
      s.on('token:completed', (e) =>
        once(`completed-${e.id}`, () => toast.success(`Token ${e.token} completed`, 'Thanks for visiting!'))
      );
      s.on('booking:updated', (e) =>
        once(`booking-${e.id}-${e.status}`, () => {
          if (e.status === 'NO_SHOW') toast.error('Booking missed', `Booking ${e.code || ''} passed without a check-in. You can book again or join the queue.`);
          if (e.status === 'CHECKED_IN') toast.success('You are checked in', 'Staff checked you in at the desk. Your token is on My tokens.');
        })
      );
    }

    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  return <SocketContext.Provider value={{ socket, connected }}>{children}</SocketContext.Provider>;
}

export const useSocket = () => useContext(SocketContext);
