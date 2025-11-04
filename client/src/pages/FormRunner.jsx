import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import styles from '../styles/FormRunner.module.css';

const parseQuery = (search) => Object.fromEntries(new URLSearchParams(search));

const buildDefaultAnswers = (schema) => {
  if (!schema?.items?.length) {
    return {};
  }
  return schema.items.reduce((accumulator, item) => {
    if (item.type === 'dropdown') {
      accumulator[item.linkId] = item.options?.[0] || '';
    } else if (item.type === 'checkboxes') {
      accumulator[item.linkId] = [];
    } else if (item.type === 'scale') {
      accumulator[item.linkId] = item.scale?.min ?? 1;
    } else {
      accumulator[item.linkId] = '';
    }
    return accumulator;
  }, {});
};

const FormRunner = () => {
  const { formId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useMemo(() => parseQuery(location.search), [location.search]);

  const taskId = query.taskId;

  const taskQuery = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/tasks/${taskId}`);
      return response.data;
    },
    enabled: Boolean(taskId),
  });

  const formQuery = useQuery({
    queryKey: ['form', formId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/forms/${formId}`);
      return response.data.form;
    },
    enabled: !taskId,
  });

  const taskData = taskQuery.data?.task ?? null;
  const responseRecord = taskQuery.data?.response ?? null;
  const permissions = taskQuery.data?.permissions ?? null;
  const form = taskData?.formId || formQuery.data || null;
  const schema = form?.schema;

  const [answers, setAnswers] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const defaults = useMemo(() => buildDefaultAnswers(schema), [schema]);

  useEffect(() => {
    if (!schema) return;
    if (responseRecord?.answers) {
      setAnswers({ ...defaults, ...responseRecord.answers });
    } else {
      setAnswers(defaults);
    }
  }, [schema, responseRecord?.answers, defaults]);

  const canSubmit = Boolean(taskId && permissions?.canSubmit);
  const isEditable = canSubmit;
  const patientLabel = taskData?.pid || query.pid || 'Unknown';
  const submitLabel = responseRecord ? 'Update response' : 'Submit response';
  const lastSubmittedAt = responseRecord?.authoredAt ? new Date(responseRecord.authoredAt) : null;
  const lastSubmittedBy =
    responseRecord?.authoredBy?.displayName || responseRecord?.authoredBy?.email || null;
  const readOnlyMessage = taskId
    ? 'Read-only mode. Only the assigned owner or an administrator can modify this response.'
    : 'Read-only mode. Assign this form to a patient task to collect responses.';

  const formattedDue = taskData?.dueAt ? new Date(taskData.dueAt).toLocaleDateString() : '—';
  const statusText = taskData?.status ? taskData.status.replace(/^\w/, (c) => c.toUpperCase()) : '—';
  const assigneeLabel =
    taskData?.assignee?.displayName || taskData?.assignee?.email || taskData?.assignee?.role || '—';
  const studyLabel = taskData?.studyId?.title || '—';

  const metaEntries = [
    { label: 'Patient', value: patientLabel },
    { label: 'Study', value: studyLabel },
    { label: 'Due', value: formattedDue },
    { label: 'Status', value: statusText },
    { label: 'Assignee', value: assigneeLabel },
  ];

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) {
        throw new Error('Task is required to submit a response.');
      }
      return apiClient.post(`/api/tasks/${taskId}/submit`, { answers });
    },
    onSuccess: async () => {
      setErrorMessage('');
      setStatusMessage('Response saved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['patientTasks'], exact: false }),
        queryClient.invalidateQueries({ queryKey: ['patientResponses'], exact: false }),
      ]);
    },
    onError: (error) => {
      const message = error.response?.data?.error || 'Unable to save response.';
      setErrorMessage(message);
      setStatusMessage('');
    },
  });

  const onChange = (linkId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [linkId]: value,
    }));
  };

  const onCheckboxToggle = (linkId, option) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[linkId]) ? prev[linkId] : [];
      const exists = current.includes(option);
      const next = exists ? current.filter((entry) => entry !== option) : [...current, option];
      return { ...prev, [linkId]: next };
    });
  };

  const onSubmit = (event) => {
    event.preventDefault();
    if (!isEditable) return;
    submitMutation.mutate();
  };

  if (taskId && taskQuery.isLoading) {
    return <div className={styles.wrapper}>Loading task…</div>;
  }

  if (!taskId && formQuery.isLoading) {
    return <div className={styles.wrapper}>Loading form…</div>;
  }

  if (taskQuery.isError || formQuery.isError) {
    return <div className={styles.wrapper}>Unable to load form details.</div>;
  }

  if (!schema) {
    return <div className={styles.wrapper}>Form schema unavailable.</div>;
  }

  const visibleMetaEntries = metaEntries.filter((entry) => {
    if (entry.label === 'Patient') return Boolean(entry.value);
    return entry.value && entry.value !== '—';
  });

  const showMetaPanel = visibleMetaEntries.length > 0;

  return (
    <div className={styles.wrapper}>
      {taskId ? (
        <button
          type="button"
          className={styles.backLink}
          onClick={() => navigate('/tasks')}
        >
          ← Back to tasks
        </button>
      ) : null}

      <h1>{schema.title}</h1>

      <div className={styles.formShell}>
        <div className={styles.formMain}>
          {responseRecord ? (
            <div className={styles.responseMeta}>
              <strong>Last submitted</strong>
              <span>{lastSubmittedAt ? lastSubmittedAt.toLocaleString() : '—'}</span>
              {lastSubmittedBy ? <span>by {lastSubmittedBy}</span> : null}
            </div>
          ) : null}

          {statusMessage ? <div className={styles.notice}>{statusMessage}</div> : null}
          {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}
          {!isEditable ? <div className={styles.readOnlyNote}>{readOnlyMessage}</div> : null}

          <form className={styles.form} onSubmit={onSubmit}>
            {schema.items.map((item) => (
              <div key={item.linkId} className={styles.field}>
                <label htmlFor={item.linkId}>
                  {item.text}
                  {item.required ? ' *' : ''}
                </label>
                {item.type === 'dropdown' ? (
                  <select
                    id={item.linkId}
                    value={answers[item.linkId] ?? ''}
                    onChange={(event) => onChange(item.linkId, event.target.value)}
                    disabled={!isEditable}
                  >
                    <option value="">Select…</option>
                    {item.options?.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : item.type === 'checkboxes' ? (
                  <div className={styles.checkboxGroup}>
                    {item.options?.map((option) => (
                      <label key={option} className={styles.checkboxOption}>
                        <input
                          type="checkbox"
                          checked={(answers[item.linkId] || []).includes(option)}
                          onChange={() => onCheckboxToggle(item.linkId, option)}
                          disabled={!isEditable}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : item.type === 'scale' ? (
                  <div className={styles.scaleField}>
                    <input
                      id={item.linkId}
                      type="range"
                      min={item.scale?.min ?? 1}
                      max={item.scale?.max ?? 5}
                      step={item.scale?.step ?? 1}
                      value={answers[item.linkId] ?? item.scale?.min ?? 1}
                      onChange={(event) => onChange(item.linkId, Number(event.target.value))}
                      disabled={!isEditable}
                    />
                    <span>{answers[item.linkId]}</span>
                  </div>
                ) : (
                  <input
                    id={item.linkId}
                    type="text"
                    value={answers[item.linkId] ?? ''}
                    onChange={(event) => onChange(item.linkId, event.target.value)}
                    disabled={!isEditable}
                  />
                )}
              </div>
            ))}

            {isEditable ? (
              <button
                type="submit"
                className={styles.primary}
                disabled={submitMutation.isLoading}
              >
                {submitMutation.isLoading ? 'Saving…' : submitLabel}
              </button>
            ) : null}
          </form>
        </div>

        {showMetaPanel ? (
          <aside className={styles.metaPanel}>
            <h2>Task details</h2>
            <div className={styles.metaList}>
              {visibleMetaEntries.map((entry) => (
                <div key={entry.label} className={styles.metaItem}>
                  <span className={styles.metaLabel}>{entry.label}</span>
                  <span className={styles.metaValue}>{entry.value}</span>
                </div>
              ))}
              {responseRecord ? (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Last submitted</span>
                  <span className={styles.metaValue}>
                    {lastSubmittedAt ? lastSubmittedAt.toLocaleString() : '—'}
                    {lastSubmittedBy ? ` · ${lastSubmittedBy}` : ''}
                  </span>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
};

export default FormRunner;
