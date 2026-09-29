import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import ServiceList from '../../components/queue/ServiceList';
import { useAuth } from '../../context/AuthContext';
import { useServices } from '../../hooks/useCustomerQueue';

export default function StaffDashboard() {
  const { user } = useAuth();
  const { data, loading, error } = useServices();
  const isAdmin = user.role === 'ADMIN';
  const mine = (data || []).filter((s) => s.canManage);

  return (
    <>
      <PageHeader
        eyebrow={user.business?.name}
        title={isAdmin ? 'All queues' : 'Your queues'}
        description={isAdmin ? 'Every service at your business. Open one to call people, add walk-ins and check in bookings.' : 'The services you look after. Open one to call people, add walk-ins and check in bookings.'}
        actions={<Link to="/staff/reports" className="inline-flex min-h-11 items-center rounded-full border border-line bg-cream px-5 font-semibold hover:bg-white">Today's report</Link>}
      />
      {loading ? (
        <Spinner />
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : !mine.length ? (
        isAdmin ? (
          <EmptyState title="No services yet" action={<Link to="/admin/services?welcome=1" className="inline-flex min-h-11 items-center rounded-full bg-sage-deep px-6 font-semibold text-cream">Add your first service</Link>}>
            Add a service — like “Haircut” or “Phone repair” — to open your queue.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing assigned to you yet">Ask your manager to add you to a service.</EmptyState>
        )
      ) : (
        <ServiceList
          services={mine}
          renderAction={(s) => (
            <div className="flex flex-wrap gap-2">
              <Link to={`/staff/services/${s.id}`} className="inline-flex min-h-11 items-center rounded-full bg-sage-deep px-5 font-semibold text-cream hover:bg-sage">
                Open queue
              </Link>
              <Link to={`/staff/services/${s.id}/stats`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-cream px-5 font-semibold hover:bg-white">
                Stats
              </Link>
            </div>
          )}
        />
      )}
    </>
  );
}
