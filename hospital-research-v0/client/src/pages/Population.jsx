import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import PopulationTable from '../components/PopulationTable';
import { useAuth } from '../lib/auth';
import styles from '../styles/PopulationPage.module.css';

const Population = () => {
  const { user } = useAuth();
  const canEdit = user.role !== 'staff';
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ text: '', category: '' });
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sortOption, setSortOption] = useState('pid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ pid: '', category: '', ownerId: '' });
  const [message, setMessage] = useState('');
  const [categories, setCategories] = useState([]);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [categoryModalMessage, setCategoryModalMessage] = useState('');

  const patientsQuery = useQuery({
    queryKey: ['patients'],
    queryFn: async () => {
      const response = await apiClient.get('/api/patients');
      return response.data.patients;
    },
  });

  const ownersQuery = useQuery({
    queryKey: ['populationOwners'],
    queryFn: async () => {
      const response = await apiClient.get('/api/users');
      return response.data.users;
    },
    enabled: canEdit,
  });

  const createPatient = useMutation({
    mutationFn: (payload) => apiClient.post('/api/patients', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setMessage('Patient created.');
      setCreateForm({ pid: '', category: '', ownerId: '' });
      setShowCreateModal(false);
    },
    onError: (err) => {
      setMessage(err.response?.data?.error || 'Unable to create patient.');
    },
  });

  const updatePatient = useMutation({
    mutationFn: ({ pid, payload }) => apiClient.patch(`/api/patients/${pid}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setMessage('Patient updated.');
    },
    onError: (err) => {
      setMessage(err.response?.data?.error || 'Unable to update patient.');
    },
  });

  const patients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const owners = useMemo(() => {
    const list = ownersQuery.data ?? [];
    return list
      .filter((user) => ['staff', 'researcher'].includes(user.role))
      .sort((a, b) => {
        const aLabel = (a.displayName || a.email).toLowerCase();
        const bLabel = (b.displayName || b.email).toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
  }, [ownersQuery.data]);

  useEffect(() => {
    setCategories((previous) => {
      const normalized = new Map(previous.map((category) => [category.toLowerCase(), category]));

      patients.forEach((patient) => {
        const value = (patient.category || '').trim();
        if (!value) return;
        const lower = value.toLowerCase();
        if (!normalized.has(lower)) {
          normalized.set(lower, value);
        }
      });

      const merged = Array.from(normalized.values()).sort((a, b) => a.localeCompare(b));
      const changed =
        merged.length !== previous.length || merged.some((category, index) => category !== previous[index]);

      return changed ? merged : previous;
    });
  }, [patients]);

  const patientStatus = (patient) =>
    patient.status || (patient.isActive === false ? 'inactive' : 'active');

  const filteredPatients = useMemo(() => {
    const query = filters.text.trim().toLowerCase();
    const categoryFilter = filters.category.trim().toLowerCase();

    return patients.filter((patient) => {
      if (categoryFilter) {
        if ((patient.category || '').toLowerCase() !== categoryFilter) {
          return false;
        }
      }

      if (!includeInactive && patientStatus(patient) === 'inactive') {
        return false;
      }

      if (!query) return true;

      const owner = patient.assignedStaff?.[0];
      const ownerLabel = (owner?.displayName || owner?.email || '').toLowerCase();
      const categoryLabel = (patient.category || '').toLowerCase();

      return (
        patient.pid.toLowerCase().includes(query) ||
        ownerLabel.includes(query) ||
        categoryLabel.includes(query)
      );
    });
  }, [patients, filters, includeInactive]);

  const savingPid = updatePatient.isLoading ? updatePatient.variables?.pid : null;

  const sortedPatients = useMemo(() => {
    const copy = [...filteredPatients];
    copy.sort((a, b) => {
      switch (sortOption) {
        case 'owner': {
          const ownerA =
            a.assignedStaff?.[0]?.displayName || a.assignedStaff?.[0]?.email || '';
          const ownerB =
            b.assignedStaff?.[0]?.displayName || b.assignedStaff?.[0]?.email || '';
          return ownerA.toLowerCase().localeCompare(ownerB.toLowerCase());
        }
        case 'category': {
          const catA = (a.category || '').toLowerCase();
          const catB = (b.category || '').toLowerCase();
          return catA.localeCompare(catB);
        }
        case 'status': {
          const statusPriority = { active: 0, inactive: 1 };
          const statusA = statusPriority[patientStatus(a)] ?? 2;
          const statusB = statusPriority[patientStatus(b)] ?? 2;
          if (statusA !== statusB) return statusA - statusB;
          return a.pid.localeCompare(b.pid);
        }
        case 'pid':
        default:
          return a.pid.localeCompare(b.pid);
      }
    });
    return copy;
  }, [filteredPatients, sortOption]);

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    if (!canEdit) return;
    setMessage('');
    createPatient.mutate({
      pid: createForm.pid.trim().toUpperCase(),
      category: createForm.category || undefined,
      assignedStaff: createForm.ownerId ? [createForm.ownerId] : undefined,
    });
  };

  const handleSavePatient = async (patient, draft) => {
    if (!canEdit) return;
    setMessage('');
    await updatePatient.mutateAsync({
      pid: patient.pid,
      payload: draft,
    });
  };

  const handleCategoryAdd = (value) => {
    if (!canEdit) {
      setCategoryModalMessage('');
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      setCategoryModalMessage('Enter a category name to add.');
      return;
    }

    setCategories((previous) => {
      const lower = trimmed.toLowerCase();
      if (previous.some((category) => category.toLowerCase() === lower)) {
        setCategoryModalMessage('That category already exists.');
        return previous;
      }
      const next = [...previous, trimmed].sort((a, b) => a.localeCompare(b));
      setCategoryModalMessage(`Added "${trimmed}".`);
      setCategoryDraft('');
      return next;
    });
  };

  const handleCategoryRemove = (category) => {
    if (!canEdit) {
      setCategoryModalMessage('');
      return;
    }
    const normalized = category.toLowerCase();
    const stillInUse = patients.some(
      (patient) => (patient.category || '').toLowerCase() === normalized
    );
    if (stillInUse) {
      setCategoryModalMessage('Remove this category from all patients before deleting it.');
      return;
    }
    setCategories((previous) => previous.filter((item) => item.toLowerCase() !== normalized));
    setCategoryModalMessage(`Removed "${category}".`);
  };

  const closeCategoriesModal = () => {
    setShowCategoriesModal(false);
    setCategoryDraft('');
    setCategoryModalMessage('');
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.banner}>
        <span className={styles.bannerDot} />
        <span>
          <strong>Important:</strong> do not use real patient names. Use pseudonymized IDs only.
        </span>
      </div>

      <header className={styles.header}>
        <div>
          <h1>Population management</h1>
          <p>
            {canEdit
              ? 'Maintain pseudonymized cohorts, staff assignments, and study enrolments.'
              : 'Review the patients and study assignments that relate to your work.'}
          </p>
        </div>
        {canEdit ? (
          <Button
            onClick={() => {
              setMessage('');
              setCreateForm({ pid: '', category: '', ownerId: '' });
              setShowCreateModal(true);
            }}
          >
            Register patient
          </Button>
        ) : (
          <div className={styles.readOnlyNote}>
            View-only access
          </div>
        )}
      </header>

      <Card>
        <CardHeader
          actions={
            canEdit ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCategoryModalMessage('');
                  setShowCategoriesModal(true);
                }}
              >
                Manage categories
              </Button>
            ) : null
          }
        >
          <CardTitle>Population roster ({patients.length})</CardTitle>
          <CardDescription>Search, filter, and update patient assignments.</CardDescription>
        </CardHeader>
        <CardContent className={styles.section}>
          <div className={styles.filters}>
            <label className={styles.filterItem}>
              <span>Search</span>
              <Input
                value={filters.text}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, text: event.target.value }))
                }
                placeholder="PID, owner, or category"
              />
            </label>
            <label className={styles.filterItem}>
              <span>Category</span>
              <select
                value={filters.category}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterItem}>
              <span>Sort by</span>
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value)}
              >
                <option value="pid">PID</option>
                <option value="owner">Owner</option>
                <option value="category">Category</option>
                <option value="status">Status</option>
              </select>
            </label>
            <label className={styles.filterToggle}>
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              <span>Show inactive patients</span>
            </label>
          </div>

          {canEdit && message ? <div className={styles.feedbackBanner}>{message}</div> : null}
          {!canEdit ? (
            <div className={styles.feedbackBanner}>
              View-only access. Changes must be requested from an administrator or researcher.
            </div>
          ) : null}

          {patientsQuery.isLoading ? (
            <div className={styles.emptyState}>Loading patients…</div>
          ) : filteredPatients.length === 0 ? (
            <div className={styles.emptyState}>No patients match the current filters.</div>
          ) : (
            <PopulationTable
              patients={sortedPatients}
              owners={owners}
              onSavePatient={canEdit ? handleSavePatient : undefined}
              savingPid={savingPid}
              categories={categories}
              readOnly={!canEdit}
            />
          )}
        </CardContent>
      </Card>

      {canEdit && showCreateModal ? (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Register patient profile</CardTitle>
                <CardDescription>Create a PID and assign an owner to manage tasks.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className={styles.modalForm} onSubmit={handleCreateSubmit}>
                  <label>
                    Pseudonym (PID)
                    <Input
                      value={createForm.pid}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          pid: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="PID-2025-001"
                      required
                    />
                  </label>
                  <label>
                    Category
                    <div className={styles.selectRow}>
                      <select
                        value={createForm.category}
                        onChange={(event) =>
                          setCreateForm((prev) => ({ ...prev, category: event.target.value }))
                        }
                      >
                        <option value="">No category</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setCategoryModalMessage('');
                          setShowCategoriesModal(true);
                        }}
                      >
                        Manage
                      </Button>
                    </div>
                  </label>
                  <label>
                    Owner
                    <select
                      value={createForm.ownerId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({ ...prev, ownerId: event.target.value }))
                      }
                    >
                      <option value="">Unassigned</option>
                      {owners.map((owner) => (
                        <option key={owner._id} value={owner._id}>
                          {owner.displayName || owner.email} ({owner.role})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.modalActions}>
                    <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createPatient.isLoading}>
                      {createPatient.isLoading ? 'Creating…' : 'Create patient'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {canEdit && showCategoriesModal ? (
        <div className={styles.modalBackdrop} onClick={closeCategoriesModal}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <Card>
              <CardHeader>
                <CardTitle>Manage categories</CardTitle>
                <CardDescription>Add or remove patient categories for quick assignments.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className={styles.teamModalForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCategoryAdd(categoryDraft);
                  }}
                >
                  <Input
                    value={categoryDraft}
                    onChange={(event) => setCategoryDraft(event.target.value)}
                    placeholder="Add a category name"
                  />
                  <Button type="submit" size="sm">
                    Add
                  </Button>
                </form>

                <div className={styles.teamList}>
                  {categories.length === 0 ? (
                    <span className={styles.teamEmpty}>No categories yet. Add your first category above.</span>
                  ) : (
                    categories.map((category) => (
                      <div key={category} className={styles.teamRow}>
                        <span className={styles.teamName}>{category}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={styles.teamRemove}
                          onClick={() => handleCategoryRemove(category)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {categoryModalMessage ? (
                  <div className={styles.teamModalMessage}>{categoryModalMessage}</div>
                ) : null}

                <div className={styles.modalActions}>
                  <Button type="button" variant="ghost" onClick={closeCategoriesModal}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Population;
