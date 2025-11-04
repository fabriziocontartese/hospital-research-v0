import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import styles from '../styles/PlatformOrganizations.module.css';

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

const statusLabelClass = {
  approved: styles.statusApproved,
  pending: styles.statusPending,
  rejected: styles.statusRejected,
  suspended: styles.statusSuspended,
};

const statusLabel = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

const toEditState = (org) =>
  org
    ? {
        name: org.name || '',
        country: org.country || '',
        contactEmail: org.contactEmail || '',
        message: org.message || '',
        status: org.status || 'pending',
        isActive: Boolean(org.isActive),
      }
    : null;

const initialCreateState = {
  name: '',
  country: '',
  contactEmail: '',
  status: 'pending',
  message: '',
  createAdmin: true,
  adminEmail: '',
  adminDisplayName: '',
  adminPassword: '', // Added password field
};

const initialAdminState = {
  email: '',
  displayName: '',
  activateOrg: false,
};

const PlatformOrganizations = () => {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [banner, setBanner] = useState(null);
  const [createState, setCreateState] = useState(initialCreateState);
  const [adminDraft, setAdminDraft] = useState(initialAdminState);
  const [adminFeedback, setAdminFeedback] = useState('');
  const [adminError, setAdminError] = useState('');
  const [editState, setEditState] = useState(null);
  const [manageFeedback, setManageFeedback] = useState('');
  const [manageError, setManageError] = useState('');
  const [showManageModal, setShowManageModal] = useState(false);
  const [manageOrgId, setManageOrgId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filters = useMemo(() => {
    const params = {};
    if (statusFilter !== 'all') params.status = statusFilter;
    if (activeFilter !== 'all') params.isActive = activeFilter === 'active';
    if (search.trim()) params.search = search.trim();
    return params;
  }, [statusFilter, activeFilter, search]);

  const orgsQuery = useQuery({
    queryKey: ['superadmin', 'orgs', filters],
    queryFn: async () => {
      const response = await apiClient.get('/api/superadmin/orgs', { params: filters });
      return response.data.organizations;
    },
  });

  const adminQueryKey = useMemo(
    () => ['superadmin', 'admins', { orgId: manageOrgId || null }],
    [manageOrgId]
  );
  const adminsQuery = useQuery({
    queryKey: adminQueryKey,
    queryFn: async () => {
      if (!manageOrgId) return [];
      const response = await apiClient.get('/api/superadmin/admins', {
        params: { orgId: manageOrgId },
      });
      return response.data.admins;
    },
    enabled: showManageModal && Boolean(manageOrgId),
  });

  const organizations = useMemo(() => orgsQuery.data ?? [], [orgsQuery.data]);
  const manageOrg = useMemo(
    () => organizations.find((org) => org.id === manageOrgId) || null,
    [organizations, manageOrgId]
  );
  const modalOrgSummary = manageOrgId
    ? manageOrg || {
        id: manageOrgId,
        name: editState?.name || '',
        country: editState?.country || '',
        contactEmail: editState?.contactEmail || '',
        isActive: Boolean(editState?.isActive),
      }
    : null;
  const manageAdmins = useMemo(() => adminsQuery.data ?? [], [adminsQuery.data]);

useEffect(() => {
  if (!manageOrgId) {
    setEditState(null);
    return;
  }
  if (manageOrg) {
    setEditState(toEditState(manageOrg));
  }
}, [manageOrgId, manageOrg]);

  const createMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/superadmin/orgs', payload).then((res) => res.data),
    onSuccess: (data) => {
      const creationMessage = data.admin?.tempPassword
        ? `Organization created. Temporary admin password: ${data.admin.tempPassword}`
        : 'Organization created successfully.';
      setBanner({ type: 'success', message: creationMessage });
      setCreateState(initialCreateState);
      setShowCreateModal(false);
      resetManageState();
      setManageOrgId(data.organization.id);
      setEditState(toEditState(data.organization));
      setManageFeedback(creationMessage);
      setShowManageModal(true);
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
    },
    onError: (err) => {
      setBanner({
        type: 'error',
        message: err.response?.data?.error || 'Unable to create organization.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) =>
      apiClient.patch(`/api/superadmin/orgs/${id}`, payload).then((res) => res.data),
    onSuccess: (data) => {
      setManageFeedback('Organization updated.');
      setManageError('');
      setEditState(toEditState(data.organization));
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'admins'] });
    },
    onError: (err) => {
      setManageFeedback('');
      setManageError(err.response?.data?.error || 'Unable to update organization.');
    },
  });

  const adminCreateMutation = useMutation({
    mutationFn: ({ orgId, payload }) =>
      apiClient.post(`/api/superadmin/orgs/${orgId}/admins`, payload).then((res) => res.data),
    onSuccess: (data) => {
      setAdminFeedback(
        data.admin?.tempPassword
          ? `Admin created. Temporary password: ${data.admin.tempPassword}`
          : 'Admin created.'
      );
      setAdminError('');
      setAdminDraft(initialAdminState);
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'admins'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
    },
    onError: (err) => {
      setAdminFeedback('');
      setAdminError(err.response?.data?.error || 'Unable to create admin.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (orgId) =>
      apiClient.delete(`/api/superadmin/orgs/${orgId}`).then((res) => res.data),
    onSuccess: () => {
      setDeleteError('');
      setShowManageModal(false);
      setManageOrgId(null);
      resetManageState();
      setBanner({ type: 'success', message: 'Organization deleted.' });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'orgs'] });
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'admins'] });
    },
    onError: (err) => {
      setDeleteError(err.response?.data?.error || 'Unable to delete organization.');
    },
  });

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    const payload = {
      name: createState.name.trim(),
      country: createState.country.trim(),
      contactEmail: createState.contactEmail.trim(),
      status: createState.status,
      message: createState.message.trim() ? createState.message.trim() : undefined,
      isActive: createState.status === 'approved',
    };

    if (createState.createAdmin) {
      payload.admin = {
        email: createState.adminEmail.trim(),
        displayName: createState.adminDisplayName.trim(),
        password: createState.adminPassword.trim(), // Include password in payload
      };
    }

    createMutation.mutate(payload);
  };

  const resetManageState = () => {
    setAdminDraft(initialAdminState);
    setAdminFeedback('');
    setAdminError('');
    setManageFeedback('');
    setManageError('');
    setDeleteConfirm(false);
    setDeleteError('');
    setEditState(null);
  };

  const openManageModal = (orgId) => {
    resetManageState();
    const targetOrg = organizations.find((org) => org.id === orgId);
    if (targetOrg) {
      setEditState(toEditState(targetOrg));
    }
    setManageOrgId(orgId);
    setShowManageModal(true);
  };

  const closeManageModal = () => {
    setShowManageModal(false);
    setManageOrgId(null);
    resetManageState();
  };

  const openCreateModal = () => {
    setCreateState(initialCreateState);
    setBanner(null);
    setShowCreateModal(true);
  };

  const handleModalAdminSubmit = (event) => {
    event.preventDefault();
    if (!manageOrgId) return;
    adminCreateMutation.mutate({
      orgId: manageOrgId,
      payload: {
        email: adminDraft.email.trim(),
        displayName: adminDraft.displayName.trim(),
        activateOrg: adminDraft.activateOrg || undefined,
      },
    });
  };

  const handleEditSubmit = (event) => {
    event.preventDefault();
    if (!manageOrgId || !editState) return;
    const payload = {
      name: editState.name.trim(),
      country: editState.country.trim(),
      contactEmail: editState.contactEmail.trim(),
      status: editState.status,
      message: editState.message.trim(),
      isActive: editState.isActive,
    };
    if (!payload.message) {
      delete payload.message;
    }
    updateMutation.mutate({ id: manageOrgId, payload });
  };

  const quickUpdate = (next) => {
    if (!manageOrgId) return;
    updateMutation.mutate({ id: manageOrgId, payload: next });
  };

  const formatDate = (value) => {
    if (!value) return '—';

    try {
      return new Date(value).toLocaleString();
    } catch (ex) {
      return value;
    }
  };

  return (
    <>
      <div className={styles.page}>
        <div className={styles.headerRow}>
          <div>
            <h1>Platform Organizations</h1>
            <p className={styles.muted}>
              Approve hospitals, manage contact details, and control access for every organization.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Button variant="primary" onClick={openCreateModal}>
              New Organization
            </Button>
          </div>
        </div>

        {banner ? (
          <div
            className={
              banner.type === 'error' ? styles.errorBanner : styles.feedbackBanner
            }
          >
            {banner.message}
          </div>
        ) : null}

        <Card>
          <CardHeader
            actions={
              <Button variant="ghost" onClick={() => orgsQuery.refetch()} disabled={orgsQuery.isFetching}>
                Refresh
              </Button>
            }
          >
            <CardTitle>Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.filters}>
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.target.value)}
              >
                <option value="all">All states</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {orgsQuery.isLoading ? (
              <div className={styles.emptyState}>Loading organizations…</div>
            ) : organizations.length === 0 ? (
              <div className={styles.emptyState}>No organizations match the current filters.</div>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Active</th>
                    <th>Updated</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.id}>
                      <td>
                        <strong>{org.name}</strong>
                        <div className={styles.muted}>{org.country}</div>
                      </td>
                      <td>
                        <div>{org.contactEmail}</div>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${statusLabelClass[org.status] || ''}`}>
                          {statusLabel[org.status] || org.status}
                        </span>
                      </td>
                      <td>{org.isActive ? 'Active' : 'Inactive'}</td>
                      <td>{formatDate(org.updatedAt)}</td>
                      <td>
                        <div className={styles.actions}>
                          <Button
                            size="sm"
                            variant={manageOrgId === org.id ? 'primary' : 'outline'}
                            onClick={() => openManageModal(org.id)}
                          >
                            Manage
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {showCreateModal ? (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContainer} onClick={(event) => event.stopPropagation()}>
            <Card className={styles.modalCard}>
              <CardHeader
                actions={
                  <Button variant="ghost" onClick={() => setShowCreateModal(false)} type="button">
                    Close
                  </Button>
                }
              >
                <CardTitle>New organization</CardTitle>
              </CardHeader>
              <CardContent className={styles.modalContent}>
                <form className={styles.modalForm} onSubmit={handleCreateSubmit}>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label htmlFor="create-name">Organization name</label>
                      <Input
                        id="create-name"
                        required
                        value={createState.name}
                        onChange={(event) =>
                          setCreateState((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="create-country">Country</label>
                      <Input
                        id="create-country"
                        required
                        value={createState.country}
                        onChange={(event) =>
                          setCreateState((prev) => ({ ...prev, country: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="create-contact">Primary contact email</label>
                    <Input
                      id="create-contact"
                      required
                      type="email"
                      value={createState.contactEmail}
                      onChange={(event) =>
                        setCreateState((prev) => ({ ...prev, contactEmail: event.target.value }))
                      }
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="org-status">Initial status</label>
                    <select
                      id="org-status"
                      value={createState.status}
                      onChange={(event) =>
                        setCreateState((prev) => ({ ...prev, status: event.target.value }))
                      }
                    >
                      {statusOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <span className={styles.muted}>
                      Approving will immediately activate all admin accounts created for this
                      organization.
                    </span>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="org-notes">Notes (internal)</label>
                    <textarea
                      id="org-notes"
                      className={styles.textarea}
                      value={createState.message}
                      onChange={(event) =>
                        setCreateState((prev) => ({ ...prev, message: event.target.value }))
                      }
                      placeholder="Optional notes about onboarding, contract terms, or integrations."
                    />
                  </div>
                  <div className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      id="create-admin"
                      checked={createState.createAdmin}
                      onChange={(event) =>
                        setCreateState((prev) => ({ ...prev, createAdmin: event.target.checked }))
                      }
                    />
                    <label htmlFor="create-admin">Create an initial admin account</label>
                  </div>
                  {createState.createAdmin ? (
                    <>
                      <div className={styles.formGroup}>
                        <label htmlFor="create-admin-email">Admin email</label>
                        <Input
                          id="create-admin-email"
                          required
                          type="email"
                          value={createState.adminEmail}
                          onChange={(event) =>
                            setCreateState((prev) => ({
                              ...prev,
                              adminEmail: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label htmlFor="create-admin-name">Admin display name</label>
                        <Input
                          id="create-admin-name"
                          required
                          value={createState.adminDisplayName}
                          onChange={(event) =>
                            setCreateState((prev) => ({
                              ...prev,
                              adminDisplayName: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label htmlFor="create-admin-password">Admin password</label>
                        <Input
                          id="create-admin-password"
                          required
                          type="password"
                          value={createState.adminPassword}
                          onChange={(event) =>
                            setCreateState((prev) => ({
                              ...prev,
                              adminPassword: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </>
                  ) : null}
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating…' : 'Create organization'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {showManageModal && modalOrgSummary ? (
        <div className={styles.modalBackdrop} onClick={closeManageModal}>
          <div className={styles.modalContainer} onClick={(event) => event.stopPropagation()}>
            <Card className={styles.modalCard}>
              <CardHeader
                actions={
                  <Button variant="ghost" onClick={closeManageModal} type="button">
                    Close
                  </Button>
                }
              >
                <CardTitle>Manage “{modalOrgSummary.name || 'Organization'}”</CardTitle>
                <p className={styles.modalSubtitle}>
                  {modalOrgSummary.country || '—'} · {modalOrgSummary.contactEmail || '—'}{' '}
                  {modalOrgSummary.isActive ? '· Active' : '· Inactive'}
                </p>
              </CardHeader>
              <CardContent className={styles.modalContent}>
                <section className={styles.modalSection}>
                  <h4>Organization details</h4>
                  <form className={styles.modalForm} onSubmit={handleEditSubmit}>
                    <div className={styles.formGroup}>
                      <label htmlFor="edit-name">Organization name</label>
                      <Input
                        id="edit-name"
                        required
                        value={editState?.name || ''}
                        onChange={(event) =>
                          setEditState((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="edit-country">Country</label>
                      <Input
                        id="edit-country"
                        required
                        value={editState?.country || ''}
                        onChange={(event) =>
                          setEditState((prev) => ({ ...prev, country: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="edit-contact">Primary contact email</label>
                      <Input
                        id="edit-contact"
                        required
                        type="email"
                        value={editState?.contactEmail || ''}
                        onChange={(event) =>
                          setEditState((prev) => ({ ...prev, contactEmail: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="edit-status">Status</label>
                      <select
                        id="edit-status"
                        value={editState?.status || 'pending'}
                        onChange={(event) =>
                          setEditState((prev) => ({ ...prev, status: event.target.value }))
                        }
                      >
                        {statusOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        id="edit-active"
                        checked={editState?.isActive || false}
                        onChange={(event) =>
                          setEditState((prev) => ({ ...prev, isActive: event.target.checked }))
                        }
                      />
                      <label htmlFor="edit-active">Organization is active</label>
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="edit-notes">Internal notes</label>
                      <textarea
                        id="edit-notes"
                        className={styles.textarea}
                        value={editState?.message || ''}
                        onChange={(event) =>
                          setEditState((prev) => ({ ...prev, message: event.target.value }))
                        }
                      />
                    </div>
                    {manageFeedback ? <div className={styles.feedback}>{manageFeedback}</div> : null}
                    {manageError ? <div className={styles.error}>{manageError}</div> : null}
                    <div className={styles.modalActions}>
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? 'Saving…' : 'Save changes'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          quickUpdate({ status: 'approved', isActive: true })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          quickUpdate({ status: 'suspended', isActive: false })
                        }
                      >
                        Suspend
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={updateMutation.isPending}
                        onClick={() =>
                          quickUpdate({ status: 'rejected', isActive: false })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </form>
                </section>

                <section className={styles.modalSection}>
                  <div className={styles.modalSectionHeader}>
                    <h4>Admin accounts</h4>
                    <span className={styles.muted}>
                      {adminsQuery.isFetching ? 'Refreshing…' : `${manageAdmins.length} total`}
                    </span>
                  </div>
                  {adminsQuery.isLoading ? (
                    <div className={styles.modalEmpty}>Loading admin accounts…</div>
                  ) : manageAdmins.length === 0 ? (
                    <div className={styles.modalEmpty}>
                      No admin accounts yet. Create one below to grant access.
                    </div>
                  ) : (
                    <table className={styles.adminTable}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Status</th>
                          <th>Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manageAdmins.map((admin) => (
                          <tr key={admin.id}>
                            <td>{admin.displayName || '—'}</td>
                            <td>{admin.email}</td>
                            <td>{admin.isActive ? 'Active' : 'Inactive'}</td>
                            <td>
                              {admin.createdAt ? new Date(admin.createdAt).toLocaleString() : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                <section className={styles.modalSection}>
                  <h4>Create admin account</h4>
                  <form className={styles.modalForm} onSubmit={handleModalAdminSubmit}>
                    <div className={styles.formGroup}>
                      <label htmlFor="modal-admin-email">Admin email</label>
                      <Input
                        id="modal-admin-email"
                        required
                        type="email"
                        value={adminDraft.email}
                        onChange={(event) =>
                          setAdminDraft((prev) => ({ ...prev, email: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label htmlFor="modal-admin-name">Display name</label>
                      <Input
                        id="modal-admin-name"
                        required
                        value={adminDraft.displayName}
                        onChange={(event) =>
                          setAdminDraft((prev) => ({ ...prev, displayName: event.target.value }))
                        }
                      />
                    </div>
                    <div className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        id="modal-activate-org"
                        checked={adminDraft.activateOrg}
                        onChange={(event) =>
                          setAdminDraft((prev) => ({
                            ...prev,
                            activateOrg: event.target.checked,
                          }))
                        }
                      />
                      <label htmlFor="modal-activate-org">
                        Reactivate this organization if it is currently inactive
                      </label>
                    </div>
                    {adminFeedback ? <div className={styles.feedback}>{adminFeedback}</div> : null}
                    {adminError ? <div className={styles.error}>{adminError}</div> : null}
                    <Button type="submit" disabled={adminCreateMutation.isPending}>
                      {adminCreateMutation.isPending ? 'Creating…' : 'Create admin'}
                    </Button>
                  </form>
                </section>

                <section className={styles.modalSection}>
                  <h4>Delete organization</h4>
                  <p className={styles.muted}>
                    Removing this organization permanently deletes all accounts, studies, forms,
                    tasks, and patient records associated with it.
                  </p>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={deleteConfirm}
                      onChange={(event) => setDeleteConfirm(event.target.checked)}
                    />
                    <span>I understand this action cannot be undone.</span>
                  </label>
                  {deleteError ? <div className={styles.error}>{deleteError}</div> : null}
                  <Button
                    type="button"
                    className={styles.dangerButton}
                    variant="outline"
                    disabled={!deleteConfirm || deleteMutation.isPending}
                    onClick={() => manageOrgId && deleteMutation.mutate(manageOrgId)}
                  >
                    {deleteMutation.isPending ? 'Deleting…' : 'Delete organization'}
                  </Button>
                </section>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
};

export default PlatformOrganizations;
