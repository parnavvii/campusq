/**
 * Fetches data over REST and re-fetches it whenever one of the given Socket.IO
 * events fires (and after a reconnect), so screens update without a refresh.
 *
 *  - rooms / businessRooms: queue or business rooms to listen to — an array, or a
 *    function of the loaded data (e.g. "the business on this page").
 *  - jitterMs: spreads re-fetches out when many screens hear the same notice.
 *  - pollMs: re-fetch on a timer too — for visitors who aren't logged in and so
 *    have no live connection.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { errorMessage } from '../lib/api';

const resolve = (value, data) => (typeof value === 'function' ? value(data) : value) || [];

export function useLiveData(fetcher, { events = [], filter, deps = [], rooms = [], businessRooms = [], jitterMs = 0, pollMs = 0 } = {}) {
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const timer = useRef(null);

  const reload = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!pollMs) return undefined;
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
  }, [pollMs, reload]);

  const roomKey = resolve(rooms, data).join(',');
  const businessKey = resolve(businessRooms, data).join(',');
  const eventKey = events.join(',');

  useEffect(() => {
    if (!socket) return undefined;
    const ids = (key) => (key ? key.split(',').map(Number) : []);
    const serviceIds = ids(roomKey);
    const businessIds = ids(businessKey);
    const subscribe = () => {
      serviceIds.forEach((id) => socket.emit('service:subscribe', id));
      businessIds.forEach((id) => socket.emit('business:subscribe', id));
    };
    const schedule = (payload) => {
      if (filterRef.current && !filterRef.current(payload)) return;
      clearTimeout(timer.current); // coalesce bursts of events into one fetch
      timer.current = setTimeout(reload, 120 + Math.random() * jitterMs);
    };
    const onConnect = () => {
      subscribe();
      reload();
    };
    subscribe();
    const names = eventKey ? eventKey.split(',') : [];
    names.forEach((e) => socket.on(e, schedule));
    socket.on('connect', onConnect);
    return () => {
      names.forEach((e) => socket.off(e, schedule));
      socket.off('connect', onConnect);
      serviceIds.forEach((id) => socket.emit('service:unsubscribe', id));
      businessIds.forEach((id) => socket.emit('business:unsubscribe', id));
      clearTimeout(timer.current);
    };
  }, [socket, reload, eventKey, roomKey, businessKey, jitterMs]);

  return { data, error, loading, reload, setData };
}
