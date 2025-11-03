import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { apiClient } from '../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import styles from '../styles/DashboardPage.module.css';

const statusVariant = (status) => {
  switch (status) {
    case 'submitted':
      return 'success';
    case 'expired':
      return 'danger';
    case 'open':
      return 'primary';
    default:
      return 'neutral';
  }
};

const statusLabel = (status) => {
  switch (status) {
    case 'submitted':
      return 'Completed';
    case 'expired':
      return 'Overdue';
    case 'open':
      return 'Pending';
    default:
      return status;
  }
};

const Dashboard = () => {
  const { user } = useAuth();

  const allowStudies = user.role !== 'staff';
  const allowPopulation = user.role !== 'staff';

  const studiesQuery = useQuery({
    queryKey: ['studies'],
    queryFn: async () => {
      const response = await apiClient.get('/api/studies');
      return response.data.studies;
    },
    enabled: allowStudies,
  });

  const tasksQuery = useQuery({
    queryKey: ['dashboard', 'tasks'],
    queryFn: async () => {
      const response = await apiClient.get('/api/tasks');
      return response.data.tasks;
    },
  });

  const patientsQuery = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const response = await apiClient.get('/api/patients');
      return response.data.patients;
    },
    enabled: allowPopulation,
  });

  const stats = useMemo(() => {
    const studies = studiesQuery.data || [];
    const tasks = tasksQuery.data || [];
    const patients = patientsQuery.data || [];

    const activeStudies = studies.filter((s) => s.status === 'active').length;
    const completedTasks = tasks.filter((t) => t.status === 'submitted').length;
    const totalTasks = tasks.length;
    const activePopulation = patients.filter((p) => {
      if (p.status) return p.status === 'active';
      if (typeof p.isActive === 'boolean') return p.isActive;
      return true;
    }).length;

    return {
      activeStudies: allowStudies ? activeStudies : null,
      tasksCompleted: completedTasks,
      tasksTotal: totalTasks,
      activePopulation: allowPopulation ? activePopulation : null,
    };
  }, [allowStudies, allowPopulation, studiesQuery.data, tasksQuery.data, patientsQuery.data]);

  const recentTasks = (tasksQuery.data || []).slice(0, 6);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Welcome back, {user.displayName || user.email}</h1>
        </div>
        <Badge variant="neutral">{user.role}</Badge>
      </header>

      <p className={styles.headerBlurb}>
        Monitor study activity, follow up on outstanding tasks, and keep your research cohorts organised.
      </p>

      {/* Lean, left-to-right compact stats */}
      <section className={styles.compactStatsRow}>
        <Card className={styles.compactCard}>
          <CardHeader className={styles.compactHeader}>
            <CardTitle className={styles.compactTitle}>Active Studies</CardTitle>
          </CardHeader>
          <CardContent className={styles.compactValue}>
            {stats.activeStudies ?? '—'}
          </CardContent>
        </Card>

        <Card className={styles.compactCard}>
          <CardHeader className={styles.compactHeader}>
            <CardTitle className={styles.compactTitle}>Tasks completed</CardTitle>
          </CardHeader>
          <CardContent className={styles.compactValue}>
            {stats.tasksCompleted} / {stats.tasksTotal}
          </CardContent>
        </Card>

        <Card className={styles.compactCard}>
          <CardHeader className={styles.compactHeader}>
            <CardTitle className={styles.compactTitle}>Active Population</CardTitle>
          </CardHeader>
          <CardContent className={styles.compactValue}>
            {stats.activePopulation ?? '—'}
          </CardContent>
        </Card>
      </section>

      <section className={styles.activitySection}>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className={styles.activityList}>
            {tasksQuery.isLoading ? (
              <div className={styles.emptyState}>Loading activity…</div>
            ) : recentTasks.length === 0 ? (
              <div className={styles.emptyState}>No activity recorded yet.</div>
            ) : (
              recentTasks.map((task) => (
                <div key={task._id} className={styles.activityItem}>
                  <div className={styles.activityInfo}>
                    <span className={styles.activityTitle}>
                      {task.formId?.schema?.title || task.formId?.version || 'Form assignment'}
                    </span>
                    <span className={styles.activityMeta}>
                      {task.studyId?.title || 'Study'} · Patient {task.pid}
                    </span>
                    <span className={styles.activityMeta}>
                      Due {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'n/a'}
                      {task.assignee ? ` · Assigned to ${task.assignee.displayName || task.assignee.email}` : ''}
                    </span>
                  </div>
                  <Badge variant={statusVariant(task.status)}>{statusLabel(task.status)}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Dashboard;
