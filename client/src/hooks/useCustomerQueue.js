/**
 * Customer data + actions shared by "My visits", business pages and booking.
 * Everything refreshes live over Socket.IO — no manual reload needed.
 *
 * Scaling: a customer's tokens refresh when *their* queues change (they join
 * those queues' rooms); a business page refreshes on that business's notices,
 * spread out with a random delay so many screens don't hit the server at once.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppointmentAPI, BusinessAPI, QueueAPI, ServiceAPI, errorMessage } from '../lib/api';
import { useLiveData } from './useLiveData';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { timeLabel, relativeDay, minutesLabel } from '../lib/format';

const TOKEN_EVENTS = ['queue:updated', 'token:called', 'token:next', 'token:skipped', 'token:completed', 'booking:updated'];

export function useMyEntries() {
  return useLiveData(QueueAPI.myPosition, {
    events: TOKEN_EVENTS,
    // Listen to the rooms of the queues I'm in.
    rooms: (entries) => [...new Set((entries || []).map((e) => e.serviceId))].sort((a, b) => a - b),
  });
}

export function useMyBookings() {
  return useLiveData(AppointmentAPI.mine, { events: ['booking:updated', 'token:called'] });
}

/** A business page: its details and services with live queue numbers. */
export function useBusinessPage(slug) {
  const { user } = useAuth();
  return useLiveData(() => BusinessAPI.page(slug), {
    events: ['services:changed'],
    businessRooms: (page) => (page?.business ? [page.business.id] : []),
    jitterMs: 1500,
    pollMs: user ? 0 : 15000,
    deps: [slug],
  });
}

/** Staff and admins: their own business's services. */
export function useServices() {
  return useLiveData(() => ServiceAPI.list(), { events: ['services:changed'], jitterMs: 1500 });
}

export function useQueueActions({ onChanged } = {}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [joiningId, setJoiningId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const join = useCallback(
    async (service) => {
      setJoiningId(service.id);
      try {
        const { entry } = await QueueAPI.join(service.id);
        const wait = entry.estimatedWaitMinutes > 0 ? `about ${minutesLabel(entry.estimatedWaitMinutes)}` : 'you could be called any moment';
        toast.success(`You're in line — ${entry.token}`, `${entry.peopleAhead} ahead of you · ${wait}`);
        onChanged?.();
        navigate('/me');
      } catch (err) {
        toast.error("Couldn't join the queue", errorMessage(err));
        onChanged?.();
      } finally {
        setJoiningId(null);
      }
    },
    [toast, navigate, onChanged]
  );

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await QueueAPI.cancel(cancelTarget.id);
      toast.success(`You left the queue`, `${cancelTarget.token} at ${cancelTarget.serviceName} is cancelled.`);
      onChanged?.();
    } catch (err) {
      toast.error("Couldn't leave the queue", errorMessage(err));
      onChanged?.();
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  }, [cancelTarget, toast, onChanged]);

  return { join, joiningId, cancelTarget, setCancelTarget, cancelling, confirmCancel };
}

export function useBookingActions({ onChanged } = {}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const checkIn = useCallback(
    async (booking) => {
      setBusyId(booking.id);
      try {
        const { entry } = await AppointmentAPI.checkIn(booking.id);
        toast.success(`You're checked in — ${entry.token}`, `You'll be called around ${timeLabel(booking.slotStart, booking.business?.timezone)}.`);
        onChanged?.();
        navigate('/me');
      } catch (err) {
        toast.error("Couldn't check you in", errorMessage(err));
        onChanged?.();
      } finally {
        setBusyId(null);
      }
    },
    [toast, navigate, onChanged]
  );

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    const tz = cancelTarget.business?.timezone;
    try {
      await AppointmentAPI.cancel(cancelTarget.id);
      toast.success('Booking cancelled', `${cancelTarget.serviceName}, ${relativeDay(cancelTarget.slotStart, tz)} at ${timeLabel(cancelTarget.slotStart, tz)}.`);
      onChanged?.();
    } catch (err) {
      toast.error("Couldn't cancel the booking", errorMessage(err));
      onChanged?.();
    } finally {
      setBusyId(null);
      setCancelTarget(null);
    }
  }, [cancelTarget, toast, onChanged]);

  return { checkIn, busyId, cancelTarget, setCancelTarget, confirmCancel };
}

export function useEntryMap(entries) {
  return useMemo(() => Object.fromEntries((entries || []).map((e) => [e.serviceId, e])), [entries]);
}
