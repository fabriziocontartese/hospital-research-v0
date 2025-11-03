import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import styles from '../styles/StudiesPage.module.css';

const statusVariant = (status) => {
  switch (status) {
    case 'active':
      return 'success';
    case 'draft':
      return 'primary';
    case 'closed':
      return 'neutral';
    case 'paused':
      return 'warning';
    default:
      return 'neutral';
  }
};

const Studies = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [formState, setFormState] = useState({
    code: '',
    title: '',
    description: '',
  });

  const studiesQuery = useQuery({
    queryKey: ['studies'],
    queryFn: async () => {
      const response = await apiClient.get('/api/studies');
      return response.data.studies;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient
        .post('/api/studies', {
          code: formState.code,
          title: formState.title,
          description: formState.description,
          allowedVariables: [],
        })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      setShowCreate(false);
      setFormState({ code: '', title: '', description: '' });
    },
  });

  const studies = useMemo(() => studiesQuery.data ?? [], [studiesQuery.data]);

  const filteredStudies = useMemo(() => {
    return studies.filter((study) => {
      const matchesStatus = status === 'all' || study.status === status;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        study.title.toLowerCase().includes(query) ||
        (study.code || '').toLowerCase().includes(query) ||
        (study.description || '').toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [studies, search, status]);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Studies</h1>
          <p>
            {user.role === 'researcher'
              ? 'Create and manage your research protocols, track enrolment, and build study-specific forms.'
              : 'Review organisational studies, monitor assignments, and open detailed views.'}
          </p>
        </div>
        {(user.role === 'researcher' || user.role === 'admin') && (
          <Button onClick={() => setShowCreate(true)}>Create study</Button>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search by name or study code, and narrow by status.</CardDescription>
        </CardHeader>
        <CardContent className={styles.filters}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search studies…"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="closed">Closed</option>
          </select>
        </CardContent>
      </Card>

      {studiesQuery.isLoading ? (
        <div className={styles.emptyState}>Loading studies…</div>
      ) : filteredStudies.length === 0 ? (
        <div className={styles.emptyState}>
          No studies match your filters. {user.role === 'researcher' ? 'Create a new study to get started.' : ''}
        </div>
      ) : (
        <div className={styles.cards}>
          {filteredStudies.map((study) => {
            const primaryTeamMember = Array.isArray(study.assignedStaff) && study.assignedStaff.length
              ? study.assignedStaff[0]
              : null;
            const leadLabel =
              primaryTeamMember && typeof primaryTeamMember === 'object'
                ? primaryTeamMember.displayName || primaryTeamMember.email
                : primaryTeamMember || '—';

            const teamSize = Array.isArray(study.assignedStaff) ? study.assignedStaff.length : 0;
            const patientSize = Array.isArray(study.assignedPatients) ? study.assignedPatients.length : 0;

            return (
              <Card
                key={study._id}
                className={styles.studyCard}
                role="button"
                tabIndex={0}
                aria-label={`Open ${study.title}`}
                onClick={() => navigate(`/studies/${study._id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/studies/${study._id}`);
                  }
                }}
              >
                <CardHeader className={styles.studyCardHeader}>
                  <div className={styles.studyStatusRow}>
                    <Badge variant={statusVariant(study.status)}>{study.status}</Badge>
                    {study.code ? <span className={styles.studyCode}>{study.code}</span> : null}
                  </div>
                  <CardTitle className={styles.studyTitle}>{study.title}</CardTitle>
                  <CardDescription className={styles.studyDescription}>
                    {study.description || 'No description provided yet.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className={styles.studyCardBody}>
                  <div className={styles.studyMeta}>
                    <div>
                      <span className={styles.metaLabel}>Lead</span>
                      <span className={styles.metaValue}>{leadLabel}</span>
                    </div>
                    <div>
                      <span className={styles.metaLabel}>Team</span>
                      <span className={styles.metaValue}>{teamSize}</span>
                    </div>
                    <div>
                      <span className={styles.metaLabel}>Patients</span>
                      <span className={styles.metaValue}>{patientSize}</span>
                    </div>
                  </div>
                  <div className={styles.studyFooter}>
                    <span className={styles.studyFootnote}>Status · {study.status}</span>
                    <span className={styles.viewLink}>View study →</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate ? (
        <div className={styles.modalBackdrop} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Create new study</CardTitle>
                <CardDescription>Define a code and title to draft a new protocol.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className={styles.modalForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    createMutation.mutate();
                  }}
                >
                  <label>
                    Study code
                    <Input
                      value={formState.code}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, code: event.target.value }))
                      }
                      placeholder="RESP-2025-01"
                      required
                    />
                  </label>
                  <label>
                    Study title
                    <Input
                      value={formState.title}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, title: event.target.value }))
                      }
                      placeholder="Respiratory outcomes observational study"
                      required
                    />
                  </label>
                  <label>
                    Description (optional)
                    <Textarea
                      value={formState.description}
                      onChange={(event) =>
                        setFormState((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Summarise objectives, inclusion criteria, and timelines."
                    />
                  </label>
                  <div className={styles.modalActions}>
                    <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isLoading}>
                      {createMutation.isLoading ? 'Creating…' : 'Create study'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Studies;
