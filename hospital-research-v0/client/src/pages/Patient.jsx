import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import TaskTable from '../components/TaskTable';
import styles from '../styles/PatientPage.module.css';

const Patient = () => {
  const { pid } = useParams();
  const navigate = useNavigate();

  const patientQuery = useQuery({
    queryKey: ['patient', pid],
    queryFn: async () => {
      const response = await apiClient.get('/api/patients', { params: { text: pid } });
      return response.data.patients.find((patient) => patient.pid === pid) || null;
    },
  });

  const responsesQuery = useQuery({
    queryKey: ['patientResponses', pid],
    queryFn: async () => {
      const response = await apiClient.get(`/api/patients/${pid}/responses`);
      return response.data.responses;
    },
    enabled: Boolean(pid),
  });

  const tasksQuery = useQuery({
    queryKey: ['patientTasks', pid],
    queryFn: async () => {
      const response = await apiClient.get(`/api/patients/${pid}/tasks`);
      return response.data.tasks;
    },
    enabled: Boolean(pid),
  });

  const patient = patientQuery.data;
  const responses = responsesQuery.data || [];
  const tasks = tasksQuery.data || [];

  const careTeam = useMemo(
    () =>
      patient?.assignedStaff?.map((member) => member.displayName || member.email).join(', ') || 'Unassigned',
    [patient]
  );

  if (patientQuery.isLoading) {
    return <div className={styles.loading}>Loading patient…</div>;
  }

  if (!patient) {
    return (
      <div className={styles.loading}>
        Patient not found.
        <button type="button" className={styles.linkButton} onClick={() => navigate('/population')}>
          ← Back to population
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button type="button" className={styles.linkButton} onClick={() => navigate('/population')}>
        ← Back to population
      </button>

      <Card>
        <CardHeader>
          <CardTitle>{patient.pid}</CardTitle>
          <CardDescription>Pseudonymized patient record</CardDescription>
        </CardHeader>
        <CardContent className={styles.summaryGrid}>
          <div>
            <span className={styles.summaryLabel}>Category</span>
            <div className={styles.summaryValue}>
              {patient.category ? <Badge variant="primary">{patient.category}</Badge> : '—'}
            </div>
          </div>
          <div>
            <span className={styles.summaryLabel}>Primary staff</span>
            <div className={styles.summaryValue}>{careTeam}</div>
          </div>
          <div>
            <span className={styles.summaryLabel}>Assigned studies</span>
            <div className={styles.summaryValue}>{patient.assignedStudies?.length || 0}</div>
          </div>
          <div>
            <span className={styles.summaryLabel}>Pending tasks</span>
            <div className={styles.summaryValue}>
              {tasks.filter((task) => task.status === 'open').length}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Completed responses</CardTitle>
          <CardDescription>Structured responses submitted by assigned staff.</CardDescription>
        </CardHeader>
        <CardContent>
          {responsesQuery.isLoading ? (
            <div className={styles.emptyState}>Loading responses…</div>
          ) : responses.length === 0 ? (
            <div className={styles.emptyState}>No responses submitted yet.</div>
          ) : (
            <div className={styles.responseList}>
              {responses.map((response) => (
                <div key={response._id} className={styles.responseCard}>
                  <div className={styles.responseHeader}>
                    <div>
                      <h3>{response.formId?.schema?.title || response.formId?.version}</h3>
                      <span className={styles.responseMeta}>
                        Submitted {new Date(response.authoredAt).toLocaleString()} · Staff{' '}
                        {response.authoredBy?.displayName || response.authoredBy?.email || '—'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.responseBody}>
                    {Object.entries(response.answers || {}).map(([key, value]) => (
                      <div key={key} className={styles.answerRow}>
                        <span className={styles.answerLabel}>{key}</span>
                        <span className={styles.answerValue}>
                          {Array.isArray(value) ? value.join(', ') : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Task history</CardTitle>
          <CardDescription>All tasks linked to this patient across studies.</CardDescription>
        </CardHeader>
        <CardContent>
          {tasksQuery.isLoading ? (
            <div className={styles.emptyState}>Loading tasks…</div>
          ) : (
            <TaskTable
              tasks={tasks}
              showAssignee
              onSelectTask={(task) =>
                navigate(`/forms/${task.formId?._id || task.formId}?taskId=${task._id}&pid=${task.pid}`)
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Patient;
