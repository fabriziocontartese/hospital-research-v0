import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import TaskTable from '../components/TaskTable';
import { Badge } from '../components/ui/Badge';
import styles from '../styles/TasksPage.module.css';

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Pending' },
  { value: 'expired', label: 'Overdue' },
  { value: 'submitted', label: 'Completed' },
];

const statusMeta = {
  open: { label: 'Pending', variant: 'primary' },
  submitted: { label: 'Completed', variant: 'success' },
  expired: { label: 'Overdue', variant: 'danger' },
};
const statusVariant = (status) => statusMeta[status]?.variant || 'neutral';
const statusLabel = (status) => statusMeta[status]?.label || status;

const Tasks = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [studyFilter, setStudyFilter] = useState('all');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const tasksQuery = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const response = await apiClient.get('/api/tasks');
      return response.data.tasks;
    },
  });

  const studiesQuery = useQuery({
    queryKey: ['studies'],
    queryFn: async () => {
      const response = await apiClient.get('/api/studies');
      return response.data.studies;
    },
    enabled: user.role !== 'staff',
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const studies = useMemo(() => studiesQuery.data ?? [], [studiesQuery.data]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (status !== 'all' && task.status !== status) return false;
      if (hideCompleted && task.status === 'submitted') return false;
      if (studyFilter !== 'all') {
        const studyId = task.studyId?._id || task.studyId;
        if (!studyId || String(studyId) !== studyFilter) return false;
      }
      if (!query) return true;
      const formName = task.formId?.schema?.title || task.formId?.version || '';
      const studyName = task.studyId?.title || '';
      const assigneesText = (task.assignees || [])
        .map((a) => a?.displayName || a?.email || '')
        .join(' ');
      return (
        formName.toLowerCase().includes(query) ||
        studyName.toLowerCase().includes(query) ||
        (task.pid || '').toLowerCase().includes(query) ||
        assigneesText.toLowerCase().includes(query)
      );
    });
  }, [tasks, search, status, studyFilter, hideCompleted]);

  const sortedTasks = useMemo(() => {
    const copy = [...filteredTasks];
    copy.sort((a, b) => {
      const labelA = (a.assignees?.[0]?.displayName || a.assignees?.[0]?.email || '').toLowerCase();
      const labelB = (b.assignees?.[0]?.displayName || b.assignees?.[0]?.email || '').toLowerCase();
      return labelA.localeCompare(labelB);
    });
    return copy;
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const pending = tasks.filter((task) => task.status === 'open').length;
    const overdue = tasks.filter((task) => task.status === 'expired').length;
    const completed = tasks.filter((task) => task.status === 'submitted').length;
    return { total: tasks.length, pending, overdue, completed };
  }, [tasks]);

  const studyOptions = useMemo(() => {
    if (studies.length) {
      return studies.map((study) => ({ id: String(study._id), title: study.title }));
    }
    const map = new Map();
    tasks.forEach((task) => {
      const study = task.studyId;
      const id = String(study?._id || study || '');
      const title = study?.title;
      if (id && title && !map.has(id)) {
        map.set(id, { id, title });
      }
    });
    return Array.from(map.values());
  }, [studies, tasks]);

  const openTaskModal = (task) => setSelectedTask(task);

  const resetTaskMutation = useMutation({
    mutationFn: (taskId) => apiClient.delete(`/api/tasks/${taskId}/response`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setSelectedTask(null);
    },
  });

  const handleNavigateToForm = (task) => {
    const formId = task.formId?._id || task.formId;
    setSelectedTask(null);
    navigate(`/forms/${formId}?taskId=${task._id}&pid=${task.pid}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Tasks</h1>
          <p>
            {user.role === 'staff'
              ? 'Complete assigned forms and keep patient records up to date.'
              : 'Monitor study progress and outstanding actions across your organisation.'}
          </p>
        </div>
      </header>

      <section className={styles.statGrid}>
        <Card>
          <CardHeader>
            <CardTitle>Total tasks</CardTitle>
            <CardDescription>All assignments in your scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.statValue}>{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pending</CardTitle>
            <CardDescription>Awaiting completion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.statValue}>{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue</CardTitle>
            <CardDescription>Past due date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.statValueDanger}>{stats.overdue}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
            <CardDescription>Marked as submitted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.statValueSuccess}>{stats.completed}</div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Task list</CardTitle>
          <CardDescription>Adjust filters, then open forms to complete or review submissions.</CardDescription>
        </CardHeader>
        <CardContent className={styles.tasksSection}>
          <div className={styles.filters}>
            <label>
              <span>Search</span>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Form, study, assignee, or patient ID"
              />
            </label>
            <label>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Study</span>
              <select value={studyFilter} onChange={(e) => setStudyFilter(e.target.value)}>
                <option value="all">All studies</option>
                {studyOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterToggle}>
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
              />
              <span>Exclude completed</span>
            </label>
            <div className={styles.filterAction}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatus('all');
                  setStudyFilter('all');
                  setHideCompleted(false);
                }}
              >
                Reset
              </Button>
            </div>
          </div>

          {tasksQuery.isLoading ? (
            <div className={styles.emptyState}>Loading tasks…</div>
          ) : (
            <TaskTable
              tasks={sortedTasks}
              onSelectTask={openTaskModal}
              // For researchers/admins we show the assignee list column
              showAssignee={user.role !== 'staff'}
            />
          )}
        </CardContent>
      </Card>

      {selectedTask ? (
        <div className={styles.modalBackdrop} onClick={() => setSelectedTask(null)}>
          <div className={styles.taskModal} onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Task overview</CardTitle>
                <CardDescription>Review details before opening the form.</CardDescription>
              </CardHeader>
              <CardContent className={styles.taskModalBody}>
                <div className={styles.taskSummaryGrid}>
                  <div>
                    <span className={styles.summaryLabel}>Study</span>
                    <span className={styles.summaryValue}>{selectedTask.studyId?.title || '—'}</span>
                  </div>
                  <div>
                    <span className={styles.summaryLabel}>Form</span>
                    <span className={styles.summaryValue}>
                      {selectedTask.formId?.schema?.title || selectedTask.formId?.version || 'Form'}
                    </span>
                  </div>
                  <div>
                    <span className={styles.summaryLabel}>Patient</span>
                    <span className={`${styles.summaryValue} ${styles.mono}`}>{selectedTask.pid}</span>
                  </div>
                  <div>
                    <span className={styles.summaryLabel}>Due date</span>
                    <span className={styles.summaryValue}>
                      {selectedTask.dueAt ? new Date(selectedTask.dueAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <div>
                    <span className={styles.summaryLabel}>Assignees</span>
                    <span className={styles.summaryValue}>
                      {(selectedTask.assignees || []).length
                        ? selectedTask.assignees
                            .map((a) => a?.displayName || a?.email || '—')
                            .join(', ')
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className={styles.summaryLabel}>Status</span>
                    <Badge variant={statusVariant(selectedTask.status)}>
                      {statusLabel(selectedTask.status)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
              <CardContent className={styles.modalActions}>
                {selectedTask.status === 'submitted' ? (
                  <>
                    <Button onClick={() => handleNavigateToForm(selectedTask)}>Edit submission</Button>
                    <Button
                      variant="outline"
                      onClick={() => resetTaskMutation.mutate(selectedTask._id)}
                      disabled={resetTaskMutation.isLoading}
                    >
                      {resetTaskMutation.isLoading ? 'Removing…' : 'Delete submission'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => handleNavigateToForm(selectedTask)}>Begin form</Button>
                )}
                <Button type="button" variant="ghost" onClick={() => setSelectedTask(null)}>
                  Close
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Tasks;
