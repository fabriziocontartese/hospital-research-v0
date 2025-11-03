import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import styles from '../styles/FormRunner.module.css';

const parseQuery = (search) => Object.fromEntries(new URLSearchParams(search));

const FormRunner = () => {
  const { formId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useMemo(() => parseQuery(location.search), [location.search]);
  const { user } = useAuth();

  const [answers, setAnswers] = useState({});
  const [statusMessage, setStatusMessage] = useState('');

  const formQuery = useQuery({
    queryKey: ['form', formId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/forms/${formId}`);
      return response.data.form;
    },
  });

  const form = formQuery.data;
  const schema = form?.schema;
  const isStaff = user?.role === 'staff';
  const isEditable = isStaff && Boolean(query.taskId);

  useEffect(() => {
    if (!schema) return;
    const initial = {};
    schema.items.forEach((item) => {
      if (item.type === 'dropdown') {
        initial[item.linkId] = item.options?.[0] || '';
      } else if (item.type === 'checkboxes') {
        initial[item.linkId] = [];
      } else if (item.type === 'scale') {
        initial[item.linkId] = item.scale?.min ?? 1;
      } else {
        initial[item.linkId] = '';
      }
    });
    setAnswers(initial);
  }, [schema]);

  const submitMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/tasks/${query.taskId}/submit`, {
        answers,
      }),
    onSuccess: () => {
      setStatusMessage('Response submitted.');
      navigate('/tasks');
    },
    onError: (error) => {
      setStatusMessage(error.response?.data?.error || 'Unable to submit response.');
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

  if (formQuery.isLoading) {
    return <div className={styles.wrapper}>Loading form…</div>;
  }

  if (formQuery.isError) {
    return <div className={styles.wrapper}>Unable to load form.</div>;
  }

  if (!schema) {
    return <div className={styles.wrapper}>Form schema unavailable.</div>;
  }

  return (
    <div className={styles.wrapper}>
      <h1>{schema.title}</h1>
      <p>
        {isEditable
          ? `Patient: ${query.pid || 'Unknown'}`
          : 'Read-only view. Staff complete via the tasks workspace.'}
      </p>

      {statusMessage ? <div className={styles.notice}>{statusMessage}</div> : null}

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
          <button type="submit" className={styles.primary} disabled={submitMutation.isLoading}>
            {submitMutation.isLoading ? 'Submitting…' : 'Submit response'}
          </button>
        ) : null}
      </form>
    </div>
  );
};

export default FormRunner;
