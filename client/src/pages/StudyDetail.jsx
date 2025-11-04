import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import FormBuilder from '../components/FormBuilder';
import styles from '../styles/StudyDetailPage.module.css';

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'closed', label: 'Closed' },
];

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const StudyDetail = () => {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [showBuilder, setShowBuilder] = useState(false);
  const [showEditMeta, setShowEditMeta] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState('');
  const [updatedDescription, setUpdatedDescription] = useState('');
  const [updatedStatus, setUpdatedStatus] = useState('draft');
  const [deleteError, setDeleteError] = useState('');

  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerSelection, setOwnerSelection] = useState(() => new Set());
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSelection, setPatientSelection] = useState(() => new Set());

  const [formViewer, setFormViewer] = useState(null);

  const studiesQuery = useQuery({
    queryKey: ['studies'],
    queryFn: async () => {
      const response = await apiClient.get('/api/studies');
      return response.data.studies;
    },
  });

  const study = useMemo(
    () => studiesQuery.data?.find((item) => item._id === studyId) || null,
    [studiesQuery.data, studyId]
  );

  const formsQuery = useQuery({
    queryKey: ['studyForms', studyId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/studies/${studyId}/forms`);
      return response.data.forms;
    },
    enabled: Boolean(studyId),
  });

  const ownersQuery = useQuery({
    queryKey: ['users', 'study-owners'],
    queryFn: async () => {
      const [staffResponse, researcherResponse] = await Promise.all([
        apiClient.get('/api/users', { params: { role: 'staff' } }),
        apiClient.get('/api/users', { params: { role: 'researcher' } }),
      ]);
      const merged = new Map();
      [...staffResponse.data.users, ...researcherResponse.data.users].forEach((userItem) => {
        const id = userItem._id || userItem.id;
        if (!id) return;
        merged.set(id.toString(), userItem);
      });
      return Array.from(merged.values()).filter((userItem) => userItem.isActive !== false);
    },
  });

  const patientsQuery = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const response = await apiClient.get('/api/patients');
      return response.data.patients;
    },
    enabled: user.role !== 'staff',
  });

  const responsesQuery = useQuery({
    queryKey: ['studyResponses', studyId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/studies/${studyId}/responses`);
      return response.data.responses;
    },
    enabled: Boolean(studyId),
  });

  const updateStudyMutation = useMutation({
    mutationFn: (payload) => apiClient.patch(`/api/studies/${studyId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
    },
  });

  const createFormMutation = useMutation({
    mutationFn: (schema) =>
      apiClient
        .post(`/api/studies/${studyId}/forms`, {
          kind: 'study',
          version: schema.version,
          schema,
        })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyForms', studyId] });
      setShowBuilder(false);
    },
  });

  const updateFormMutation = useMutation({
    mutationFn: ({ formId, payload }) =>
      apiClient.patch(`/api/studies/${studyId}/forms/${formId}`, payload).then((res) => res.data),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['studyForms', studyId] }),
        queryClient.invalidateQueries({ queryKey: ['studyResponses', studyId] }),
      ]);
      setFormViewer((prev) =>
        prev
          ? {
              ...prev,
              form: data?.form || prev.form,
              mode: 'preview',
            }
          : prev
      );
    },
  });

  const deleteStudyMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/studies/${studyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studies'] });
      queryClient.removeQueries({ queryKey: ['studyForms', studyId] });
      queryClient.removeQueries({ queryKey: ['studyResponses', studyId] });
      navigate('/studies');
    },
    onError: (err) => {
      setDeleteError(err.response?.data?.error || 'Unable to delete study.');
    },
  });

  const canEdit = useMemo(
    () => ['admin', 'researcher'].includes(user.role),
    [user.role]
  );

  const forms = useMemo(() => formsQuery.data ?? [], [formsQuery.data]);
  const owners = useMemo(() => ownersQuery.data ?? [], [ownersQuery.data]);
  const patients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const activePatients = useMemo(
    () =>
      patients.filter(
        (patient) => (patient.status || (patient.isActive === false ? 'inactive' : 'active')) !== 'inactive'
      ),
    [patients]
  );
  const responses = useMemo(() => responsesQuery.data ?? [], [responsesQuery.data]);

  const toId = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      return value._id || value.id || '';
    }
    return '';
  };

  const ownerPatientsMap = useMemo(() => {
    const map = new Map();
    activePatients.forEach((patient) => {
      (patient.assignedStaff || []).forEach((member) => {
        const ownerId = toId(member);
        if (!ownerId) return;
        const key = ownerId.toString();
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(patient.pid);
      });
    });
    return map;
  }, [activePatients]);

  const patientOwnersMap = useMemo(() => {
    const map = new Map();
    activePatients.forEach((patient) => {
      const ownerSet = new Set();
      (patient.assignedStaff || []).forEach((member) => {
        const ownerId = toId(member);
        if (ownerId) {
          ownerSet.add(ownerId.toString());
        }
      });
      map.set(patient.pid, ownerSet);
    });
    return map;
  }, [activePatients]);

  const allOwners = useMemo(() => {
    const map = new Map();
    owners.forEach((ownerItem) => {
      const ownerId = toId(ownerItem);
      if (!ownerId) return;
      map.set(ownerId.toString(), ownerItem);
    });
    (study?.assignedStaff || []).forEach((member) => {
      const ownerId = toId(member);
      if (!ownerId) return;
      const key = ownerId.toString();
      if (!map.has(key)) {
        map.set(key, {
          _id: ownerId,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const labelA = (a.displayName || a.email || '').toLowerCase();
      const labelB = (b.displayName || b.email || '').toLowerCase();
      return labelA.localeCompare(labelB);
    });
  }, [owners, study]);

  const enrolledPatients = useMemo(() => {
    if (!study?.assignedPatients?.length || !patients.length) return [];
    return patients.filter((patient) => study.assignedPatients.includes(patient.pid));
  }, [patients, study]);

  const answerEntries = (answers) => {
    if (Array.isArray(answers)) {
      return answers.map((value, index) => [`Item ${index + 1}`, value]);
    }
    if (answers && typeof answers === 'object') {
      return Object.entries(answers);
    }
    if (answers === null || answers === undefined) {
      return [];
    }
    return [['Response', answers]];
  };

  const formatAnswerValue = (value) => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return value ?? '';
  };

  const handleDeleteStudy = () => {
    if (!canEdit || deleteStudyMutation.isLoading) return;
    const confirmed = window.confirm(
      'Delete this study? All associated forms, tasks, and responses will be removed.'
    );
    if (!confirmed) return;
    setDeleteError('');
    deleteStudyMutation.mutate();
  };

  const handleExportResponses = () => {
    if (!responses.length || !study) return;
    const headers = ['Study', 'Form', 'Patient', 'Submitted At', 'Submitted By', 'Answers'];
    const rows = responses.map((response) => {
      const formTitle =
        response.formId?.schema?.title || response.formId?.version || 'Form';
      const submittedAt = response.authoredAt || response.createdAt;
      const submittedBy =
        response.authoredBy?.displayName || response.authoredBy?.email || '';
      const answersText = JSON.stringify(response.answers ?? {});
      return [
        study.code || study.title,
        formTitle,
        response.pid,
        submittedAt ? new Date(submittedAt).toISOString() : '',
        submittedBy,
        answersText,
      ];
    });

    const csvLines = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = cell == null ? '' : String(cell);
            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csvLines], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `${(study.code || study.title || 'study').replace(/\s+/g, '-').toLowerCase()}-responses.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUpdateMeta = () => {
    updateStudyMutation.mutate({
      title: updatedTitle || study.title,
      status: updatedStatus,
      description: updatedDescription,
    });
    setShowEditMeta(false);
  };

  const handleUpdateAssignments = async (payload) => {
    await updateStudyMutation.mutateAsync(payload);
  };

  const openAssignmentModal = () => {
    if (!study) return;
    const initialOwners = new Set(
      (study.assignedStaff || [])
        .map((member) => toId(member))
        .filter(Boolean)
        .map((ownerId) => ownerId.toString())
    );
    const activePatientIds = new Set(activePatients.map((patient) => patient.pid));
    const initialPatients = new Set(
      (study.assignedPatients || []).filter((pid) => activePatientIds.has(pid))
    );
    initialOwners.forEach((ownerId) => {
      const patientsForOwner = ownerPatientsMap.get(ownerId) || new Set();
      patientsForOwner.forEach((pid) => initialPatients.add(pid));
    });
    setOwnerSelection(initialOwners);
    setPatientSelection(initialPatients);
    setOwnerSearch('');
    setPatientSearch('');
    setShowAssignmentModal(true);
  };

  const handleOwnerToggle = (ownerId, checked) => {
    const normalizedId = ownerId.toString();
    setOwnerSelection((previousOwners) => {
      const nextOwners = new Set(previousOwners);
      if (checked) {
        nextOwners.add(normalizedId);
      } else {
        nextOwners.delete(normalizedId);
      }

      setPatientSelection((previousPatients) => {
        const nextPatients = new Set(previousPatients);
        const patientsForOwner = ownerPatientsMap.get(normalizedId) || new Set();
        if (checked) {
          patientsForOwner.forEach((pid) => nextPatients.add(pid));
        } else {
          patientsForOwner.forEach((pid) => {
            const ownersForPatient = patientOwnersMap.get(pid) || new Set();
            const stillSelected = Array.from(ownersForPatient).some((otherOwnerId) =>
              otherOwnerId !== normalizedId && nextOwners.has(otherOwnerId)
            );
            if (!stillSelected) {
              nextPatients.delete(pid);
            }
          });
        }
        return nextPatients;
      });

      return nextOwners;
    });
  };

  const handlePatientToggle = (pid, checked) => {
    setPatientSelection((previousPatients) => {
      const nextPatients = new Set(previousPatients);
      if (checked) {
        nextPatients.add(pid);
      } else {
        nextPatients.delete(pid);
      }
      return nextPatients;
    });
  };

  const handleAssignmentSave = async () => {
    try {
      await handleUpdateAssignments({
        assignedStaff: Array.from(ownerSelection),
        assignedPatients: Array.from(patientSelection),
      });
      setShowAssignmentModal(false);
    } catch (error) {
      // leave modal open; error surfaced via mutation handling
    }
  };

  const openFormViewer = (form) => {
    setFormViewer({ form, mode: 'preview' });
  };

  const closeFormViewer = () => setFormViewer(null);

  const setFormViewerMode = (mode) => {
    setFormViewer((prev) => (prev ? { ...prev, mode } : prev));
  };

  const formResponsesForActive = useMemo(() => {
    if (!formViewer?.form) return [];
    return responses.filter((response) => {
      const formId = response.formId?._id || response.formId;
      return formId?.toString() === formViewer.form._id?.toString();
    });
  }, [formViewer, responses]);

  if (!studyId) {
    return null;
  }

  if (studiesQuery.isLoading) {
    return <div className={styles.loading}>Loading study…</div>;
  }

  if (!study) {
    return (
      <div className={styles.loading}>
        Study not found.
        <Button variant="ghost" onClick={() => navigate('/studies')}>
          Back to studies
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Button variant="ghost" className={styles.backButton} onClick={() => navigate('/studies')}>
        ← Back to studies
      </Button>

      <Card>
        <CardHeader
          actions={
            canEdit ? (
              <div className={styles.headerActionGroup}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportResponses}
                  disabled={!responses.length}
                >
                  Export results
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.deleteButton}
                  onClick={handleDeleteStudy}
                  disabled={deleteStudyMutation.isLoading}
                >
                  {deleteStudyMutation.isLoading ? 'Deleting…' : 'Delete study'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUpdatedTitle(study.title);
                    setUpdatedDescription(study.description || '');
                    setUpdatedStatus(study.status);
                    setShowEditMeta(true);
                  }}
                >
                  Edit details
                </Button>
              </div>
            ) : null
          }
        >
          <div className={styles.studyHeader}>
            <div>
              <CardTitle>{study.title}</CardTitle>
              <CardDescription>{study.description || 'No description provided.'}</CardDescription>
            </div>
            <Badge
              variant={{ draft: 'neutral', active: 'success', paused: 'warning', closed: 'neutral' }[study.status] || 'neutral'}
            >
              {study.status}
            </Badge>
          </div>
          <div className={styles.studyMeta}>
            <div>
              <span className={styles.metaLabel}>Study code</span>
              <span className={styles.metaValue}>{study.code}</span>
            </div>
            <div>
              <span className={styles.metaLabel}>Care team members</span>
              <span className={styles.metaValue}>{study.assignedStaff?.length || 0}</span>
            </div>
            <div>
              <span className={styles.metaLabel}>Enrolled patients</span>
              <span className={styles.metaValue}>{study.assignedPatients?.length || 0}</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {deleteError ? <div className={styles.errorBanner}>{deleteError}</div> : null}

      <section className={styles.panels}>
        <Card>
          <CardHeader>
            <CardTitle>Study forms</CardTitle>
            <CardDescription>Build questionnaires that staff complete as part of this protocol.</CardDescription>
          </CardHeader>
          <CardContent>
              {formsQuery.isLoading ? (
                <div className={styles.emptyState}>Loading forms…</div>
              ) : forms.length === 0 ? (
                <div className={styles.emptyState}>No forms yet. Create the baseline questionnaire to begin.</div>
              ) : (
                <div className={styles.formsList}>
                  {forms.map((form) => (
                    <div key={form._id} className={styles.formRow}>
                      <div>
                        <h4>{form.schema?.title || form.version}</h4>
                        <p>{form.schema?.items?.length || 0} questions · Deadline {form.version || '—'}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openFormViewer(form)}
                      >
                        Details
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            {canEdit ? (
              <Button className={styles.createButton} variant="secondary" onClick={() => setShowBuilder(true)}>
                Create form
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <div className={styles.sideColumn}>
          <Card>
            <CardHeader
              actions={
                canEdit ? (
                  <Button size="sm" variant="outline" onClick={openAssignmentModal}>
                    Manage participants
                  </Button>
                ) : null
              }
            >
              <CardTitle>Participants</CardTitle>
              <CardDescription>Research owners and enrolled patients in this study.</CardDescription>
            </CardHeader>
            <CardContent className={styles.participantsCard}>
              <div className={styles.participantSection}>
                <span className={styles.sectionHeading}>Owners</span>
                {study.assignedStaff?.length ? (
                  <div className={styles.listPills}>
                    {study.assignedStaff.map((member) => {
                      const ownerId = toId(member);
                      const label = member.displayName || member.email || ownerId || 'Owner';
                      return (
                        <Badge key={ownerId || label} variant="primary">
                          {label}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <span className={styles.participantEmpty}>No owners assigned yet.</span>
                )}
              </div>

              <div className={styles.participantSection}>
                <span className={styles.sectionHeading}>Patients</span>
                {enrolledPatients.length === 0 ? (
                  <span className={styles.participantEmpty}>No patients enrolled yet.</span>
                ) : (
                  <div className={styles.listPills}>
                    {enrolledPatients.map((patient) => (
                      <Badge key={patient.pid} variant="neutral">
                        {patient.pid}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {showBuilder ? (
        <div className={styles.modalBackdrop} onClick={() => setShowBuilder(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Create study form</CardTitle>
                <CardDescription>Configure questions that align with your protocol objectives.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormBuilder
                  onSave={(form) =>
                    createFormMutation.mutate({
                      id: form.id,
                      title: form.title,
                      version: form.version,
                      items: form.items,
                    })
                  }
                  onCancel={() => setShowBuilder(false)}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {showEditMeta ? (
        <div className={styles.modalBackdrop} onClick={() => setShowEditMeta(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Edit study details</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className={styles.modalForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleUpdateMeta();
                  }}
                >
                  <label>
                    Title
                    <Input
                      value={updatedTitle}
                      onChange={(event) => setUpdatedTitle(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Description
                    <Textarea
                      value={updatedDescription}
                      onChange={(event) => setUpdatedDescription(event.target.value)}
                      placeholder="Optional summary"
                    />
                  </label>
                  <label>
                    Status
                    <select
                      value={updatedStatus}
                      onChange={(event) => setUpdatedStatus(event.target.value)}
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.modalActions}>
                    <Button type="button" variant="ghost" onClick={() => setShowEditMeta(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateStudyMutation.isLoading}>
                      Save changes
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {showAssignmentModal ? (
        <div className={styles.modalBackdrop} onClick={() => setShowAssignmentModal(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Manage owners & patients</CardTitle>
                <CardDescription>Select owners to auto-enrol their patients, or refine manually.</CardDescription>
              </CardHeader>
              <CardContent className={styles.assignmentModal}>
                <div className={styles.assignmentColumn}>
                  <div className={styles.assignmentHeading}>Owners</div>
                  <Input
                    value={ownerSearch}
                    onChange={(event) => setOwnerSearch(event.target.value)}
                    placeholder="Search owners"
                  />
                  <div className={styles.selectionList}>
                    {allOwners.length ? (
                      allOwners
                        .filter((owner) => {
                          const label = (owner.displayName || owner.email || '').toLowerCase();
                          return label.includes(ownerSearch.trim().toLowerCase());
                        })
                        .map((owner) => {
                          const ownerId = toId(owner).toString();
                          const label = owner.displayName || owner.email || ownerId;
                          const managedCount = ownerPatientsMap.get(ownerId)?.size || 0;
                          return (
                            <label key={ownerId} className={styles.selectionItem}>
                              <input
                                type="checkbox"
                                checked={ownerSelection.has(ownerId)}
                                onChange={(event) => handleOwnerToggle(ownerId, event.target.checked)}
                              />
                              <span>{label}</span>
                              <span className={styles.selectionMeta}>{managedCount} patients</span>
                            </label>
                          );
                        })
                    ) : (
                      <span className={styles.selectionEmpty}>No owners available.</span>
                    )}
                  </div>
                </div>
                <div className={styles.assignmentColumn}>
                  <div className={styles.assignmentHeading}>Patients</div>
                  <Input
                    value={patientSearch}
                    onChange={(event) => setPatientSearch(event.target.value)}
                    placeholder="Search patients"
                  />
                  <div className={styles.selectionList}>
                    {activePatients.length ? (
                      activePatients
                        .filter((patient) => {
                          const query = patientSearch.trim().toLowerCase();
                          if (!query) return true;
                          return (
                            patient.pid.toLowerCase().includes(query) ||
                            (patient.category || '').toLowerCase().includes(query)
                          );
                        })
                        .map((patient) => (
                          <label key={patient._id} className={styles.selectionItem}>
                            <input
                              type="checkbox"
                              checked={patientSelection.has(patient.pid)}
                              onChange={(event) => handlePatientToggle(patient.pid, event.target.checked)}
                            />
                            <span className={styles.selectionLabel}>
                              {patient.pid}
                              {patient.category ? ` · ${patient.category}` : ''}
                            </span>
                          </label>
                        ))
                    ) : (
                      <span className={styles.selectionEmpty}>No patients available.</span>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardContent className={styles.modalActions}>
                <Button type="button" variant="ghost" onClick={() => setShowAssignmentModal(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAssignmentSave}
                  disabled={updateStudyMutation.isLoading}
                >
                  Save changes
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {formViewer ? (
        <div className={styles.modalBackdrop} onClick={closeFormViewer}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader
                actions={
                  canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setFormViewerMode(formViewer.mode === 'edit' ? 'preview' : 'edit')
                      }
                    >
                      {formViewer.mode === 'edit' ? 'Done editing' : 'Edit form'}
                    </Button>
                  ) : null
                }
              >
                <CardTitle>{formViewer.form.schema?.title || formViewer.form.version}</CardTitle>
                <CardDescription>Inspect form details or review submissions.</CardDescription>
              </CardHeader>
              <CardContent className={styles.formViewerTabs}>
                <div className={styles.formViewerActions}>
                  <Button
                    variant={formViewer.mode === 'preview' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setFormViewerMode('preview')}
                  >
                    Preview
                  </Button>
                  <Button
                    variant={formViewer.mode === 'results' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setFormViewerMode('results')}
                  >
                    Results
                  </Button>
                </div>

                {formViewer.mode === 'preview' ? (
                  <div className={styles.formPreview}>
                    <div className={styles.formPreviewMeta}>
                      <span>Deadline {formViewer.form.version || '—'}</span>
                      <span>{formViewer.form.schema?.items?.length || 0} questions</span>
                    </div>
                    <ol className={styles.previewList}>
                      {(formViewer.form.schema?.items || []).map((item) => (
                        <li key={item.linkId}>
                          <strong>{item.text}</strong>
                          <span className={styles.previewMeta}>
                            {item.type}
                            {item.required ? ' · required' : ''}
                          </span>
                          {item.options?.length ? (
                            <ul className={styles.choicePreview}>
                              {item.options.map((option) => (
                                <li key={option}>{option}</li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {formViewer.mode === 'results' ? (
                  responsesQuery.isLoading ? (
                    <div className={styles.emptyState}>Loading responses…</div>
                  ) : formResponsesForActive.length === 0 ? (
                    <div className={styles.emptyState}>No responses recorded yet.</div>
                  ) : (
                    <div className={styles.resultsTableWrapper}>
                      <table className={styles.resultsTable}>
                        <thead>
                          <tr>
                            <th>Patient</th>
                            <th>Submitted</th>
                            <th>Submitted by</th>
                            <th>Answers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formResponsesForActive.map((response) => {
                            const entries = answerEntries(response.answers);
                            return (
                              <tr key={response._id}>
                                <td className={styles.mono}>{response.pid}</td>
                                <td>{formatDateTime(response.authoredAt || response.createdAt)}</td>
                                <td>
                                  {response.authoredBy?.displayName ||
                                    response.authoredBy?.email ||
                                    '—'}
                                </td>
                                <td>
                                  <div className={styles.answersPreview}>
                                    {entries.length ? (
                                      entries.map(([key, value]) => (
                                        <div key={key} className={styles.answerRow}>
                                          <span className={styles.answerKey}>{key}</span>
                                          <span className={styles.answerValue}>
                                            {formatAnswerValue(value)}
                                          </span>
                                        </div>
                                      ))
                                    ) : (
                                      <span className={styles.answerValue}>—</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}

                {formViewer.mode === 'edit' && canEdit ? (
                  <FormBuilder
                    initialSchema={formViewer.form.schema}
                    submitLabel={updateFormMutation.isLoading ? 'Saving…' : 'Save form'}
                    onSave={(schema) =>
                      updateFormMutation.mutate({
                        formId: formViewer.form._id,
                        payload: { version: schema.version, schema },
                      })
                    }
                    onCancel={() => setFormViewerMode('preview')}
                  />
                ) : null}
              </CardContent>
              <CardContent className={styles.modalActions}>
                <Button type="button" variant="ghost" onClick={closeFormViewer}>
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

export default StudyDetail;
